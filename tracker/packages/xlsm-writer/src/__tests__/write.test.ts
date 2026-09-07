// Round trips the shipped workbooks through the writer.
//
// The export is read back out of the zip with an independent parser so the test
// checks the bytes rather than the builder's own idea of them. Excel itself has
// not opened these files. That check is still outstanding.

import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { loadCatalogue } from '@tracker/fixtures'
import { loadSamples, type Sample } from '@tracker/fixtures/samples'
import {
  buildMonth,
  setCatalogue,
  totalDays,
  type HalfDay,
} from '@tracker/core'

import { ExportBlocked, writeTracker, toSerial, type ExportRequest } from '../index'

setCatalogue(await loadCatalogue())
const samples = await loadSamples()
const CREATED = '2026-09-01T00:00:00Z'

function halfDaysOf(sample: Sample): HalfDay[] {
  return sample.rows.map((r) => ({
    date: r.date,
    half: ((r.row - 5) % 2) as 0 | 1,
    workdayId: r.workdayId === null ? null : String(r.workdayId),
    specification: r.specification,
    specificationIsDefault: false,
    days: r.days === null ? null : (r.days as 0.5 | 1),
    location: r.location,
    tasks: r.tasks === null ? null : String(r.tasks),
  }))
}

function requestFor(sample: Sample): ExportRequest {
  return {
    firstName: sample.firstName ?? 'Firstname',
    lastName: sample.lastName ?? 'Name',
    location: sample.location ?? '01_DE_Berlin',
    year: sample.year,
    month: sample.month,
    adjustedWorkDays: sample.adjustedWorkDays,
    halfDays: halfDaysOf(sample),
    createdIso: CREATED,
  }
}

/** Reads the written package back without using any of the writer's code. */
function readBack(bytes: Uint8Array) {
  const zip = unzipSync(bytes)
  const parts = Object.keys(zip).sort()
  const sheet = strFromU8(zip['xl/worksheets/sheet1.xml'] as Uint8Array)
  const cells = new Map<string, string>()
  for (const match of sheet.matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const attrs = match[1] ?? ''
    const body = match[2]
    const ref = attrs.match(/r="([^"]+)"/)?.[1]
    if (!ref || !body) continue
    const inline = body.match(/<t[^>]*>(.*?)<\/t>/s)?.[1]
    const v = body.match(/<v>(.*?)<\/v>/s)?.[1]
    const raw = inline ?? v
    if (raw === undefined) continue
    cells.set(ref, raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
  }
  return { parts, sheet, cells, zip }
}

const complete = samples.find((s) => s.statusMessage === 'Your project tracker is completed!')
if (!complete) throw new Error('no completed sample workbook to test against')

