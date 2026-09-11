// Reads the two workbooks the backoffice upload accepts.
//
// A project tracker carries every list the app offers so it replaces the
// catalogue. The 4s project numbers list carries names for the projects the
// tracker leaves blank so it is merged over a catalogue already stored.
//
// The same parser serves the browser and the fixture tool so an upload through
// the admin page and a rebuild of the fixtures cannot disagree. It takes bytes
// and touches no filesystem.

import { unzipSync, strFromU8 } from 'fflate'

// Types only. Nothing in core runs here. The import exists so the compiler
// checks what this file hands the API against what the API stores.
import type { CatalogueInput, RawProject } from '@tracker/core'

/** Sheet order inside every tracker workbook. The names are the tab names. */
const SHEETS = {
  tracker: 'xl/worksheets/sheet1.xml',
  projectlist: 'xl/worksheets/sheet2.xml',
  internalCostCentre: 'xl/worksheets/sheet3.xml',
  holidays: 'xl/worksheets/sheet4.xml',
  parameters: 'xl/worksheets/sheet5.xml',
} as const

/** The tab that tells a tracker from anything else dropped on the page. */
const TRACKER_TAB = 'Projectlist'

/** Tabs of the 4s project numbers list. Only the customer one is required. */
const NUMBER_TABS = {
  customer: 'CM1_Customer',
  product: 'CM2_Product',
  general: 'CM3_4s general',
} as const

type SheetName = keyof typeof SHEETS
export type Cells = Map<string, string | number>

/** A file the upload cannot use. The reason names what was looked for. */
export class NotAnUpload extends Error {
  constructor(reason: string) {
    super(`this is not a workbook the upload accepts: ${reason}`)
    this.name = 'NotAnUpload'
  }
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
}

export interface Workbook {
  sheets: Record<SheetName, Cells>
  definedNames: [string, string][]
}

/** The opened zip. Both readers below take this rather than the bytes. */
interface Parts {
  /** Text of one entry. Throws when the workbook has not got it. */
  text(name: string): string
  /** Worksheet part path by tab name. */
  tabs: Map<string, string>
  cells(path: string): Cells
}

function openParts(bytes: Uint8Array): Parts {
  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes)
  } catch {
    throw new NotAnUpload('it is not a readable spreadsheet')
  }

  const text = (name: string): string => {
    const file = zip[name]
    if (!file) throw new NotAnUpload(`the part ${name} is missing`)
    return strFromU8(file)
  }

  // Shared strings carry rich text as several <t> runs. Concatenate them.
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)].map((match) =>
    [...(match[1] ?? '').matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => decode(t ?? '')).join(''),
  )

  // A tab is found by its name. Its part number follows the order the sheets
  // were created in so the two only agree by luck.
  const targets = new Map(
    [
      ...text('xl/_rels/workbook.xml.rels').matchAll(
        /<Relationship Id="([^"]+)"[^>]*?Target="([^"]+)"/g,
      ),
    ].map(([, id, target]) => [id ?? '', `xl/${(target ?? '').replace(/^\/?xl\//, '')}`]),
  )
  const tabs = new Map<string, string>()
  for (const [, name, id] of text('xl/workbook.xml').matchAll(
    /<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g,
  )) {
    const target = targets.get(id ?? '')
    if (target !== undefined) tabs.set(decode(name ?? ''), target)
  }

  function cells(path: string): Cells {
    const found: Cells = new Map()
    for (const match of text(path).matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const attrs = match[1] ?? ''
      const body = match[2]
      const ref = attrs.match(/r="([^"]+)"/)?.[1]
      if (ref === undefined || body === undefined) continue
      const type = attrs.match(/t="([^"]+)"/)?.[1]
      if (type === 'inlineStr') {
        const runs = [...body.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => decode(t ?? ''))
        found.set(ref, runs.join(''))
        continue
      }
      const v = body.match(/<v>(.*?)<\/v>/s)?.[1]
      if (v === undefined) continue
      if (type === 's') found.set(ref, shared[Number(v)] ?? '')
      else if (type === 'str' || type === 'e') found.set(ref, decode(v))
      else found.set(ref, Number(v))
    }
    return found
  }

  return { text, tabs, cells }
}

