// Writes the tracker workbook a user downloads and emails.
//
// The layout follows the shipped tracker so the recipient recognises it. The
// grid sits at rows 5 to 66 with two rows per calendar day. The aggregation
// block sits at 70 to 88. The per week block sits at 92 to 102.
//
// Everything is a value. Because a) the export carries no project list. b) the
// tracker derives those cells with XLOOKUP against that list. c) a lookup with
// no table returns an error.

import { zipSync, strToU8 } from 'fflate'
import {
  aggregateByProject,
  aggregateByWeek,
  absenceTotal,
  buildMonth,
  exportFilename,
  findProject,
  totalDays,
  trackerRow,
  validate,
  type CalendarDay,
  type HalfDay,
} from '@tracker/core'

import {
  APP_PROPS,
  CONTENT_TYPES,
  ROOT_RELS,
  STYLES,
  STYLE,
  WORKBOOK,
  WORKBOOK_RELS,
  coreProps,
} from './xml'
import { buildSheet, toSerial, type Cell } from './sheet'

export interface ExportRequest {
  firstName: string
  lastName: string
  location: string
  year: number
  /** 1 through 12. */
  month: number
  /** Tracker cell B8. Null when the user works a full month. */
  adjustedWorkDays: number | null
  halfDays: HalfDay[]
  /** Stamped into the document properties. The caller owns the clock. */
  createdIso: string
}

export interface ExportResult {
  filename: string
  bytes: Uint8Array
}

const RECIPIENT = 'software.projecttracker@4flow.com'

/** The aggregation block holds this many rows in the shipped tracker. */
const AGGREGATE_SLOTS = 15

const WIDTHS: Record<string, number> = {
  A: 16,
  B: 12,
  C: 8,
  E: 12,
  F: 6,
  G: 8,
  H: 6,
  I: 22,
  J: 34,
  K: 7,
  L: 26,
  M: 30,
}

function put(cells: Cell[], ref: string, value: Cell['value'], style?: number): void {
  cells.push(style === undefined ? { ref, value } : { ref, value, style })
}

/**
 * Lays the sheet out. Exported so a test can read the cells without unzipping
 * the package.
 */
