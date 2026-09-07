// The API.
//
// Every route runs against a `Repository` and a `Caller` so nothing here knows
// about Lambda. The Lambda adapter and the local development server both call
// `handle`.
//
// A timesheet is validated here as well as in the browser. Because a) the
// browser is not trusted. b) the export must never carry a sheet the tracker
// would reject. c) both sides run the same code from `@tracker/core` so the
// two verdicts cannot drift.

import {
  buildMonth,
  catalogue,
  hasErrors,
  isLocale,
  offeredWorkdayIds,
  setCatalogue,
  targetDays,
  validate,
  type CatalogueInput,
  type HalfDay,
  type UserProfile,
} from '@tracker/core'
import { writeTracker, ExportBlocked } from '@tracker/xlsm-writer'

import {
  PERIOD,
  splitPeriod,
  type Repository,
  type StoredSheet,
} from './repository'

export interface Caller {
  sub: string
  email: string
  firstName: string
  lastName: string
  /** Cognito groups. Backoffice may replace the catalogue. */
  groups: string[]
}

export interface ApiRequest {
  method: string
  path: string
  body: string | null
  caller: Caller | null
}

export interface ApiResponse {
  status: number
  headers: Record<string, string>
  /** Base64 when `isBase64` is set. */
  body: string
  isBase64?: boolean
}

export interface Deps {
  repository: Repository
  now: () => Date
}

const JSON_HEADERS = { 'content-type': 'application/json' }
const BACKOFFICE_GROUP = 'backoffice'

/** Nobody works on more Jira projects than this in six months. */
const MAX_JIRA_PROJECTS = 50

export function json(status: number, value: unknown): ApiResponse {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(value) }
}

export function problem(status: number, message: string, extra: object = {}): ApiResponse {
  return json(status, { error: message, ...extra })
}

/* ---------- the catalogue cache ---------- */

// Lambda keeps a warm container between calls so the catalogue is decompressed
// once per container rather than once per request. The version guards the cache
// so a backoffice upload takes effect without a redeploy.
let cachedVersion: string | null = null

async function useCatalogue(deps: Deps): Promise<{ version: string; updatedAt: string } | null> {
  const stored = await deps.repository.getCatalogue()
  if (!stored) return null
  if (cachedVersion !== stored.version) {
    setCatalogue(stored.data)
    cachedVersion = stored.version
  }
  return { version: stored.version, updatedAt: stored.updatedAt }
}

/** Test hook. A new process would otherwise inherit a stale cache. */
export function resetCatalogueCache(): void {
  cachedVersion = null
}

/**
 * Names the first field an uploaded catalogue leaves out. Null means it is
 * whole.
 *
 * The workbook is parsed in the browser so this route is the only guard. Every
 * field below is one the editor reads later. Storing a body without them
 * replaces a working catalogue with one that answers nothing.
 */
function missingFromCatalogue(data: CatalogueInput): string | null {
  const filled = (value: unknown): boolean =>
    Array.isArray(value) ? value.length > 0 : Object.keys(value ?? {}).length > 0

  if (!filled(data.projects)) return 'the catalogue needs a project list'
  if (!filled(data.locations)) return 'the catalogue needs a location list'
  if (!filled(data.holidays)) return 'the catalogue needs a holiday list per location'
  if (!filled(data.specifications)) return 'the catalogue needs the specification lists'
  if (!filled(data.timeValues)) return 'the catalogue needs the day values column K accepts'
  return null
}


/* ---------- profile ---------- */

function defaultProfile(caller: Caller): UserProfile {
  // Cognito supplies the name and the email. The user sets the rest.
  return {
    email: caller.email,
    firstName: caller.firstName,
    lastName: caller.lastName,
    location: null,
    entity: null,
    businessLine: null,
    workPercent: null,
    locale: null,
    // The user is opted in and the wizard offers the switch on the way through.
    // A reminder nobody asked for is the reason a sender gets filtered so the
    // switch is put in front of them rather than buried.
    remindByEmail: true,
    hoursPerDay: null,
    jiraProjects: {},
  }
}

/**
 * Checks a field the catalogue owns. Null clears it. Anything else has to be
 * one of the values the workbook itself carries. Because a) the tracker rejects
 * a value it does not know. b) the dropdown offers nothing else so only a
 * handwritten request can reach here. c) a bad location lands in cell A2 of the
 * export where it is no longer cheap to find.
 */
function readCatalogueField(value: unknown, allowed: readonly string[]): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !allowed.includes(value)) return undefined
  return value
}