function trackerWorkbook(parts: Parts): Workbook {
  const sheets = Object.fromEntries(
    Object.entries(SHEETS).map(([key, path]) => [key, parts.cells(path)]),
  ) as Record<SheetName, Cells>

  if (sheets.parameters.size === 0) throw new NotAnUpload('it holds no parameters sheet')
  if (sheets.projectlist.size === 0) throw new NotAnUpload('it holds no project list')

  const definedNames = [
    ...parts.text('xl/workbook.xml').matchAll(
      /<definedName name="([^"]+)"[^>]*>([^<]*)<\/definedName>/g,
    ),
  ].map(([, name, formula]) => [name ?? '', formula ?? ''] as [string, string])

  return { sheets, definedNames }
}

export function openWorkbook(bytes: Uint8Array): Workbook {
  return trackerWorkbook(openParts(bytes))
}

/** Reads one column and drops the empty cells. */
function column(sheet: Cells, col: string, first: number, last: number): (string | number)[] {
  const out: (string | number)[] = []
  for (let row = first; row <= last; row++) {
    const value = sheet.get(`${col}${row}`)
    if (value !== undefined && value !== '') out.push(value)
  }
  return out
}

// Excel counts from 1900-01-00 and treats 1900 as a leap year. Anchoring on
// 1899-12-30 absorbs both faults for every date after February 1900.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

export function isoDate(serial: number): string {
  return new Date(EXCEL_EPOCH + serial * 86400000).toISOString().slice(0, 10)
}

// ddSpecification is table4 over parameters N2:Q30 so its data starts at row 3.
const DD_SPECIFICATION: Record<string, [string, number, number]> = {
  Specification: ['N', 3, 30],
  'Specification 4c': ['O', 3, 30],
  'Specification 4fm': ['P', 3, 30],
  'Specification 4fs': ['Q', 3, 30],
}

const WORKING_WEEKEND_COLUMN = 'Working days instead of weekend'

/**
 * The location the working weekend column belongs to.
 *
 * The workbook gives that column no location of its own. Its dates are Chinese
 * make-up working days: they flank the Spring Festival and National Day blocks
 * of the Shanghai holiday list and clash with no other location. Applying them
 * everywhere turned a Berlin Sunday into a working day.
 *
 * Question 45 in the readme asks backoffice to confirm this.
 */
const WORKING_WEEKEND_LOCATION = '05_CN_Shanghai / Changzhou / Beijing'

const PROJECT_COLUMNS = {
  costCentre: 'A',
  customerGroup: 'C',
  customer: 'D',
  customerId: 'H',
  projectNo: 'K',
  entity: 'L',
  businessLine: 'M',
  businessUnit: 'N',
  projectTitle: 'O',
  status: 'R',
  object: 'S',
  workdayId: 'T',
  workdayTitle: 'U',
  specification: 'V',
  hgbAllocation: 'W',
} as const

/** Mirrors the AA helper column of the tracker. */
function objectKey(object: unknown): string {
  if (object === 'Project') return 'proj'
  if (object === 'Cost center') return 'cc'
  return 'na'
}

export interface ParsedCatalogue {
  source: {
    projectListUpdated: string | null
    projectListFile: string | null
    projectListPath: string | null
  }
  entities: { country: string | null; entity: string }[]
  locations: { code: string; entityNo: string; countryCode: string; city: string }[]
  holidays: Record<string, string[]>
  workingWeekends: Record<string, string[]>
  specifications: Record<string, string[]>
  brokenSpecRanges: { name: string; formula: string }[]
  projects: Record<string, unknown>[]
  absenceTypes: {
    label: string
    projectNo: string | null
    businessLineKey: string
    objectKey: string
    specRange: string
  }[]
  timeValues: number[]
  businessLines: { name: string; key: string; count: number }[]
}

