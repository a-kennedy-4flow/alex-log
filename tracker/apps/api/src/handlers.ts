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
  exportLocation,
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
import { writeTracker, ExportBlocked, type ExportResult } from '@tracker/xlsm-writer'

import { deliveryMessage, WORKBOOK_TYPE, type Mailer } from './mail'

import {
  PERIOD,
  splitPeriod,
  type Repository,
  type StoredCatalogue,
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
  /**
   * Absent refuses the delivery route and leaves every other one alone. That is
   * a deployment whose domain is not delegated yet so SES has no identity to
   * send from. See `docs/mail.md`.
   */
  mailer?: Mailer
}

const JSON_HEADERS = { 'content-type': 'application/json' }
const BACKOFFICE_GROUP = 'backoffice'

/** Nobody works on more Jira projects than this in six months. */
const MAX_JIRA_PROJECTS = 50

/** How many tickets one profile may answer by hand. */
const MAX_JIRA_TICKETS = 500

/** A Jira project key. `PLRS`. */
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,29}$/

/** A Jira ticket key. `PLRS-1141`. */
const TICKET_KEY = /^[A-Z][A-Z0-9_]{0,29}-\d{1,10}$/

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

/**
 * How long a confirmed version is believed without asking the table again.
 *
 * A warm container serves several requests a second under load and each one
 * would otherwise cost a round trip to say what the last one already said.
 * Because a) the catalogue is replaced by hand a few times a year. b) the
 * upload path clears this cache in the container that served it. c) half a
 * minute is shorter than the time it takes the person who uploaded to tell
 * anybody they have.
 */
const VERSION_TTL_MS = 30_000

let cachedVersion: string | null = null
/** The answer `useCatalogue` returns while the version is still believed. */
let cachedHead: { version: string; updatedAt: string } | null = null
/** When the version was last read from the table. Milliseconds. */
let confirmedAt = 0

/** Parses a freshly read catalogue into the module and remembers its version. */
function prime(stored: StoredCatalogue, at: number): void {
  setCatalogue(stored.data)
  cachedVersion = stored.version
  cachedHead = { version: stored.version, updatedAt: stored.updatedAt }
  confirmedAt = at
}

/**
 * Makes the catalogue current for this request. Null means none is uploaded.
 *
 * The version is read on its own rather than with the list. Because a) the
 * stored blob is sixty kilobytes and over a megabyte once it is parsed. b) a
 * warm container is already holding the parsed copy so reading the blob again
 * would throw it away and rebuild the same thing. c) the projection still
 * catches an upload within `VERSION_TTL_MS`.
 */
async function useCatalogue(deps: Deps): Promise<{ version: string; updatedAt: string } | null> {
  const at = deps.now().getTime()
  if (cachedHead && at - confirmedAt < VERSION_TTL_MS) return cachedHead

  const head = await deps.repository.getCatalogueVersion()
  if (!head) return null
  if (cachedVersion !== head.version) {
    const stored = await deps.repository.getCatalogue()
    if (!stored) return null
    prime(stored, at)
    return cachedHead
  }
  cachedHead = head
  confirmedAt = at
  return head
}

/**
 * Test hook. It is also what the upload path calls so the container that took
 * the new catalogue serves it on the very next request rather than in half a
 * minute.
 */
export function resetCatalogueCache(): void {
  cachedVersion = null
  cachedHead = null
  confirmedAt = 0
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
    jiraTickets: {},
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
    jiraTickets: readJiraTickets(input.jiraTickets),
  }
}

/**
 * Checks the Jira project map. Every key and every value must be a string and
 * the map is small. Because a) it arrives from the browser like anything else.
 * b) a Workday ID that is not offered would be written into column I of the
 * export. c) an unbounded map would grow the profile item without limit.
 */
function readJiraProjects(value: unknown): Record<string, string> {
  return readJiraMap(value, PROJECT_KEY, MAX_JIRA_PROJECTS)
}

/**
 * Checks the Jira ticket map. It is held to the same rules as the project one
 * against a key naming a ticket rather than a project.
 *
 * The bound is larger because a ticket is answered once and kept. A month holds
 * forty tickets so a project map of fifty is years of them. Five hundred keeps
 * the profile item small and outlives the six months of history the tracker
 * holds.
 */
function readJiraTickets(value: unknown): Record<string, string> {
  return readJiraMap(value, TICKET_KEY, MAX_JIRA_TICKETS)
}