export function buildTrackerCells(request: ExportRequest, days: CalendarDay[]): Cell[] {
  const cells: Cell[] = []
  const { halfDays } = request
  const workingDays = days.filter((d) => !d.nonWorking).length
  const target = request.adjustedWorkDays ?? workingDays
  const booked = totalDays(halfDays)

  /* header block */
  put(cells, 'A1', 'location', STYLE.bold)
  put(cells, 'C1', `${request.firstName} ${request.lastName}`, STYLE.title)
  put(cells, 'A2', request.location)
  put(cells, 'L2', request.firstName)
  put(cells, 'L3', request.lastName)

  put(cells, 'A4', 'Year', STYLE.bold)
  put(cells, 'B4', request.year)
  put(cells, 'A5', 'Month', STYLE.bold)
  put(cells, 'B5', request.month)
  put(cells, 'A6', 'Days', STYLE.bold)
  put(cells, 'B6', days.length)
  put(cells, 'A7', 'Work. Days', STYLE.bold)
  put(cells, 'B7', workingDays)
  put(cells, 'A8', 'Adj. work Days', STYLE.bold)
  put(cells, 'B8', request.adjustedWorkDays)

  const weeks = aggregateByWeek(halfDays, days)
  const booked_weeks = weeks.filter((w) => w.total > 0).map((w) => w.week)
  put(cells, 'A10', 'From CW', STYLE.bold)
  put(cells, 'B10', booked_weeks.length ? Math.min(...booked_weeks) : null)
  put(cells, 'A11', 'To CW', STYLE.bold)
  put(cells, 'B11', booked_weeks.length ? Math.max(...booked_weeks) : null)

  /* grid header */
  const HEADERS: [string, string][] = [
    ['E4', 'Date'],
    ['F4', 'CW'],
    ['G4', 'non-working days*'],
    ['H4', 'day'],
    ['I4', 'workday ID'],
    ['J4', 'specification'],
    ['K4', 'days'],
    ['L4', 'location'],
    ['M4', 'tasks'],
  ]
  for (const [ref, label] of HEADERS) put(cells, ref, label, STYLE.header)

  /* the grid */
  const byKey = new Map(halfDays.map((h) => [`${h.date}:${h.half}`, h]))
  for (const day of days) {
    for (const half of [0, 1] as const) {
      const row = trackerRow(day.dayOfMonth, half)
      const shade = day.nonWorking ? STYLE.nonWorking : undefined
      put(cells, `E${row}`, toSerial(day.date), STYLE.date)
      put(cells, `F${row}`, day.week, shade)
      put(cells, `G${row}`, day.nonWorking ? 1 : 0, shade)
      put(cells, `H${row}`, half === 0 ? day.dayOfMonth : null, shade)

      const entry = byKey.get(`${day.date}:${half}`)
      put(cells, `I${row}`, entry?.workdayId ?? null, shade)
      put(cells, `J${row}`, entry?.specification ?? null, shade)
      put(cells, `K${row}`, entry?.days ?? null, shade)
      put(cells, `L${row}`, entry?.location ?? null, shade)
      put(cells, `M${row}`, entry?.tasks ?? null, shade)
    }
  }

  /* the aggregation block */
  put(cells, 'I70', 'workday ID', STYLE.header)
  put(cells, 'J70', 'specification', STYLE.header)
  put(cells, 'K70', 'Days', STYLE.header)
  put(cells, 'L70', 'Customer', STYLE.header)
  put(cells, 'M70', 'Name of project [Business Line]', STYLE.header)

  const groups = aggregateByProject(halfDays).filter((g) => g.workdayId !== null)
  for (let i = 0; i < AGGREGATE_SLOTS; i++) {
    const row = 71 + i
    const group = groups[i]
    const project = group ? findProject(group.workdayId) : null
    put(cells, `I${row}`, group?.workdayId ?? null)
    put(cells, `J${row}`, group?.specification ?? null)
    put(cells, `K${row}`, group?.days ?? 0)
    put(cells, `L${row}`, project?.customer ?? null)
    put(cells, `M${row}`, project?.workdayTitle ?? project?.projectTitle ?? null)
  }
  // A month with more than fifteen groups would silently lose the rest so the
  // overflow is written below the block rather than dropped.
  for (let i = AGGREGATE_SLOTS; i < groups.length; i++) {
    const group = groups[i]
    const row = 71 + i
    put(cells, `I${row}`, group?.workdayId ?? null)
    put(cells, `J${row}`, group?.specification ?? null)
    put(cells, `K${row}`, group?.days ?? 0)
  }

  const lastGroupRow = 71 + Math.max(AGGREGATE_SLOTS, groups.length) - 1
  put(cells, `I${lastGroupRow + 1}`, 'Vacation or sickness:', STYLE.bold)
  put(cells, `K${lastGroupRow + 1}`, absenceTotal(halfDays, 'Vacation or sickness'))
  put(cells, `I${lastGroupRow + 2}`, 'Other absences:', STYLE.bold)
  put(cells, `K${lastGroupRow + 2}`, absenceTotal(halfDays, 'Other absence'))
  put(cells, `L${lastGroupRow + 3}`, 'Total', STYLE.bold)
  put(cells, `M${lastGroupRow + 3}`, booked, STYLE.total)

  /* the per week block */
  put(cells, 'H92', 'CW', STYLE.header)
  put(cells, 'I92', 'working days', STYLE.header)
  put(cells, 'J92', 'non-working days*', STYLE.header)
  put(cells, 'K92', 'Total days', STYLE.header)

  weeks.forEach((week, i) => {
    const row = 95 + i
    put(cells, `H${row}`, week.week)
    put(cells, `I${row}`, week.workingDays)
    put(cells, `J${row}`, week.nonWorkingDays)
    put(cells, `K${row}`, week.total)
  })
  const totalRow = 95 + weeks.length
  put(cells, `H${totalRow}`, 'Total', STYLE.bold)
  put(cells, `K${totalRow}`, booked, STYLE.total)
  put(cells, `J${totalRow + 1}`, 'target', STYLE.bold)
  put(cells, `K${totalRow + 1}`, target, STYLE.total)

  /* the messages the tracker shows */
  put(cells, 'O1', 'Validation messages', STYLE.bold)
  const delta = Math.round((booked - target) * 2) / 2
  const status =
    delta < 0
      ? `${Math.abs(delta)} working day(s) missing`
      : delta > 0
        ? `${delta} working day(s) too much`
        : 'Your project tracker is completed!'
  put(cells, 'O2', status)
  put(cells, 'O4', `Send this file to ${RECIPIENT} if everything is correct`)
  put(cells, 'M94', `Send this file to ${RECIPIENT} if everything is correct`)

  return cells
}

/**
 * Builds the workbook. Throws when the sheet holds an error because the spec
 * blocks the download on a failed check.
 */
export function writeTracker(request: ExportRequest): ExportResult {
  const days = buildMonth(request.year, request.month, request.location)
  const target = request.adjustedWorkDays ?? days.filter((d) => !d.nonWorking).length
  const issues = validate({ halfDays: request.halfDays, days, target })
  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    throw new ExportBlocked(errors.map((e) => e.code))
  }

  const sheet = buildSheet({
    cells: buildTrackerCells(request, days),
    widths: WIDTHS,
    freezeRows: 4,
  })

  const author = `${request.firstName} ${request.lastName}`
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'docProps/core.xml': strToU8(coreProps(author, request.createdIso)),
    'docProps/app.xml': strToU8(APP_PROPS),
    'xl/workbook.xml': strToU8(WORKBOOK),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  }

  return {
    filename: exportFilename({
      firstName: request.firstName,
      lastName: request.lastName,
      year: request.year,
      month: request.month,
      location: request.location,
    }),
    // The entry time comes from the request rather than the clock so the same
    // sheet always produces the same bytes. A zip cannot record a date before
    // 1980 so the epoch is not usable here.
    bytes: zipSync(files, { level: 6, mtime: new Date(request.createdIso) }),
  }
}

/** Raised when a sheet holding an error is sent for export. */
export class ExportBlocked extends Error {
  readonly codes: string[]

  constructor(codes: string[]) {
    super(`the timesheet holds errors: ${codes.join(' ')}`)
    this.name = 'ExportBlocked'
    this.codes = codes
  }
}

export { toSerial } from './sheet'
