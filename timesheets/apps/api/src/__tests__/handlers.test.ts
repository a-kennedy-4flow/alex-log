// The API surface end to end against the in memory repository.
//
// The export route is checked against the completed workbook so the bytes the
// API returns are the bytes the writer tests already verified.

import { beforeEach, describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { loadCatalogue } from '@timesheets/fixtures'
import { loadSamples, type Sample } from '@timesheets/fixtures/samples'

import { handle, resetCatalogueCache, type ApiRequest, type Caller, type Deps } from '../handlers'
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
    expect(JSON.parse(response.body).projects).toBe(catalogue.projects.length)
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

  it('returns a workbook for a clean month', async () => {
    await call('PUT', `/api/timesheets/${period}`, {
      body: { location: complete.location, halfDays: halfDaysOf(complete), adjustedWorkDays: complete.adjustedWorkDays },
    })
    const response = await call('POST', `/api/timesheets/${period}/export`)
    expect(response.status).toBe(200)
    expect(response.isBase64).toBe(true)
    expect(response.headers['content-disposition']).toContain(
      'Kennedy.Alexander_2026_08_projecttracker_DE_BERLIN.xlsm',
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