function readJiraMap(
  value: unknown,
  key: RegExp,
  limit: number,
): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  const offered = new Set(offeredWorkdayIds(catalogue))
  const out: Record<string, string> = {}
  for (const [name, workdayId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof workdayId !== 'string' || !offered.has(workdayId)) continue
    if (!key.test(name)) continue
    out[name] = workdayId
    if (Object.keys(out).length >= limit) break
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

/* ---------- the workbook ---------- */

interface Built {
  result: ExportResult
  profile: UserProfile
  sheet: StoredSheet
}

/**
 * The workbook of one stored month. An `ApiResponse` instead is the refusal.
 *
 * The download and the delivery both run this. Neither marks the month. That is
 * `markExported` and each route calls it at the point where the workbook has
 * actually left.
 */
async function buildWorkbook(
  period: string,
  caller: Caller,
  deps: Deps,
): Promise<Built | ApiResponse> {
  if (!(await useCatalogue(deps))) return problem(503, 'no catalogue has been uploaded yet')
  const sheet = await deps.repository.getSheet(caller.sub, period)
  if (!sheet) return problem(404, 'no sheet saved for that month')
  const profile = await requireProfile(deps, caller)
  // The same rule the export panel names the file with. `filename.ts` holds it
  // so the screen and this cannot drift apart.
  const location = exportLocation(sheet.location, profile.location)
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
    return { result, profile, sheet }
  } catch (error) {
    if (error instanceof ExportBlocked) {
      return problem(422, 'the timesheet holds errors', { codes: error.codes })
    }
    throw error
  }
}

/** Mutes the monthly reminder for a month whose workbook has gone out. */
async function markExported(
  period: string,
  caller: Caller,
  sheet: StoredSheet,
  deps: Deps,
): Promise<void> {
  await deps.repository.putSheet(caller.sub, period, {
    ...sheet,
    exportedAt: deps.now().toISOString(),
  })
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
    // The one route that hands the whole list back. It reads the blob it is
    // about to serve rather than calling `useCatalogue` which would read it a
    // second time.
    const stored = await deps.repository.getCatalogue()
    if (!stored) return problem(503, 'no catalogue has been uploaded yet')
    prime(stored, deps.now().getTime())
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

  const sheetMatch = path.match(/^\/api\/timesheets\/([^/]+)(\/export|\/email)?$/)
  if (sheetMatch) {
    const period = sheetMatch[1] as string
    const isExport = sheetMatch[2] === '/export'
    const isEmail = sheetMatch[2] === '/email'
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
      const stored = await deps.repository.getSheet(caller.sub, period)
      const sheet: StoredSheet = {
        year,
        month,
        location: (body as { location?: string }).location ?? profile.location ?? '',
        halfDays,
        adjustedWorkDays: (override as number | undefined) ?? null,
        updatedAt: deps.now().toISOString(),
        // The download mutes the reminder for that month and a later edit does
        // not unmute it. Because a) the month is written on every edit now so
        // clearing this would unmute a month the user has already sent. b) an
        // `updatedAt` later than this already says the month was changed after
        // its download. c) the screen is where that belongs and not the inbox.
        exportedAt: stored?.exportedAt ?? null,
      }
      await deps.repository.putSheet(caller.sub, period, sheet)
      return json(200, sheet)
    }

    if (method === 'POST' && isExport) {
      const built = await buildWorkbook(period, caller, deps)
      if ('status' in built) return built
      await markExported(period, caller, built.sheet, deps)
      return {
        status: 200,
        headers: {
          'content-type': WORKBOOK_TYPE,
          'content-disposition': `attachment; filename="${built.result.filename}"`,
        },
        body: Buffer.from(built.result.bytes).toString('base64'),
        isBase64: true,
      }
    }

    if (method === 'POST' && isEmail) {
      // Both guards run before the workbook is built. Nothing is gained by
      // writing a file that has nowhere to go.
      const mailer = deps.mailer
      if (!mailer) return problem(503, 'this deployment sends no mail')
      // The token names the mailbox rather than the body. A user holds the
      // workbook of their own month and of no other so there is nowhere else
      // for it to be sent.
      const to = caller.email
      if (!to) return problem(400, 'your account carries no email address')

      const built = await buildWorkbook(period, caller, deps)
      if ('status' in built) return built
      const { result, profile, sheet } = built

      try {
        await mailer.send({
          to,
          ...deliveryMessage({
            locale: profile.locale,
            firstName: profile.firstName,
            year: sheet.year,
            month: sheet.month,
            workbook: {
              filename: result.filename,
              contentType: WORKBOOK_TYPE,
              bytes: result.bytes,
            },
          }),
        })
      } catch (error) {
        // The month is left owed so the reminder still names it and the user
        // may press the button again.
        console.error(`the delivery to ${caller.sub} failed`, error)
        return problem(502, 'the message could not be sent')
      }

      await markExported(period, caller, sheet, deps)
      return json(200, { to, filename: result.filename })
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
