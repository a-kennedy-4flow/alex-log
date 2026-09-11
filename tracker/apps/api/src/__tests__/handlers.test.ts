// The API surface end to end against the in memory repository.
//
// The export route is checked against the completed workbook so the bytes the
// API returns are the bytes the writer tests already verified.

import { beforeEach, describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { loadCatalogue } from '@tracker/fixtures'
import { loadSamples, type Sample } from '@tracker/fixtures/samples'

import { handle, resetCatalogueCache, type ApiRequest, type Caller, type Deps } from '../handlers'
import { MemoryMailer } from '../mail'
import { MemoryRepository, expiryFor, periodOf } from '../repository'

const catalogue = await loadCatalogue()
const samples = await loadSamples()
const complete = samples.find((s) => s.statusMessage === 'Your project tracker is completed!')!
const invalid = samples.find((s) => (s.entryMessage ?? '') !== '')!

const NOW = new Date('2026-09-01T10:00:00.000Z')

const USER: Caller = {
  sub: 'user-1',
  email: 'alexander.kennedy@4flow.com',
  firstName: 'Alexander',
  lastName: 'Kennedy',
  groups: [],
}
const ADMIN: Caller = { ...USER, sub: 'admin-1', groups: ['backoffice'] }
const OTHER: Caller = { ...USER, sub: 'user-2' }

let deps: Deps

function call(
  method: string,
  path: string,
  options: { body?: unknown; caller?: Caller | null } = {},
): Promise<ReturnType<typeof handle> extends Promise<infer R> ? R : never> {
  const request: ApiRequest = {
    method,
    path,
    body: options.body === undefined ? null : JSON.stringify(options.body),
    caller: options.caller === undefined ? USER : options.caller,
  }
  return handle(request, deps)
}

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

async function seedCatalogue(): Promise<void> {
  await call('PUT', '/api/admin/catalogue', { body: catalogue, caller: ADMIN })
}

beforeEach(() => {
  resetCatalogueCache()
  deps = { repository: new MemoryRepository(), now: () => NOW }
})

describe('health and auth', () => {
  it('answers health without a caller', async () => {
    expect((await call('GET', '/api/health', { caller: null })).status).toBe(200)
  })

  it('refuses every other route without a caller', async () => {
    for (const path of ['/api/me', '/api/catalogue', '/api/timesheets']) {
      expect((await call('GET', path, { caller: null })).status, path).toBe(401)
    }
  })

  it('rejects an unknown route', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(404)
  })
})

describe('the catalogue', () => {
  it('reports that nothing is uploaded yet', async () => {
    expect((await call('GET', '/api/catalogue')).status).toBe(503)
  })

  it('lets backoffice upload it', async () => {
    const response = await call('PUT', '/api/admin/catalogue', { body: catalogue, caller: ADMIN })
    expect(response.status).toBe(200)
    // It answers with what the picker will offer rather than with the rows it
    // was given. Hundreds of workday ids in the shipped list appear twice.
    const offered = new Set([
      ...catalogue.absenceTypes.map((a) => a.label),
      ...catalogue.projects.map((p) => p.workdayId),
    ])
    expect(JSON.parse(response.body).projects).toBe(offered.size)
    expect(offered.size).toBeLessThan(catalogue.projects.length)
  })

  it('refuses an ordinary user', async () => {
    const response = await call('PUT', '/api/admin/catalogue', { body: catalogue, caller: USER })
    expect(response.status).toBe(403)
  })

  it('refuses an upload with no project list', async () => {
    const response = await call('PUT', '/api/admin/catalogue', {
      body: { projects: [] },
      caller: ADMIN,
    })
    expect(response.status).toBe(400)
  })

  // The workbook is parsed in the browser so this route is the only guard.
  it.each(['locations', 'holidays', 'specifications', 'timeValues'] as const)(
    'refuses an upload with no %s and names the field',
    async (field) => {
      const response = await call('PUT', '/api/admin/catalogue', {
        body: { ...catalogue, [field]: Array.isArray(catalogue[field]) ? [] : {} },
        caller: ADMIN,
      })
      expect(response.status).toBe(400)
      expect(JSON.parse(response.body).error).toContain(
        field === 'timeValues' ? 'day values' : field.replace(/s$/, ''),
      )
    },
  )

  it('serves what was uploaded', async () => {
    await seedCatalogue()
    const response = await call('GET', '/api/catalogue')
    const value = JSON.parse(response.body)
    expect(response.status).toBe(200)
    expect(value.projects).toHaveLength(catalogue.projects.length)
    expect(value.locations).toHaveLength(catalogue.locations.length)
  })
})

