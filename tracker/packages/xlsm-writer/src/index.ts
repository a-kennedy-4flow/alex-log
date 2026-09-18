// Writes the tracker workbook a user downloads and emails.
//
// The layout follows the shipped tracker so the recipient recognises it. The
// grid sits at rows 5 to 66 with two rows per calendar day. The aggregation
// block sits at 70 to 88. The per week block sits at 92 to 102. Both blocks
// below the grid move down together when a month holds more groups than the
// tracker left room for.
//
// Everything is a value. Because a) the export carries no project list. b) the
// tracker derives those cells with XLOOKUP against that list. c) a lookup with
// no table returns an error.

import { zipSync, strToU8 } from 'fflate'
import {
  ABSENCE_LINES,
  aggregateByProject,
  aggregateByWeek,
  absenceTotal,
  buildMonth,
  exportFilename,
  findProject,
  totalDays,
  trackerRow,
  TRACKER_RECIPIENT,
  validate,
  type CalendarDay,
  type HalfDay,
  type Project,
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
 * Tracker column I. The workbook holds a Workday ID as a number and an absence
 * label as text. The export writes each the same way so a reader sorts and
 * pivots the column as the sheet this copies lets them.
 *
 * Only a canonical integer converts. Because a) a leading zero is part of an id
 * that carries one. b) an id past the safe integer range would not survive the
 * trip through a double. c) `String(Number(text)) === text` refuses both
 * without needing a rule for each.
 *
 * All 3149 ids in the shipped list are plain digits under seven of them so
 * nothing in the catalogue today takes the text branch. A later upload might.
 */
function workdayCell(workdayId: string | null): Cell['value'] {
  if (workdayId === null) return null
  const asNumber = Number(workdayId)
  return String(asNumber) === workdayId ? asNumber : workdayId
}

/**
 * Tracker column M. Its header reads `Name of project [Business Line]` and the
 * workbook formula appends that business line to the title. The suffix is
 * dropped where nothing names the line rather than written empty.
 */
function projectLabel(project: Project | null | undefined): string | null {
  const title = project?.workdayTitle ?? project?.projectTitle ?? null
  if (title === null) return null
  return project?.businessLine ? `${title} [BL ${project.businessLine}]` : title
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
      put(cells, `I${row}`, workdayCell(entry?.workdayId ?? null), shade)
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

  // The tracker left fifteen slots. An empty slot is still written so the block
  // keeps its shape. A month holding more groups grows the block rather than
  // losing the rest.
  const groups = aggregateByProject(halfDays).filter((g) => g.workdayId !== null)
  const groupRows = Math.max(AGGREGATE_SLOTS, groups.length)
  for (let i = 0; i < groupRows; i++) {
    const row = 71 + i
    const group = groups[i]
    const project = group ? findProject(group.workdayId) : null
    put(cells, `I${row}`, workdayCell(group?.workdayId ?? null))
    put(cells, `J${row}`, group?.specification ?? null)
    put(cells, `K${row}`, group?.days ?? 0)
    put(cells, `L${row}`, project?.customer ?? null)
    put(cells, `M${row}`, projectLabel(project))
  }

  // The two absence lines and the grand total sit under the block. The tracker
  // grand total is SUM(K71:K87) so the block never carries an absence itself.
  const lastGroupRow = 71 + groupRows - 1
  const ABSENCE_HEADINGS = ['Vacation or sickness:', 'Other absences:']
  ABSENCE_LINES.forEach((label, i) => {
    put(cells, `I${lastGroupRow + 1 + i}`, ABSENCE_HEADINGS[i] ?? `${label}:`, STYLE.bold)
    put(cells, `K${lastGroupRow + 1 + i}`, absenceTotal(halfDays, label))
  })
  const grandTotalRow = lastGroupRow + ABSENCE_LINES.length + 1
  put(cells, `L${grandTotalRow}`, 'Total', STYLE.bold)
  put(cells, `M${grandTotalRow}`, booked, STYLE.total)

  /*
   * The per week block. It starts at row 92 as the tracker does and moves down
   * only when the block above has grown past its fifteen slots. Because a) the
   * two would otherwise write the same cell twice and Excel refuses a sheet
   * holding a repeated reference. b) a month can hold up to sixty two groups.
   * c) a reader recognises the layout as long as nothing has overflowed.
   */
  const weekHeaderRow = Math.max(92, grandTotalRow + 4)
  put(cells, `H${weekHeaderRow}`, 'CW', STYLE.header)
  put(cells, `I${weekHeaderRow}`, 'working days', STYLE.header)
  put(cells, `J${weekHeaderRow}`, 'non-working days*', STYLE.header)
  put(cells, `K${weekHeaderRow}`, 'Total days', STYLE.header)

  const weekFirstRow = weekHeaderRow + 3
  weeks.forEach((week, i) => {
    const row = weekFirstRow + i
    put(cells, `H${row}`, week.week)
    put(cells, `I${row}`, week.workingDays)
    put(cells, `J${row}`, week.nonWorkingDays)
    put(cells, `K${row}`, week.total)
  })
  const totalRow = weekFirstRow + weeks.length
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
  put(cells, 'O4', `Send this file to ${TRACKER_RECIPIENT} if everything is correct`)
  put(cells, `M${weekHeaderRow + 2}`, `Send this file to ${TRACKER_RECIPIENT} if everything is correct`)

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
