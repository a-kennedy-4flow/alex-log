// Reads the project tracker workbooks in the repository and writes the fixtures.
//
// Every workbook carries the same hidden reference sheets. The catalogue is
// taken from the newest one. Every workbook also carries a filled month so each
// becomes a test oracle holding the numbers Excel itself computed.
//
// Run with `pnpm fixtures` from the repository root.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openWorkbook, readCatalogue, isoDate } from '@tracker/workbook-reader'

const here = dirname(fileURLToPath(import.meta.url))
const WORKBOOK_DIR = join(here, '../..')
const OUT = join(here, '../../packages/fixtures/data')


/* ---------- reading ---------- */

// The parser lives in @tracker/workbook-reader so the admin upload in the
// browser and this tool cannot read the same workbook differently.

function open(path) {
  return { name: basename(path), ...openWorkbook(new Uint8Array(readFileSync(path))) }
}

function buildCatalogue(workbook) {
  const parsed = readCatalogue(workbook)
  return { ...parsed, source: { workbook: workbook.name, ...parsed.source } }
}

/* ---------- the filled month and Excel's own answers ---------- */

const GRID_FIRST = 5
const GRID_LAST = 66

function buildSample({ name, sheets }) {
  const rows = []
  for (let row = GRID_FIRST; row <= GRID_LAST; row++) {
    const serial = sheets.tracker.get(`E${row}`)
    if (typeof serial !== 'number') continue
    rows.push({
      row,
      date: isoDate(serial),
      dayOfMonth: sheets.tracker.get(`H${row}`) ?? null,
      // Column F is the calendar week Excel computed.
      week: sheets.tracker.get(`F${row}`) ?? null,
      // Column G is 1 for a weekend or a bank holiday.
      nonWorking: sheets.tracker.get(`G${row}`) === 1,
      workdayId: sheets.tracker.get(`I${row}`) ?? null,
      specification: sheets.tracker.get(`J${row}`) ?? null,
      days: sheets.tracker.get(`K${row}`) ?? null,
      location: sheets.tracker.get(`L${row}`) ?? null,
      tasks: sheets.tracker.get(`M${row}`) ?? null,
    })
  }

  const weekTable = []
  for (let row = 95; row <= 100; row++) {
    const week = sheets.tracker.get(`H${row}`)
    if (typeof week !== 'number') continue
    weekTable.push({
      week,
      workingDays: sheets.tracker.get(`I${row}`) ?? 0,
      nonWorkingDays: sheets.tracker.get(`J${row}`) ?? 0,
      total: sheets.tracker.get(`K${row}`) ?? 0,
    })
  }

  // The aggregation block at rows 71 to 85 plus the two absence totals.
  const aggregate = []
  for (let row = 71; row <= 85; row++) {
    const workdayId = sheets.tracker.get(`I${row}`)
    const days = sheets.tracker.get(`K${row}`)
    if (workdayId === undefined || workdayId === '' || !days) continue
    aggregate.push({
      workdayId: String(workdayId),
      specification: sheets.tracker.get(`J${row}`) ?? null,
      days,
      customer: sheets.tracker.get(`L${row}`) ?? null,
      projectTitle: sheets.tracker.get(`M${row}`) ?? null,
    })
  }

  return {
    workbook: name,
    name: sheets.tracker.get('C1') ?? null,
    firstName: sheets.tracker.get('L2') ?? null,
    lastName: sheets.tracker.get('L3') ?? null,
    location: sheets.tracker.get('A2') ?? null,
    year: sheets.tracker.get('B4') ?? null,
    month: sheets.tracker.get('B5') ?? null,
    workDays: sheets.tracker.get('B7') ?? null,
    adjustedWorkDays: sheets.tracker.get('B8') ?? null,
    target: sheets.tracker.get('K102') ?? null,
    totalDays: sheets.tracker.get('K101') ?? null,
    fromWeek: sheets.tracker.get('B10') ?? null,
    toWeek: sheets.tracker.get('B11') ?? null,
    vacationDays: sheets.tracker.get('K86') ?? 0,
    otherAbsenceDays: sheets.tracker.get('K87') ?? 0,
    // Cell O2 and O3 hold what Excel reported to the user.
    statusMessage: sheets.tracker.get('O2') ?? null,
    entryMessage: sheets.tracker.get('O3') ?? null,
    rows,
    weekTable,
    aggregate,
  }
}

/* ---------- run ---------- */

const files = readdirSync(WORKBOOK_DIR)
  .filter((f) => f.endsWith('.xlsm'))
  .sort()
if (files.length === 0) throw new Error(`no .xlsm workbook found in ${WORKBOOK_DIR}`)

const workbooks = files.map((f) => open(join(WORKBOOK_DIR, f)))

// The newest project list wins. The date reads as dd.mm.yyyy.
function updatedAt(workbook) {
  const text = String(workbook.sheets.projectlist.get('D1') ?? '')
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  return m ? `${m[3]}${m[2]}${m[1]}` : '0'
}
const newest = [...workbooks].sort((a, b) => updatedAt(a).localeCompare(updatedAt(b))).at(-1)

const catalogue = buildCatalogue(newest)
const { source } = catalogue

mkdirSync(OUT, { recursive: true })
rmSync(join(OUT, 'samples'), { recursive: true, force: true })
mkdirSync(join(OUT, 'samples'), { recursive: true })

const out = {
  'locations.json': { source, entities: catalogue.entities, locations: catalogue.locations },
  'holidays.json': {
    source,
    holidays: catalogue.holidays,
    workingWeekends: catalogue.workingWeekends,
  },
  'specifications.json': {
    source,
    specifications: catalogue.specifications,
    brokenSpecRanges: catalogue.brokenSpecRanges,
  },
  'projects.json': { source, projects: catalogue.projects },
  'entry-options.json': {
    source,
    absenceTypes: catalogue.absenceTypes,
    timeValues: catalogue.timeValues,
    businessLines: catalogue.businessLines,
  },
}

for (const [name, data] of Object.entries(out)) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + '\n')
}

const samples = workbooks.map(buildSample)
const index = []
for (const sample of samples) {
  const slug = `${sample.year}-${String(sample.month).padStart(2, '0')}`
  writeFileSync(join(OUT, 'samples', `${slug}.json`), JSON.stringify(sample, null, 2) + '\n')
  index.push({ slug, workbook: sample.workbook, year: sample.year, month: sample.month })
}
writeFileSync(join(OUT, 'samples', 'index.json'), JSON.stringify(index, null, 2) + '\n')

console.log(`catalogue from  ${source.workbook}  (${source.projectListUpdated})`)
console.log(`locations       ${catalogue.locations.length}`)
console.log(`holiday columns ${Object.keys(catalogue.holidays).length}`)
for (const [location, dates] of Object.entries(catalogue.workingWeekends)) {
  console.log(`working weekend ${dates.length} dates at ${location}`)
}
console.log(`spec ranges     ${Object.keys(catalogue.specifications).length} resolved`)
console.log(`broken ranges   ${catalogue.brokenSpecRanges.map((r) => r.name).join(' ') || 'none'}`)
console.log(`projects        ${catalogue.projects.length}`)
console.log(`business lines  ${catalogue.businessLines.map((b) => `${b.name} (${b.count})`).join(' | ')}`)
console.log(`time values     ${catalogue.timeValues.join(' ')}`)
for (const sample of samples) {
  console.log(
    `sample ${sample.year}-${String(sample.month).padStart(2, '0')}     ` +
      `${sample.totalDays} of ${sample.target} days  "${sample.statusMessage}"`,
  )
}