describe('the profile', () => {
  // The three catalogue backed fields cannot be checked without one.
  beforeEach(seedCatalogue)

  it('falls back to the token for a user who never saved one', async () => {
    const response = await call('GET', '/api/me')
    expect(JSON.parse(response.body)).toMatchObject({
      email: USER.email,
      firstName: 'Alexander',
      location: null,
      businessLine: null,
    })
  })

  it('saves the settings the user owns', async () => {
    const response = await call('PUT', '/api/me', {
      body: { location: '01_DE_Berlin', entity: '02_GmbH', businessLine: 'software', workPercent: 80 },
    })
    expect(response.status).toBe(200)
    expect(JSON.parse((await call('GET', '/api/me')).body)).toMatchObject({
      location: '01_DE_Berlin',
      businessLine: 'software',
      workPercent: 80,
    })
  })

  it('ignores an identity the body tries to set', async () => {
    const response = await call('PUT', '/api/me', {
      body: { email: 'someone.else@4flow.com', firstName: 'Someone', location: '01_DE_Berlin' },
    })
    expect(JSON.parse(response.body)).toMatchObject({
      email: USER.email,
      firstName: 'Alexander',
    })
  })

  it('rejects a share that is not a percentage', async () => {
    expect((await call('PUT', '/api/me', { body: { workPercent: 140 } })).status).toBe(400)
    expect((await call('PUT', '/api/me', { body: { workPercent: -1 } })).status).toBe(400)
    expect((await call('PUT', '/api/me', { body: { workPercent: 'half' } })).status).toBe(400)
  })

  it('takes only a location the catalogue carries', async () => {
    expect((await call('PUT', '/api/me', { body: { location: '01_DE_Berlin' } })).status).toBe(200)
    expect((await call('PUT', '/api/me', { body: { location: 'Berlin' } })).status).toBe(400)
    expect((await call('PUT', '/api/me', { body: { location: '01_de_berlin' } })).status).toBe(400)
    expect((await call('PUT', '/api/me', { body: { location: 42 } })).status).toBe(400)
  })

  it('takes only an entity the catalogue carries', async () => {
    expect((await call('PUT', '/api/me', { body: { entity: '02_GmbH' } })).status).toBe(200)
    expect((await call('PUT', '/api/me', { body: { entity: 'GmbH' } })).status).toBe(400)
  })

  // The dropdown writes the name so the key form is not what gets stored.
  it('takes the business line name and not the key', async () => {
    const named = await call('PUT', '/api/me', { body: { businessLine: 'Corporate Services' } })
    expect(named.status).toBe(200)
    expect(JSON.parse(named.body).businessLine).toBe('Corporate Services')
    expect((await call('PUT', '/api/me', { body: { businessLine: 'CorporateServices' } })).status).toBe(400)
    expect((await call('PUT', '/api/me', { body: { businessLine: 'Consulting' } })).status).toBe(400)
  })

  it('lets any of the three be cleared', async () => {
    await call('PUT', '/api/me', {
      body: { location: '01_DE_Berlin', entity: '02_GmbH', businessLine: 'software' },
    })
    const cleared = await call('PUT', '/api/me', {
      body: { location: null, entity: null, businessLine: null },
    })
    expect(cleared.status).toBe(200)
    expect(JSON.parse(cleared.body)).toMatchObject({
      location: null,
      entity: null,
      businessLine: null,
    })
  })

  // One project is not one cost centre so a ticket is answered on its own. The
  // screen writes this for a ticket no cost centre could be found for.
  it('keeps a cost centre set against one ticket', async () => {
    const saved = await call('PUT', '/api/me', {
      body: { jiraProjects: { PLRS: '10100' }, jiraTickets: { 'PLRS-1141': '10200' } },
    })
    expect(saved.status).toBe(200)
    expect(JSON.parse(saved.body).jiraTickets).toEqual({ 'PLRS-1141': '10200' })
    expect(JSON.parse((await call('GET', '/api/me')).body).jiraTickets).toEqual({
      'PLRS-1141': '10200',
    })
  })

  it('drops a key that names no ticket and a Workday ID nothing offers', async () => {
    const saved = await call('PUT', '/api/me', {
      body: {
        jiraTickets: {
          'PLRS-1141': '10100',
          PLRS: '10100',
          'plrs-1141': '10100',
          'PLRS-1142': 'not a Workday ID',
          'PLRS-1143': 42,
        },
      },
    })
    expect(JSON.parse(saved.body).jiraTickets).toEqual({ 'PLRS-1141': '10100' })
  })

  it('takes no ticket map at all as an empty one', async () => {
    expect(JSON.parse((await call('PUT', '/api/me', { body: {} })).body).jiraTickets).toEqual({})
  })

  it('says so when no catalogue has been uploaded', async () => {
    resetCatalogueCache()
    deps = { repository: new MemoryRepository(), now: () => NOW }
    expect((await call('PUT', '/api/me', { body: { location: '01_DE_Berlin' } })).status).toBe(503)
  })
})