describe('the package', () => {
  const { parts, zip } = readBack(writeTracker(requestFor(complete)).bytes)

  it('holds exactly the parts Excel needs', () => {
    expect(parts).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
  })

  it('carries no macros and no project list', () => {
    expect(parts.some((p) => p.includes('vbaProject'))).toBe(false)
    expect(parts.some((p) => p.includes('pivot'))).toBe(false)
    expect(parts.some((p) => p.includes('externalLink'))).toBe(false)
    expect(parts).toHaveLength(8)
  })

  it('declares the macro enabled content type', () => {
    const types = strFromU8(zip['[Content_Types].xml'] as Uint8Array)
    expect(types).toContain('application/vnd.ms-excel.sheet.macroEnabled.main+xml')
  })

  it('asks Excel to recalculate on open', () => {
    expect(strFromU8(zip['xl/workbook.xml'] as Uint8Array)).toContain('fullCalcOnLoad="1"')
  })

  it('writes no formula anywhere', () => {
    expect(strFromU8(zip['xl/worksheets/sheet1.xml'] as Uint8Array)).not.toContain('<f>')
  })

  it('produces the same bytes for the same sheet', () => {
    const a = writeTracker(requestFor(complete)).bytes
    const b = writeTracker(requestFor(complete)).bytes
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})

describe.each(samples.filter((s) => s.statusMessage === 'Your project tracker is completed!'))(
  'writing $workbook',
  (sample) => {
    const request = requestFor(sample)
    const result = writeTracker(request)
    const { cells } = readBack(result.bytes)
    const days = buildMonth(sample.year, sample.month, sample.location)

    it('names the file after the person and the month', () => {
      expect(result.filename).toBe(
        `${sample.lastName}.${sample.firstName}_${sample.year}_` +
          `${String(sample.month).padStart(2, '0')}_projecttracker_DE.xlsm`,
      )
    })

    it('writes the header block', () => {
      expect(cells.get('A2')).toBe(sample.location)
      expect(cells.get('B4')).toBe(String(sample.year))
      expect(cells.get('B5')).toBe(String(sample.month))
      expect(cells.get('L2')).toBe(sample.firstName)
      expect(cells.get('L3')).toBe(sample.lastName)
      expect(cells.get('B7')).toBe(String(days.filter((d) => !d.nonWorking).length))
      expect(cells.get('B8')).toBe(String(sample.adjustedWorkDays))
    })

    it('puts every entry back on the tracker row it came from', () => {
      for (const row of sample.rows) {
        if (row.days === null) continue
        expect(cells.get(`K${row.row}`), `K${row.row}`).toBe(String(row.days))
        expect(cells.get(`I${row.row}`), `I${row.row}`).toBe(
          row.workdayId === null ? undefined : String(row.workdayId),
        )
        expect(cells.get(`J${row.row}`), `J${row.row}`).toBe(row.specification ?? undefined)
      }
    })

    it('writes the date and the calendar week Excel computed', () => {
      for (const row of sample.rows) {
        expect(cells.get(`E${row.row}`), `E${row.row}`).toBe(String(toSerial(row.date)))
        expect(cells.get(`F${row.row}`), `F${row.row}`).toBe(String(row.week))
        expect(cells.get(`G${row.row}`), `G${row.row}`).toBe(row.nonWorking ? '1' : '0')
      }
    })

    it('reproduces the per week block', () => {
      sample.weekTable.forEach((week, i) => {
        const row = 95 + i
        expect(cells.get(`H${row}`), `H${row}`).toBe(String(week.week))
        expect(cells.get(`I${row}`), `I${row}`).toBe(String(week.workingDays))
        expect(cells.get(`J${row}`), `J${row}`).toBe(String(week.nonWorkingDays))
        expect(cells.get(`K${row}`), `K${row}`).toBe(String(week.total))
      })
      const totalRow = 95 + sample.weekTable.length
      expect(cells.get(`K${totalRow}`)).toBe(String(sample.totalDays))
      expect(cells.get(`K${totalRow + 1}`)).toBe(String(sample.target))
    })

    it('reproduces the aggregation block', () => {
      for (const expected of sample.aggregate) {
        const slot = [...cells.entries()].find(
          ([ref, value]) => /^I(7[1-9]|8[0-5])$/.test(ref) && value === expected.workdayId,
        )
        expect(slot, expected.workdayId).toBeDefined()
        const row = slot?.[0].slice(1)
        expect(cells.get(`K${row}`)).toBe(String(expected.days))
        expect(cells.get(`J${row}`)).toBe(expected.specification ?? undefined)
      }
    })

    it('writes the absence totals and the grand total', () => {
      expect(cells.get('K86')).toBe(String(sample.vacationDays))
      expect(cells.get('K87')).toBe(String(sample.otherAbsenceDays))
      expect(cells.get('M88')).toBe(String(sample.totalDays))
    })

    it('repeats the message Excel showed the user', () => {
      expect(cells.get('O2')).toBe(sample.statusMessage)
    })

    it('totals the same as the sheet it came from', () => {
      expect(totalDays(request.halfDays)).toBe(sample.totalDays)
    })
  },
)

describe('the export guard', () => {
  const broken = samples.find((s) => (s.entryMessage ?? '') !== '')

  it('refuses a sheet the tracker calls invalid', () => {
    expect(broken, 'no invalid sample workbook to test against').toBeDefined()
    expect(() => writeTracker(requestFor(broken as Sample))).toThrow(ExportBlocked)
  })

  it('names the failing check', () => {
    try {
      writeTracker(requestFor(broken as Sample))
      expect.unreachable('the export should have been blocked')
    } catch (error) {
      expect((error as ExportBlocked).codes).toContain('incompleteEntries')
    }
  })
})