export function readCatalogue(workbook: Workbook): ParsedCatalogue {
  const { sheets, definedNames } = workbook

  const source = {
    projectListUpdated: (sheets.projectlist.get('D1') as string) ?? null,
    projectListFile: (sheets.projectlist.get('F1') as string) ?? null,
    projectListPath: (sheets.projectlist.get('F2') as string) ?? null,
  }

  // Table1 at I2:J18 maps country to legal entity. tblLocation holds the
  // location codes at L3:L24. A location code carries the entity number so the
  // two join on that prefix.
  const entities: { country: string | null; entity: string }[] = []
  for (let row = 3; row <= 18; row++) {
    const country = sheets.parameters.get(`I${row}`)
    const entity = sheets.parameters.get(`J${row}`)
    if (entity) entities.push({ country: (country as string) ?? null, entity: String(entity) })
  }

  const locations = column(sheets.parameters, 'L', 3, 24).map((value) => {
    const code = String(value)
    const parts = code.split('_')
    return {
      code,
      entityNo: parts[0] ?? '',
      countryCode: parts[1] ?? '',
      city: parts.slice(2).join('_'),
    }
  })

  // Row 2 of the holidays sheet names one column per location. The last column
  // lists weekend days that count as working days.
  const holidays: Record<string, string[]> = {}
  let sharedWorkingWeekends: string[] = []
  for (const [ref, label] of sheets.holidays) {
    if (!/^[A-Z]+2$/.test(ref)) continue
    const dates = column(sheets.holidays, ref.slice(0, -1), 3, 400)
      .filter((v): v is number => typeof v === 'number')
      .map(isoDate)
      .sort()
    if (label === WORKING_WEEKEND_COLUMN) sharedWorkingWeekends = dates
    else holidays[String(label)] = dates
  }

  const workingWeekends: Record<string, string[]> = {}
  if (sharedWorkingWeekends.length > 0 && holidays[WORKING_WEEKEND_LOCATION]) {
    workingWeekends[WORKING_WEEKEND_LOCATION] = sharedWorkingWeekends
  }

  function resolveSpecRange(formula: string): string[] | null {
    const table = formula.match(/^ddSpecification\[(.+)\]$/)
    if (table) {
      const spec = DD_SPECIFICATION[table[1] ?? '']
      if (!spec) return null
      return column(sheets.parameters, spec[0], spec[1], spec[2]).map(String)
    }
    const range = formula.match(/^parameters!\$([A-Z]+)\$(\d+)(?::\$[A-Z]+\$(\d+))?$/)
    if (range) {
      const col = range[1] as string
      const first = Number(range[2])
      return column(sheets.parameters, col, first, Number(range[3] ?? first)).map(String)
    }
    return null
  }

  const specifications: Record<string, string[]> = {}
  const brokenSpecRanges: { name: string; formula: string }[] = []
  for (const [name, formula] of definedNames) {
    if (!name.startsWith('spec_')) continue
    const values = resolveSpecRange(formula)
    if (values === null) brokenSpecRanges.push({ name, formula })
    else specifications[name] = values
  }

  const projects: Record<string, unknown>[] = []
  for (let row = 4; row <= 6000; row++) {
    const workdayId = sheets.projectlist.get(`T${row}`)
    if (workdayId === undefined || workdayId === '') continue
    const record: Record<string, unknown> = {}
    for (const [key, col] of Object.entries(PROJECT_COLUMNS)) {
      const value = sheets.projectlist.get(`${col}${row}`)
      record[key] = value === undefined || value === '' ? null : value
    }
    record.workdayId = String(record.workdayId)
    // Mirrors the Z helper column of the tracker.
    record.businessLineKey = String(record.businessLine ?? '4flow').replace(/ /g, '')
    record.objectKey = objectKey(record.object)
    record.specRange = `spec_${String(record.businessLineKey)}_${String(record.objectKey)}`
    projects.push(record)
  }

  if (projects.length === 0) throw new NotAnUpload('its project list holds no workday id')

  // The two manual entries the cost centre dropdown offers alongside the
  // project numbers. Both force an overhead specification.
  const absenceTypes = []
  for (let row = 3; row <= 4; row++) {
    const label = sheets.parameters.get(`C${row}`)
    if (!label) continue
    absenceTypes.push({
      label: String(label),
      projectNo: String(sheets.parameters.get(`D${row}`) ?? '').match(/(\d{6,})/)?.[1] ?? null,
      businessLineKey: 'overhead',
      objectKey: 'na',
      specRange: 'spec_overhead_na',
    })
  }

  const timeValues = column(sheets.parameters, 'F', 3, 4).filter(
    (v): v is number => typeof v === 'number',
  )

  const counts = new Map<string, number>()
  for (const project of projects) {
    const line = project.businessLine
    if (typeof line !== 'string' || line === '') continue
    counts.set(line, (counts.get(line) ?? 0) + 1)
  }
  const businessLines = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, key: name.replace(/ /g, ''), count }))

  return {
    source,
    entities,
    locations,
    holidays,
    workingWeekends,
    specifications,
    brokenSpecRanges,
    projects,
    absenceTypes,
    timeValues,
    businessLines,
  }
}