describe('the catalogue version cache', () => {
  /** Counts what each request actually asks the table for. */
  class CountingRepository extends MemoryRepository {
    heads = 0
    blobs = 0

    override async getCatalogueVersion() {
      this.heads++
      return super.getCatalogueVersion()
    }

    override async getCatalogue() {
      this.blobs++
      return super.getCatalogue()
    }
  }

  let clock: Date
  let counter: CountingRepository

  beforeEach(async () => {
    resetCatalogueCache()
    clock = new Date(NOW)
    counter = new CountingRepository()
    deps = { repository: counter, now: () => clock }
    await seedCatalogue()
    counter.heads = 0
    counter.blobs = 0
  })

  /** A route that resolves against the catalogue. */
  function save() {
    return call('PUT', '/api/me', { body: { location: '01_DE_Berlin' } })
  }

  it('asks the table once and then believes itself for half a minute', async () => {
    expect((await save()).status).toBe(200)
    expect(counter.heads).toBe(1)

    clock = new Date(NOW.getTime() + 29_000)
    expect((await save()).status).toBe(200)
    expect(counter.heads).toBe(1)
  })

  it('asks again once the half minute is up', async () => {
    // The first request after a reset reads the version and the list.
    await save()
    clock = new Date(NOW.getTime() + 30_001)
    await save()
    expect(counter.heads).toBe(2)
    // The version had not moved so the list itself was not read a second time.
    expect(counter.blobs).toBe(1)
  })

  it('reads the list again only when the version has moved', async () => {
    await save()
    clock = new Date(NOW.getTime() + 30_001)
    await counter.putCatalogue({ version: 'next', updatedAt: 'next', data: catalogue })
    await save()
    expect(counter.blobs).toBe(2)
  })

  it('serves an upload from the container that took it straight away', async () => {
    await save()
    await seedCatalogue()
    const body = JSON.parse((await call('GET', '/api/catalogue')).body)
    expect(body.version).toBe(NOW.toISOString())
  })
})

