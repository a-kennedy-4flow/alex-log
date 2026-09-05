// Reads a 4flow project tracker workbook.
//
// The same parser serves the browser and the fixture tool so an upload through
// the admin page and a rebuild of the fixtures cannot disagree. It takes bytes
// and touches no filesystem.

import { unzipSync, strFromU8 } from 'fflate'

/** Sheet order inside every tracker workbook. The names are the tab names. */
const SHEETS = {
  tracker: 'xl/worksheets/sheet1.xml',
  projectlist: 'xl/worksheets/sheet2.xml',
  internalCostCentre: 'xl/worksheets/sheet3.xml',
  holidays: 'xl/worksheets/sheet4.xml',
  parameters: 'xl/worksheets/sheet5.xml',
} as const

type SheetName = keyof typeof SHEETS
type Cells = Map<string, string | number>

export class NotATracker extends Error {
  constructor(reason: string) {
    super(`this does not look like a project tracker workbook: ${reason}`)
    this.name = 'NotATracker'
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

export function openWorkbook(bytes: Uint8Array): Workbook {
  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes)
  } catch {
    throw new NotATracker('it is not a readable spreadsheet')
  }

  const part = (name: string): string => {
    const file = zip[name]
    if (!file) throw new NotATracker(`the part ${name} is missing`)
    return strFromU8(file)
  }

  // Shared strings carry rich text as several <t> runs. Concatenate them.
  const shared = [...part('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)].map((match) =>
    [...(match[1] ?? '').matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => decode(t ?? '')).join(''),
  )

  function readSheet(path: string): Cells {
    const cells: Cells = new Map()
    for (const match of part(path).matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const attrs = match[1] ?? ''
      const body = match[2]
      const ref = attrs.match(/r="([^"]+)"/)?.[1]
      if (ref === undefined || body === undefined) continue
      const type = attrs.match(/t="([^"]+)"/)?.[1]
      if (type === 'inlineStr') {
        const runs = [...body.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => decode(t ?? ''))
        cells.set(ref, runs.join(''))
        continue
      }
      const v = body.match(/<v>(.*?)<\/v>/s)?.[1]
      if (v === undefined) continue
      if (type === 's') cells.set(ref, shared[Number(v)] ?? '')
      else if (type === 'str' || type === 'e') cells.set(ref, decode(v))
      else cells.set(ref, Number(v))
    }
    return cells
  }

  const sheets = Object.fromEntries(
    Object.entries(SHEETS).map(([key, path]) => [key, readSheet(path)]),
  ) as Record<SheetName, Cells>

  if (sheets.parameters.size === 0) throw new NotATracker('it holds no parameters sheet')
  if (sheets.projectlist.size === 0) throw new NotATracker('it holds no project list')

  const definedNames = [
    ...part('xl/workbook.xml').matchAll(
      /<definedName name="([^"]+)"[^>]*>([^<]*)<\/definedName>/g,
    ),
  ].map(([, name, formula]) => [name ?? '', formula ?? ''] as [string, string])

  return { sheets, definedNames }
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

  if (projects.length === 0) throw new NotATracker('its project list holds no workday id')

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