/** Convenience for the common case. */
export function readCatalogueFrom(bytes: Uint8Array): ParsedCatalogue {
  return readCatalogue(openWorkbook(bytes))
}

/**
 * What the workbook holds turned into what the API stores.
 *
 * The two differ in one field. A broken range is shown to the person uploading
 * with the formula that broke it. The app only ever needs its name.
 *
 * Every upload goes through this. Because a) the admin page used to send the
 * parser output untouched. b) the fixture seed mapped it first. c) one workbook
 * must not produce two catalogues.
 */
export function toCatalogueInput(parsed: ParsedCatalogue, workbook: string): CatalogueInput {
  return {
    source: { workbook, ...parsed.source },
    locations: parsed.locations,
    entities: parsed.entities,
    holidays: parsed.holidays,
    workingWeekends: parsed.workingWeekends,
    specifications: parsed.specifications,
    brokenSpecRanges: parsed.brokenSpecRanges.map((range) => range.name),
    // A project row is built from a column map so the compiler only knows it as
    // a record. Its keys are the ones `RawProject` names.
    projects: parsed.projects as unknown as RawProject[],
    absenceTypes: parsed.absenceTypes,
    timeValues: parsed.timeValues,
    businessLines: parsed.businessLines,
  }
}

/* ---------- the 4s project numbers list ---------- */

/**
 * The row the number sheets carry their column headings on. Every table in the
 * list is defined from C3 so its data starts at row 4.
 */
const NUMBER_HEADER_ROW = 3

/** Where the date the list was cut sits. Every sheet repeats it. */
const NUMBER_UPDATED_CELL = 'A2'

/** Headings on the customer sheet. It is the only sheet naming a customer. */
const CUSTOMER_HEADINGS = {
  workdayId: 'Project no.',
  specification: 'Specification',
  customer: 'Customer',
  entity: '4flow company',
  projectTitle: 'Project title',
} as const

/** Headings on the product sheet and on the general sheet. */
const COST_CENTRE_HEADINGS = {
  workdayId: 'Project no.',
  projectTitle: 'Project title',
} as const

/**
 * The business line every number in the list belongs to.
 *
 * The list states none. Because a) it is the 4s list. b) all 700 rows whose
 * number the tracker also carries read `software` there. c) the three
 * specifications it offers are exactly the `spec_software_proj` range.
 */
const NUMBERS_BUSINESS_LINE = 'software'

/** One project number as the 4s list states it. */
export interface ProjectNumber {
  /** The tracker project list calls this the Workday ID. */
  workdayId: string
  customer: string | null
  projectTitle: string | null
  /** The list calls this the 4flow company. The tracker calls it the entity. */
  entity: string | null
  /** `Project` or `Cost center`. Tracker column S holds the same two words. */
  object: string
  /** Every specification the list offers against this number. */
  specifications: string[]
}

export interface ParsedProjectNumbers {
  source: {
    /** ISO date the list was cut. */
    listUpdated: string | null
  }
  numbers: ProjectNumber[]
  /** Rows read. A number is stated once per specification it allows. */
  rows: number
}

export interface ProjectNumbersWorkbook {
  customer: Cells
  product: Cells
  general: Cells
}

function projectNumbersWorkbook(parts: Parts): ProjectNumbersWorkbook {
  const tab = (name: string): Cells => {
    const path = parts.tabs.get(name)
    return path === undefined ? new Map() : parts.cells(path)
  }
  const customer = tab(NUMBER_TABS.customer)
  if (customer.size === 0) throw new NotAnUpload(`it holds no ${NUMBER_TABS.customer} sheet`)
  return { customer, product: tab(NUMBER_TABS.product), general: tab(NUMBER_TABS.general) }
}

export function openProjectNumbers(bytes: Uint8Array): ProjectNumbersWorkbook {
  return projectNumbersWorkbook(openParts(bytes))
}

/** The highest row the sheet holds a cell on. */
function lastRow(sheet: Cells): number {
  let last = 0
  for (const ref of sheet.keys()) {
    const row = Number(/\d+$/.exec(ref)?.[0] ?? 0)
    if (row > last) last = row
  }
  return last
}