describe('timesheets', () => {
  const period = periodOf(complete.year, complete.month)

  beforeEach(async () => {
    await seedCatalogue()
    await call('PUT', '/api/me', {
      body: { location: complete.location, entity: '02_GmbH' },
    })
  })

  it('rejects a period that is not a month', async () => {
    expect((await call('GET', '/api/timesheets/2026-13')).status).toBe(400)
    expect((await call('GET', '/api/timesheets/august')).status).toBe(400)
  })

  it('reports nothing saved yet', async () => {
    expect((await call('GET', `/api/timesheets/${period}`)).status).toBe(404)
  })

  it('saves and reads a month back', async () => {
    const body = {
      location: complete.location,
      halfDays: halfDaysOf(complete),
      adjustedWorkDays: complete.adjustedWorkDays,
    }
    expect((await call('PUT', `/api/timesheets/${period}`, { body })).status).toBe(200)
    const read = JSON.parse((await call('GET', `/api/timesheets/${period}`)).body)
    expect(read.halfDays).toHaveLength(complete.rows.length)
    expect(read.updatedAt).toBe(NOW.toISOString())
  })

  it('rejects a malformed half day', async () => {
    const bad = { halfDays: [{ date: 'not a date', half: 0 }] }
    expect((await call('PUT', `/api/timesheets/${period}`, { body: bad })).status).toBe(400)
    const badHalf = { halfDays: [{ date: '2026-08-01', half: 7 }] }
    expect((await call('PUT', `/api/timesheets/${period}`, { body: badHalf })).status).toBe(400)
    const badDays = { halfDays: [{ date: '2026-08-01', half: 0, days: 0.25 }] }
    expect((await call('PUT', `/api/timesheets/${period}`, { body: badDays })).status).toBe(400)
  })

  it('lists the saved months', async () => {
    await call('PUT', `/api/timesheets/${period}`, { body: { halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays } })
    const listed = JSON.parse((await call('GET', '/api/timesheets')).body)
    expect(listed.sheets).toEqual([{ period, updatedAt: NOW.toISOString() }])
  })

  it('keeps one user out of another sheet', async () => {
    await call('PUT', `/api/timesheets/${period}`, { body: { halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays } })
    expect((await call('GET', `/api/timesheets/${period}`, { caller: OTHER })).status).toBe(404)
    expect(JSON.parse((await call('GET', '/api/timesheets', { caller: OTHER })).body).sheets)
      .toEqual([])
  })

  it('keeps the download marker through a later edit', async () => {
    const body = {
      location: complete.location,
      halfDays: halfDaysOf(complete),
      adjustedWorkDays: complete.adjustedWorkDays,
    }
    await call('PUT', `/api/timesheets/${period}`, { body })
    expect(JSON.parse((await call('GET', `/api/timesheets/${period}`)).body).exportedAt).toBe(null)

    await call('POST', `/api/timesheets/${period}/export`)
    expect(JSON.parse((await call('GET', `/api/timesheets/${period}`)).body).exportedAt)
      .toBe(NOW.toISOString())

    // The month is written on every edit now so clearing the marker here would
    // unmute the reminder for a month the user has already sent.
    const later = new Date('2026-09-02T10:00:00.000Z')
    deps.now = () => later
    const stored = JSON.parse((await call('PUT', `/api/timesheets/${period}`, { body })).body)
    expect(stored.exportedAt).toBe(NOW.toISOString())

    // Sent then changed is read as the comparison rather than as a third field.
    expect(stored.updatedAt).toBe(later.toISOString())
    expect(stored.updatedAt > stored.exportedAt).toBe(true)
  })
})

describe('the check route', () => {
  const period = periodOf(complete.year, complete.month)

  beforeEach(async () => {
    await seedCatalogue()
    // A complete profile. An empty office or entity is itself reported.
    await call('PUT', '/api/me', {
      body: { location: complete.location, entity: '02_GmbH' },
    })
  })

  it('agrees with Excel that the completed sheet is clean', async () => {
    const response = await call('POST', `/api/timesheets/${period}/check`, {
      body: { halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays },
    })
    const value = JSON.parse(response.body)
    expect(value.blocked).toBe(false)
    expect(value.issues).toEqual([])
    expect(value.target).toBe(complete.target)
  })

  it('reports the faults in the part filled sheet', async () => {
    const other = periodOf(invalid.year, invalid.month)
    await call('PUT', '/api/me', {
      body: { location: invalid.location, entity: '02_GmbH' },
    })
    const response = await call('POST', `/api/timesheets/${other}/check`, {
      body: { halfDays: halfDaysOf(invalid), adjustedWorkDays: invalid.adjustedWorkDays },
    })
    const value = JSON.parse(response.body)
    expect(value.blocked).toBe(true)
    expect(value.issues.map((i: { code: string }) => i.code)).toContain('incompleteEntries')
  })
})

