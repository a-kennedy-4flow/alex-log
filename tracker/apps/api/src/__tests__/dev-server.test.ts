// The development server over real HTTP.
//
// The handler tests call `handle` directly so they never see a preflight. That
// is how a header the client sends reached the browser without being allowed:
// every check passed because none of them went over the wire. These do.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { loadCatalogue } from '@tracker/fixtures'
import { loadSamples, type Sample } from '@tracker/fixtures/samples'

import { createDevServer, DEV_HEADERS } from '../dev-server'
import { jiraPerRequest } from '../jira-dev'
import { FakeJira, PlainCipher } from '../jira-fake'
import { MemoryRepository, periodOf } from '../repository'
import { resetCatalogueCache } from '../handlers'
import { DEV_JIRA_AS_USER, DEV_JIRA_CLIENT_ID } from '@tracker/core'

const ORIGIN = 'http://localhost:5173'

/** Every header the browser client sends in place of a token. */
const SENT = Object.values(DEV_HEADERS)

const catalogue = await loadCatalogue()
const samples = await loadSamples()
const complete = samples.find((s) => s.statusMessage === 'Your project tracker is completed!')!

let server: Server
let base: string

function as(sub: string, groups = ''): Record<string, string> {
  return {
    origin: ORIGIN,
    [DEV_HEADERS.sub]: sub,
    [DEV_HEADERS.email]: `${sub}@4flow.com`,
    [DEV_HEADERS.firstName]: 'Alexander',
    [DEV_HEADERS.lastName]: 'Kennedy',
    [DEV_HEADERS.groups]: groups,
  }
}

function preflight(path: string, headers: string[]): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'OPTIONS',
    headers: {
      origin: ORIGIN,
      'access-control-request-method': 'GET',
      'access-control-request-headers': headers.join(','),
    },
  })
}