/**
 * Column letter of each heading on one row. Whitespace inside a heading is
 * squashed because two of them wrap onto a second line.
 */
function headings(sheet: Cells, row: number): Map<string, string> {
  const found = new Map<string, string>()
  for (const [ref, value] of sheet) {
    const cell = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!cell || Number(cell[2]) !== row) continue
    const name = String(value).replace(/\s+/g, ' ').trim()
    if (name !== '' && !found.has(name)) found.set(name, cell[1] as string)
  }
  return found
}

interface NumberHeadings {
  workdayId: string
  specification?: string
  customer?: string
  entity?: string
  projectTitle?: string
}

/**
 * Collects one sheet of the list into `into` and answers how many rows it read.
 *
 * A number is stated once per specification it allows so the first row decides
 * its names and every later row only adds a specification.
 */
function collectNumbers(
  sheet: Cells,
  wanted: NumberHeadings,
  object: string,
  into: Map<string, ProjectNumber>,
): number {
  if (sheet.size === 0) return 0
  const at = headings(sheet, NUMBER_HEADER_ROW)
  if (!at.has(wanted.workdayId)) {
    throw new NotAnUpload(`one of its sheets has no "${wanted.workdayId}" column`)
  }
  const text = (row: number, heading: string | undefined): string | null => {
    const col = heading === undefined ? undefined : at.get(heading)
    if (col === undefined) return null
    const value = sheet.get(`${col}${row}`)
    if (value === undefined) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  const last = lastRow(sheet)
  let rows = 0
  for (let row = NUMBER_HEADER_ROW + 1; row <= last; row++) {
    const id = text(row, wanted.workdayId)
    if (id === null) continue
    rows++
    const specification = text(row, wanted.specification)
    const held = into.get(id)
    if (held === undefined) {
      into.set(id, {
        workdayId: id,
        customer: text(row, wanted.customer),
        projectTitle: text(row, wanted.projectTitle),
        entity: text(row, wanted.entity),
        object,
        specifications: specification === null ? [] : [specification],
      })
      continue
    }
    held.customer ??= text(row, wanted.customer)
    held.projectTitle ??= text(row, wanted.projectTitle)
    held.entity ??= text(row, wanted.entity)
    if (specification !== null && !held.specifications.includes(specification)) {
      held.specifications.push(specification)
    }
  }
  return rows
}

export function readProjectNumbers(workbook: ProjectNumbersWorkbook): ParsedProjectNumbers {
  const collected = new Map<string, ProjectNumber>()
  let rows = collectNumbers(workbook.customer, CUSTOMER_HEADINGS, 'Project', collected)
  // The product sheet and the general sheet list cost centres rather than
  // projects. Every number on them is object `Cost center` in the tracker.
  rows += collectNumbers(workbook.product, COST_CENTRE_HEADINGS, 'Cost center', collected)
  rows += collectNumbers(workbook.general, COST_CENTRE_HEADINGS, 'Cost center', collected)

  if (collected.size === 0) throw new NotAnUpload('it lists no project number')

  const updated = workbook.customer.get(NUMBER_UPDATED_CELL)
  return {
    source: { listUpdated: typeof updated === 'number' ? isoDate(updated) : null },
    numbers: [...collected.values()],
    rows,
  }
}

/** Convenience for the common case. */
export function readProjectNumbersFrom(bytes: Uint8Array): ParsedProjectNumbers {
  return readProjectNumbers(openProjectNumbers(bytes))
}

/** A number the catalogue has not got turned into a row the picker can offer. */
function asProject(number: ProjectNumber): RawProject {
  const key = objectKey(number.object)
  return {
    costCentre: null,
    customerGroup: null,
    customer: number.customer,
    customerId: null,
    projectNo: null,
    entity: number.entity,
    businessLine: NUMBERS_BUSINESS_LINE,
    businessUnit: null,
    projectTitle: number.projectTitle,
    status: null,
    object: number.object,
    workdayId: number.workdayId,
    workdayTitle: null,
    specification: number.specifications[0] ?? null,
    hgbAllocation: null,
    businessLineKey: NUMBERS_BUSINESS_LINE,
    objectKey: key,
    specRange: `spec_${NUMBERS_BUSINESS_LINE}_${key}`,
  }
}

export interface ProjectNumbersReport {
  /** Catalogue rows the list gave a name to. */
  named: number
  /** Numbers the catalogue already named. Nothing changed on those. */
  known: number
  /** Numbers the catalogue has not got at all. */
  absent: number
  /** How many of the absent ones were added. */
  added: number
}

/**
 * The 4s project numbers laid over a catalogue already stored.
 *
 * The list replaces nothing. Because a) it carries no location and no bank
 * holiday and no day value. b) it covers one business line of four. c) the
 * tracker copy is cut later than the list so a blank is the only field the list
 * can be trusted to know better.
 *
 * `addAbsent` decides what happens to a number the catalogue has not got.
 * Adding it makes it bookable under `software`. Leaving it out fills names and
 * nothing else.
 */
export function mergeProjectNumbers(
  current: CatalogueInput,
  parsed: ParsedProjectNumbers,
  workbook: string,
  addAbsent: boolean,
): { data: CatalogueInput; report: ProjectNumbersReport } {
  const wanted = new Map(parsed.numbers.map((number) => [number.workdayId, number]))
  const report: ProjectNumbersReport = { named: 0, known: 0, absent: 0, added: 0 }
  const seen = new Set<string>()

  // Every row carrying the number is named rather than only the first. Which
  // repeat the picker offers is not for this function to decide.
  const projects = (current.projects ?? []).map((project) => {
    const number = wanted.get(project.workdayId)
    if (number === undefined) return project
    const named: RawProject = {
      ...project,
      customer: project.customer ?? number.customer,
      projectTitle: project.projectTitle ?? number.projectTitle,
      entity: project.entity ?? number.entity,
      specification: project.specification ?? number.specifications[0] ?? null,
    }
    if (!seen.has(project.workdayId)) {
      seen.add(project.workdayId)
      const changed =
        named.customer !== project.customer ||
        named.projectTitle !== project.projectTitle ||
        named.entity !== project.entity ||
        named.specification !== project.specification
      if (changed) report.named++
      else report.known++
    }
    return named
  })

  for (const number of parsed.numbers) {
    if (seen.has(number.workdayId)) continue
    report.absent++
    if (!addAbsent) continue
    projects.push(asProject(number))
    report.added++
  }

  const businessLines = [...(current.businessLines ?? [])]
  if (report.added > 0 && !businessLines.some((line) => line.name === NUMBERS_BUSINESS_LINE)) {
    // `setCatalogue` recounts every line so the count given here is discarded.
    businessLines.push({ name: NUMBERS_BUSINESS_LINE, key: NUMBERS_BUSINESS_LINE, count: 0 })
  }

  return {
    data: {
      ...current,
      source: {
        workbook: current.source?.workbook ?? null,
        projectListUpdated: current.source?.projectListUpdated ?? null,
        projectListFile: current.source?.projectListFile ?? null,
        projectListPath: current.source?.projectListPath ?? null,
        projectNumbers: { workbook, listUpdated: parsed.source.listUpdated },
      },
      projects,
      businessLines,
    },
    report,
  }
}

/** What the drop zone was handed. */
export type Upload =
  | { kind: 'tracker'; catalogue: ParsedCatalogue }
  | { kind: 'projectNumbers'; projectNumbers: ParsedProjectNumbers }

/**
 * Reads whichever of the two workbooks the bytes hold.
 *
 * The tab names decide rather than the file extension. Because a) either list
 * arrives as a macro workbook or as a plain one depending on who saved it. b) a
 * tab name is something the person uploading can check. c) the parts are
 * numbered in creation order so a position tells nothing.
 */
export function readUploadFrom(bytes: Uint8Array): Upload {
  const parts = openParts(bytes)
  if (parts.tabs.has(NUMBER_TABS.customer)) {
    return {
      kind: 'projectNumbers',
      projectNumbers: readProjectNumbers(projectNumbersWorkbook(parts)),
    }
  }
  if (parts.tabs.has(TRACKER_TAB)) {
    return { kind: 'tracker', catalogue: readCatalogue(trackerWorkbook(parts)) }
  }
  throw new NotAnUpload(
    `it holds neither a ${TRACKER_TAB} sheet nor a ${NUMBER_TABS.customer} sheet`,
  )
}