function readProfile(body: unknown, caller: Caller): UserProfile | string {
  if (typeof body !== 'object' || body === null) return 'the body must be an object'
  const input = body as Partial<UserProfile>
  const percent = input.workPercent
  if (percent !== null && percent !== undefined) {
    if (typeof percent !== 'number' || percent < 0 || percent > 100) {
      return 'workPercent must be a number between 0 and 100'
    }
  }
  if (input.locale !== null && input.locale !== undefined && !isLocale(input.locale)) {
    return 'locale must be one of the shipped languages'
  }

  // A day cannot be nothing and nobody works a twenty four hour one. The bound
  // exists because this number divides the hours of every Jira ticket.
  const hours = input.hoursPerDay ?? null
  if (hours !== null && (typeof hours !== 'number' || hours <= 0 || hours > 24)) {
    return 'hoursPerDay must be a number between 0 and 24'
  }

  const location = readCatalogueField(
    input.location,
    catalogue.locations.map((l) => l.code),
  )
  if (location === undefined) return 'location must be one of the catalogue locations'

  const entity = readCatalogueField(
    input.entity,
    catalogue.entities.map((e) => e.entity),
  )
  if (entity === undefined) return 'entity must be one of the catalogue entities'

  // The dropdown writes the name rather than the key so the stored value is
  // what the project rows of the workbook carry.
  const businessLine = readCatalogueField(
    input.businessLine,
    catalogue.businessLines.map((b) => b.name),
  )
  if (businessLine === undefined) return 'businessLine must be one of the catalogue business lines'

  return {
    // The identity fields come from the token and never from the body.
    email: caller.email,
    firstName: caller.firstName,
    lastName: caller.lastName,
    location,
    entity,
    businessLine,
    workPercent: percent ?? null,
    locale: input.locale ?? null,
    remindByEmail: input.remindByEmail !== false,
    hoursPerDay: hours,
    jiraProjects: readJiraProjects(input.jiraProjects),
  }
}

/**
 * Checks the Jira project map. Every key and every value must be a string and
 * the map is small. Because a) it arrives from the browser like anything else.
 * b) a Workday ID that is not offered would be written into column I of the
 * export. c) an unbounded map would grow the profile item without limit.
 */
function readJiraProjects(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  const offered = new Set(offeredWorkdayIds(catalogue))
  const out: Record<string, string> = {}
  for (const [project, workdayId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof workdayId !== 'string' || !offered.has(workdayId)) continue
    if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(project)) continue
    out[project] = workdayId
    if (Object.keys(out).length >= MAX_JIRA_PROJECTS) break
  }
  return out
}

/* ---------- timesheets ---------- */

function readHalfDays(value: unknown): HalfDay[] | string {
  if (!Array.isArray(value)) return 'halfDays must be an array'
  const out: HalfDay[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return 'every half day must be an object'
    const h = raw as Partial<HalfDay>
    if (typeof h.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) {
      return 'every half day needs an ISO date'
    }
    if (h.half !== 0 && h.half !== 1) return 'half must be 0 or 1'
    if (h.days !== null && h.days !== undefined && h.days !== 0.5 && h.days !== 1) {
      return 'days must be 0.5 or 1 or null'
    }
    out.push({
      date: h.date,
      half: h.half,
      workdayId: h.workdayId ?? null,
      specification: h.specification ?? null,
      // A sheet saved before this field existed reads as a confirmed pick.
      specificationIsDefault: h.specificationIsDefault === true,
      days: h.days ?? null,
      location: h.location ?? null,
      tasks: h.tasks ?? null,
    })
  }
  return out
}

async function requireProfile(deps: Deps, caller: Caller): Promise<UserProfile> {
  return (await deps.repository.getProfile(caller.sub)) ?? defaultProfile(caller)
}

/* ---------- routing ---------- */