beforeAll(async () => {
  resetCatalogueCache()
  const repository = new MemoryRepository()
  const updatedAt = '2026-09-01T10:00:00.000Z'
  await repository.putCatalogue({ version: updatedAt, updatedAt, data: catalogue })
  server = createDevServer({ repository, now: () => new Date(updatedAt) })
  // Port zero lets the operating system pick so the test never fights the
  // server a developer already has running.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('the preflight', () => {
  it('allows every header the browser client sends', async () => {
    const response = await preflight('/api/catalogue', SENT)
    expect(response.status).toBe(204)
    const allowed = (response.headers.get('access-control-allow-headers') ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
    for (const header of SENT) expect(allowed, header).toContain(header)
  })

  it('allows a header nobody has thought of yet', async () => {
    // The echo is what stops the allow list drifting behind the client again.
    const response = await preflight('/api/catalogue', ['content-type', 'x-dev-something-new'])
    expect(response.headers.get('access-control-allow-headers')).toContain('x-dev-something-new')
  })

  it('answers with the calling origin', async () => {
    const response = await preflight('/api/catalogue', SENT)
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('allows the methods the client uses', async () => {
    const allowed = (await preflight('/api/me', SENT)).headers.get('access-control-allow-methods')
    // DELETE is what unlinking Jira sends. Its preflight is not a simple one.
    for (const method of ['GET', 'PUT', 'POST', 'DELETE']) expect(allowed).toContain(method)
  })

  it('lets the browser read the file name off a download', async () => {
    const response = await preflight('/api/timesheets/2026-08/export', SENT)
    expect(response.headers.get('access-control-expose-headers')).toContain('content-disposition')
  })
})

describe('a request carrying those headers', () => {
  it('loads the cost centre list', async () => {
    const response = await fetch(`${base}/api/catalogue`, { headers: as('alex') })
    expect(response.status).toBe(200)
    const value = (await response.json()) as { projects: unknown[] }
    expect(value.projects).toHaveLength(catalogue.projects.length)
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('reads the caller off the headers', async () => {
    const response = await fetch(`${base}/api/me`, { headers: as('alex') })
    expect(await response.json()).toMatchObject({
      email: 'alex@4flow.com',
      firstName: 'Alexander',
      lastName: 'Kennedy',
    })
  })

  it('keeps two callers apart', async () => {
    await fetch(`${base}/api/me`, {
      method: 'PUT',
      headers: { ...as('one'), 'content-type': 'application/json' },
      body: JSON.stringify({ location: '01_DE_Berlin', workPercent: 80 }),
    })
    const other = await (await fetch(`${base}/api/me`, { headers: as('two') })).json()
    expect((other as { workPercent: number | null }).workPercent).toBeNull()
  })
})

describe('the backoffice group over the wire', () => {
  it('refuses a catalogue upload from an ordinary user', async () => {
    const response = await fetch(`${base}/api/admin/catalogue`, {
      method: 'PUT',
      headers: { ...as('alex'), 'content-type': 'application/json' },
      body: JSON.stringify(catalogue),
    })
    expect(response.status).toBe(403)
  })

  it('accepts one from a member of the group', async () => {
    const response = await fetch(`${base}/api/admin/catalogue`, {
      method: 'PUT',
      headers: { ...as('backoffice', 'backoffice'), 'content-type': 'application/json' },
      body: JSON.stringify(catalogue),
    })
    expect(response.status).toBe(200)
  })
})

describe('the download over the wire', () => {
  const period = periodOf(complete.year, complete.month)

  function halfDaysOf(sample: Sample) {
    return sample.rows.map((r) => ({
      date: r.date,
      half: (r.row - 5) % 2,
      workdayId: r.workdayId === null ? null : String(r.workdayId),
      specification: r.specification,
      days: r.days,
      location: r.location,
      tasks: r.tasks === null ? null : String(r.tasks),
    }))
  }

  it('arrives as a workbook and not as base64 text', async () => {
    await fetch(`${base}/api/me`, {
      method: 'PUT',
      headers: { ...as('alex'), 'content-type': 'application/json' },
      body: JSON.stringify({ location: complete.location }),
    })
    await fetch(`${base}/api/timesheets/${period}`, {
      method: 'PUT',
      headers: { ...as('alex'), 'content-type': 'application/json' },
      body: JSON.stringify({
        location: complete.location,
        halfDays: halfDaysOf(complete),
        adjustedWorkDays: complete.adjustedWorkDays,
      }),
    })

    const response = await fetch(`${base}/api/timesheets/${period}/export`, {
      method: 'POST',
      headers: as('alex'),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('.xlsm')

    const bytes = new Uint8Array(await response.arrayBuffer())
    // A zip starts with PK. Base64 leaking through would start with UEs.
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    expect(bytes.length).toBeGreaterThan(4000)
  })
})

// Reading the month of another Atlassian account. Development alone.
//
// The account is a header so the browser can change it without this server
// restarting. A server of its own here because the one above registers no Jira
// app at all which is how a deployment with none behaves.
describe('the Jira account a header names', () => {
  let jiraServer: Server
  let at: string

  beforeAll(async () => {
    const repository = new MemoryRepository()
    const now = () => new Date('2026-09-08T12:00:00.000Z')
    jiraServer = createDevServer(
      { repository, now },
      // Null is the double answering. It serves one fixed month of one fixed
      // account so it reads no other one.
      jiraPerRequest(
        {
          repository,
          jira: new FakeJira(),
          cipher: new PlainCipher(),
          now,
          clientId: DEV_JIRA_CLIENT_ID,
          redirectUri: 'http://localhost:5173/jira/callback',
          siteUrl: 'https://4flow.atlassian.net',
        },
        null,
      ),
    )
    await new Promise<void>((resolve) => jiraServer.listen(0, '127.0.0.1', resolve))
    at = `http://127.0.0.1:${(jiraServer.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => jiraServer.close(() => resolve()))
  })

  it('answers the route as usual where no header names one', async () => {
    const response = await fetch(`${at}/api/jira/link`, { headers: as('alex') })
    expect(response.status).toBe(200)
    const state = (await response.json()) as { clientId: string }
    expect(state.clientId).toBe(DEV_JIRA_CLIENT_ID)
  })

  it('refuses an id no Atlassian account could have', async () => {
    // The id reaches JQL inside quotes. Reading the consenting account instead
    // would read as the header never having been sent.
    const response = await fetch(`${at}/api/jira/link`, {
      headers: { ...as('alex'), [DEV_JIRA_AS_USER]: 'alex" OR key = "X' },
    })
    expect(response.status).toBe(400)
    const problem = (await response.json()) as { error: string }
    expect(problem.error).toContain('not an Atlassian account id')
  })

  it('says so where the double is what would answer', async () => {
    const response = await fetch(`${at}/api/jira/link`, {
      headers: { ...as('alex'), [DEV_JIRA_AS_USER]: '712020:0cecee67' },
    })
    expect(response.status).toBe(400)
    const problem = (await response.json()) as { error: string }
    expect(problem.error).toContain('JIRA_CLIENT_SECRET')
  })

  it('allows the header on a preflight', async () => {
    const response = await fetch(`${at}/api/jira/completed/2026-08`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': DEV_JIRA_AS_USER,
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toContain(DEV_JIRA_AS_USER)
  })
})