describe('the export', () => {
  const period = periodOf(complete.year, complete.month)

  beforeEach(async () => {
    await seedCatalogue()
    await call('PUT', '/api/me', {
      body: { location: complete.location },
    })
  })

  it('names the workbook for the month rather than for the profile', async () => {
    // The stored month wins. A move to another office must not rename every
    // month already worked. The export panel shows the same name.
    await call('PUT', `/api/timesheets/${period}`, {
      body: {
        location: '02_CZ_Pilsen',
        halfDays: halfDaysOf(complete),
        adjustedWorkDays: complete.adjustedWorkDays,
      },
    })
    const response = await call('POST', `/api/timesheets/${period}/export`)
    expect(response.status).toBe(200)
    expect(response.headers['content-disposition']).toContain('projecttracker_CZ.xlsm')
  })

  it('returns a workbook for a clean month', async () => {
    await call('PUT', `/api/timesheets/${period}`, {
      body: { location: complete.location, halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays },
    })
    const response = await call('POST', `/api/timesheets/${period}/export`)
    expect(response.status).toBe(200)
    expect(response.isBase64).toBe(true)
    expect(response.headers['content-disposition']).toContain(
      'Kennedy.Alexander_2026_08_projecttracker_DE.xlsm',
    )

    const zip = unzipSync(Buffer.from(response.body, 'base64'))
    expect(Object.keys(zip)).toContain('xl/worksheets/sheet1.xml')
    const sheet = strFromU8(zip['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain('Your project tracker is completed!')
  })

  it('refuses to export a month that was never saved', async () => {
    expect((await call('POST', `/api/timesheets/${period}/export`)).status).toBe(404)
  })

  it('refuses a sheet the tracker calls invalid', async () => {
    const other = periodOf(invalid.year, invalid.month)
    await call('PUT', '/api/me', {
      body: { location: invalid.location },
    })
    await call('PUT', `/api/timesheets/${other}`, {
      body: {
        location: invalid.location,
        halfDays: halfDaysOf(invalid),
        adjustedWorkDays: invalid.adjustedWorkDays,
      },
    })
    const response = await call('POST', `/api/timesheets/${other}/export`)
    expect(response.status).toBe(422)
    expect(JSON.parse(response.body).codes).toContain('incompleteEntries')
  })

  it('will not export another user sheet', async () => {
    await call('PUT', `/api/timesheets/${period}`, { body: { halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays } })
    expect((await call('POST', `/api/timesheets/${period}/export`, { caller: OTHER })).status)
      .toBe(404)
  })
})

describe('the delivery', () => {
  const period = periodOf(complete.year, complete.month)
  const NAME = 'Kennedy.Alexander_2026_08_projecttracker_DE.xlsm'
  let mailer: MemoryMailer

  beforeEach(async () => {
    mailer = new MemoryMailer()
    deps.mailer = mailer
    await seedCatalogue()
    await call('PUT', '/api/me', { body: { location: complete.location } })
    await call('PUT', `/api/timesheets/${period}`, {
      body: {
        location: complete.location,
        halfDays: halfDaysOf(complete),
        adjustedWorkDays: complete.adjustedWorkDays,
      },
    })
  })

  it('sends the workbook to the address on the token', async () => {
    const response = await call('POST', `/api/timesheets/${period}/email`)
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ to: USER.email, filename: NAME })

    expect(mailer.sent).toHaveLength(1)
    const message = mailer.sent[0]!
    expect(message.to).toBe(USER.email)

    // The bytes the download hands over. The writer tests already verify them.
    const file = (message.attachments ?? [])[0]!
    expect(file.filename).toBe(NAME)
    const sheet = strFromU8(unzipSync(file.bytes)['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain('Your project tracker is completed!')
  })

  it('takes no address from the request', async () => {
    await call('POST', `/api/timesheets/${period}/email`, { body: { to: 'somebody@else.com' } })
    expect(mailer.sent[0]!.to).toBe(USER.email)
  })

  it('files the month exactly as the download does', async () => {
    await call('POST', `/api/timesheets/${period}/email`)
    const stored = JSON.parse((await call('GET', `/api/timesheets/${period}`)).body)
    expect(stored.exportedAt).toBe(NOW.toISOString())
  })

  it('leaves the month owed when the send fails', async () => {
    deps.mailer = { send: () => Promise.reject(new Error('SES refused the message')) }
    expect((await call('POST', `/api/timesheets/${period}/email`)).status).toBe(502)
    const stored = JSON.parse((await call('GET', `/api/timesheets/${period}`)).body)
    expect(stored.exportedAt).toBe(null)
  })

  it('refuses the route where the deployment carries no mailer', async () => {
    delete deps.mailer
    expect((await call('POST', `/api/timesheets/${period}/email`)).status).toBe(503)
  })

  it('sends nothing for a sheet the tracker calls invalid', async () => {
    const other = periodOf(invalid.year, invalid.month)
    await call('PUT', '/api/me', { body: { location: invalid.location } })
    await call('PUT', `/api/timesheets/${other}`, {
      body: {
        location: invalid.location,
        halfDays: halfDaysOf(invalid),
        adjustedWorkDays: invalid.adjustedWorkDays,
      },
    })
    expect((await call('POST', `/api/timesheets/${other}/email`)).status).toBe(422)
    expect(mailer.sent).toHaveLength(0)
  })

  it('will not send another user sheet', async () => {
    expect((await call('POST', `/api/timesheets/${period}/email`, { caller: OTHER })).status)
      .toBe(404)
    expect(mailer.sent).toHaveLength(0)
  })
})

describe('retention', () => {
  it('expires a sheet six months after its month ends', () => {
    const seconds = expiryFor('2026-08', NOW)
    expect(new Date(seconds * 1000).toISOString()).toBe('2027-03-01T00:00:00.000Z')
  })

  it('never sets an expiry in the past', () => {
    const seconds = expiryFor('2020-01', NOW)
    expect(seconds * 1000).toBeGreaterThanOrEqual(NOW.getTime())
  })
})

describe('the working days target', () => {
  const period = periodOf(complete.year, complete.month)
  // August 2026 at 01_DE_Berlin holds 21 working days.
  const WORKING_DAYS = 21

  beforeEach(async () => {
    await seedCatalogue()
  })

  async function check(profile: object, sheet: object): Promise<number> {
    await call('PUT', '/api/me', { body: { location: complete.location, ...profile } })
    const response = await call('POST', `/api/timesheets/${period}/check`, {
      body: { halfDays: halfDaysOf(complete), ...sheet },
    })
    return JSON.parse(response.body).target
  }

  it('expects every working day when nothing is set', async () => {
    expect(await check({}, {})).toBe(WORKING_DAYS)
  })

  it('takes the contract share', async () => {
    expect(await check({ workPercent: 80 }, {})).toBe(17)
  })

  it('lets the month override the contract', async () => {
    expect(await check({ workPercent: 80 }, { adjustedWorkDays: 12 })).toBe(12)
  })

  it('rejects an override that is not a number of days', async () => {
    const response = await call('PUT', `/api/timesheets/${period}`, {
      body: { halfDays: halfDaysOf(complete), adjustedWorkDays: 99 },
    })
    expect(response.status).toBe(400)
  })

  it('keeps the override with the month it belongs to', async () => {
    await call('PUT', '/api/me', { body: { location: complete.location } })
    await call('PUT', `/api/timesheets/${period}`, {
      body: { halfDays: halfDaysOf(complete), adjustedWorkDays: 17 },
    })
    const read = JSON.parse((await call('GET', `/api/timesheets/${period}`)).body)
    expect(read.adjustedWorkDays).toBe(17)
    // A different month is untouched by it.
    await call('PUT', '/api/timesheets/2026-09', {
      body: { halfDays: [], adjustedWorkDays: null },
    })
    const other = JSON.parse((await call('GET', '/api/timesheets/2026-09')).body)
    expect(other.adjustedWorkDays).toBeNull()
  })

  it('writes the override into cell B8 of the export', async () => {
    await call('PUT', '/api/me', { body: { location: complete.location } })
    await call('PUT', `/api/timesheets/${period}`, {
      body: {
        location: complete.location,
        halfDays: halfDaysOf(complete),
        adjustedWorkDays: complete.adjustedWorkDays,
      },
    })
    const response = await call('POST', `/api/timesheets/${period}/export`)
    expect(response.status).toBe(200)
    const zip = unzipSync(Buffer.from(response.body, 'base64'))
    const sheet = strFromU8(zip['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain(`<c r="B8"><v>${complete.adjustedWorkDays}</v></c>`)
  })
})

describe('the office the month needs', () => {
  const period = periodOf(complete.year, complete.month)

  beforeEach(async () => {
    await seedCatalogue()
  })

  it('reports a missing office from the check route', async () => {
    await call('PUT', '/api/me', { body: { entity: '02_GmbH' } })
    const response = await call('POST', `/api/timesheets/${period}/check`, {
      body: { halfDays: halfDaysOf(complete) },
    })
    const value = JSON.parse(response.body)
    expect(value.blocked).toBe(true)
    expect(value.issues.map((i: { code: string }) => i.code)).toContain('locationMissing')
  })

  it('takes the office off the sheet when the profile has none', async () => {
    await call('PUT', '/api/me', { body: { entity: '02_GmbH' } })
    const response = await call('POST', `/api/timesheets/${period}/check`, {
      body: { location: complete.location, halfDays: halfDaysOf(complete) },
    })
    const value = JSON.parse(response.body)
    expect(value.issues.map((i: { code: string }) => i.code)).not.toContain('locationMissing')
  })

  it('still refuses the export outright', async () => {
    await call('PUT', '/api/me', { body: { entity: '02_GmbH' } })
    await call('PUT', `/api/timesheets/${period}`, {
      body: { halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays },
    })
    const response = await call('POST', `/api/timesheets/${period}/export`)
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).error).toContain('location')
  })
})