export async function handle(request: ApiRequest, deps: Deps): Promise<ApiResponse> {
  const { method, path } = request

  if (method === 'GET' && path === '/api/health') {
    return json(200, { ok: true })
  }

  const caller = request.caller
  if (!caller) return problem(401, 'not signed in')

  let body: unknown = null
  if (request.body) {
    try {
      body = JSON.parse(request.body)
    } catch {
      return problem(400, 'the body is not valid JSON')
    }
  }

  /* the catalogue */
  if (method === 'GET' && path === '/api/catalogue') {
    const stored = await deps.repository.getCatalogue()
    if (!stored) return problem(503, 'no catalogue has been uploaded yet')
    await useCatalogue(deps)
    return json(200, { version: stored.version, updatedAt: stored.updatedAt, ...stored.data })
  }

  if (method === 'PUT' && path === '/api/admin/catalogue') {
    if (!caller.groups.includes(BACKOFFICE_GROUP)) {
      return problem(403, 'only backoffice may replace the catalogue')
    }
    if (typeof body !== 'object' || body === null) return problem(400, 'the body must be an object')
    const data = body as CatalogueInput
    const missing = missingFromCatalogue(data)
    if (missing !== null) return problem(400, missing)
    const updatedAt = deps.now().toISOString()
    // Each upload replaces what is there. The version busts the warm cache.
    await deps.repository.putCatalogue({ version: updatedAt, updatedAt, data })
    resetCatalogueCache()
    return json(200, { version: updatedAt, updatedAt, projects: offeredWorkdayIds(data).length })
  }

  /* the profile */
  if (method === 'GET' && path === '/api/me') {
    return json(200, await requireProfile(deps, caller))
  }

  if (method === 'PUT' && path === '/api/me') {
    if (!(await useCatalogue(deps))) return problem(503, 'no catalogue has been uploaded yet')
    const profile = readProfile(body, caller)
    if (typeof profile === 'string') return problem(400, profile)
    await deps.repository.putProfile(caller.sub, profile)
    return json(200, profile)
  }

  /* timesheets */
  if (method === 'GET' && path === '/api/timesheets') {
    return json(200, { sheets: await deps.repository.listSheets(caller.sub) })
  }

  const sheetMatch = path.match(/^\/api\/timesheets\/([^/]+)(\/export)?$/)
  if (sheetMatch) {
    const period = sheetMatch[1] as string
    const isExport = sheetMatch[2] === '/export'
    if (!PERIOD.test(period)) return problem(400, 'the period must read as yyyy-mm')

    if (method === 'GET' && !isExport) {
      const sheet = await deps.repository.getSheet(caller.sub, period)
      if (!sheet) return problem(404, 'no sheet saved for that month')
      return json(200, sheet)
    }

    if (method === 'PUT' && !isExport) {
      if (typeof body !== 'object' || body === null) {
        return problem(400, 'the body must be an object')
      }
      const halfDays = readHalfDays((body as { halfDays?: unknown }).halfDays)
      if (typeof halfDays === 'string') return problem(400, halfDays)
      const profile = await requireProfile(deps, caller)
      const { year, month } = splitPeriod(period)
      const override = (body as { adjustedWorkDays?: unknown }).adjustedWorkDays
      if (override !== null && override !== undefined) {
        if (typeof override !== 'number' || override < 0 || override > 31) {
          return problem(400, 'adjustedWorkDays must be a number between 0 and 31')
        }
      }
      const sheet: StoredSheet = {
        year,
        month,
        location: (body as { location?: string }).location ?? profile.location ?? '',
        halfDays,
        adjustedWorkDays: (override as number | undefined) ?? null,
        updatedAt: deps.now().toISOString(),
        // An edit invalidates whatever was downloaded before it. The month is
        // owed again so the reminder must be free to name it.
        exportedAt: null,
      }
      await deps.repository.putSheet(caller.sub, period, sheet)
      return json(200, sheet)
    }

    if (method === 'POST' && isExport) {
      if (!(await useCatalogue(deps))) return problem(503, 'no catalogue has been uploaded yet')
      const sheet = await deps.repository.getSheet(caller.sub, period)
      if (!sheet) return problem(404, 'no sheet saved for that month')
      const profile = await requireProfile(deps, caller)
      const location = sheet.location || profile.location
      if (!location) return problem(400, 'set your location before exporting')

      const workingDays = buildMonth(sheet.year, sheet.month, location).filter(
        (d) => !d.nonWorking,
      ).length
      const effective = targetDays(workingDays, profile.workPercent, sheet.adjustedWorkDays)

      try {
        const result = writeTracker({
          firstName: profile.firstName,
          lastName: profile.lastName,
          location,
          year: sheet.year,
          month: sheet.month,
          // Tracker cell B8. Null leaves it empty which means a full month.
          adjustedWorkDays: effective === workingDays ? null : effective,
          halfDays: sheet.halfDays,
          createdIso: deps.now().toISOString(),
        })
        // Written only once the workbook exists so a blocked export leaves the
        // month owed. This is what the monthly reminder reads.
        const exportedAt = deps.now().toISOString()
        await deps.repository.putSheet(caller.sub, period, { ...sheet, exportedAt })
        return {
          status: 200,
          headers: {
            'content-type': 'application/vnd.ms-excel.sheet.macroEnabled.12',
            'content-disposition': `attachment; filename="${result.filename}"`,
          },
          body: Buffer.from(result.bytes).toString('base64'),
          isBase64: true,
        }
      } catch (error) {
        if (error instanceof ExportBlocked) {
          return problem(422, 'the timesheet holds errors', { codes: error.codes })
        }
        throw error
      }
    }
  }

  /* validation without writing a file */
  const checkMatch = path.match(/^\/api\/timesheets\/([^/]+)\/check$/)
  if (method === 'POST' && checkMatch) {
    const period = checkMatch[1] as string
    if (!PERIOD.test(period)) return problem(400, 'the period must read as yyyy-mm')
    if (!(await useCatalogue(deps))) return problem(503, 'no catalogue has been uploaded yet')
    if (typeof body !== 'object' || body === null) return problem(400, 'the body must be an object')
    const halfDays = readHalfDays((body as { halfDays?: unknown }).halfDays)
    if (typeof halfDays === 'string') return problem(400, halfDays)
    const profile = await requireProfile(deps, caller)
    const { year, month } = splitPeriod(period)
    const location = (body as { location?: string }).location ?? profile.location
    const days = buildMonth(year, month, location ?? null)
    const override = (body as { adjustedWorkDays?: number | null }).adjustedWorkDays ?? null
    const target = targetDays(
      days.filter((d) => !d.nonWorking).length,
      profile.workPercent,
      override,
    )
    const issues = validate({
      halfDays,
      days,
      target,
      location: location ?? null,
      entity: profile.entity,
    })
    return json(200, { issues, blocked: hasErrors(issues), target })
  }

  return problem(404, 'no such route')
}
