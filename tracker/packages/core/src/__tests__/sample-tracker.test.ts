// Checks the domain against every filled workbook in the repository.
//
// Excel cached what its own formulas produced so those numbers are the oracle.
// The export writes values rather than formulas so any drift here would ship a
// workbook that disagrees with the tracker it copies.
//
// Two workbooks are covered. April 2026 is part filled and Excel reports it as
// invalid. August 2026 is complete and Excel reports it as done.

import { describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'
import { loadSamples, type Sample } from '@tracker/fixtures/samples'

import type { HalfDay } from '../index'
import {
  aggregateByProject,
  aggregateByWeek,
  absenceTotal,
  buildMonth,
  catalogue,
  exportFilename,
  isoWeek,
  regionOf,
  setCatalogue,
  specificationsFor,
  totalDays,
  trackerRow,
  validate,
  workingDayCount,
} from '../index'

setCatalogue(await loadCatalogue())
const samples = await loadSamples()

/** The tracker row number gives the half away. Row 5 is the first upper row. */
function halfOf(row: number): 0 | 1 {
  return ((row - 5) % 2) as 0 | 1
}

function halfDaysOf(sample: Sample): HalfDay[] {
  return sample.rows.map((r) => ({
    date: r.date,
    half: halfOf(r.row),
    workdayId: r.workdayId === null ? null : String(r.workdayId),
    specification: r.specification,
    specificationIsDefault: false,
    days: r.days === null ? null : (r.days as 0.5 | 1),
    location: r.location,
    tasks: r.tasks === null ? null : String(r.tasks),
  }))
}

it('found both workbooks', () => {
  expect(samples.map((s) => `${s.year}-${s.month}`).sort()).toEqual(['2026-4', '2026-8'])
})

describe.each(samples)('$workbook', (sample) => {
  const days = buildMonth(sample.year, sample.month, sample.location)
  const halfDays = halfDaysOf(sample)

  it('maps every row back to its tracker row', () => {
    for (const row of sample.rows) {
      const day = days.find((d) => d.date === row.date)
      expect(day, row.date).toBeDefined()
      expect(trackerRow(day?.dayOfMonth ?? 0, halfOf(row.row))).toBe(row.row)
    }
  })

  it('matches column F for the calendar week on every row', () => {
    for (const row of sample.rows) expect(isoWeek(row.date), row.date).toBe(row.week)
  })

  it('matches column G for the non-working flag on every row', () => {
    const byDate = new Map(days.map((d) => [d.date, d]))
    for (const row of sample.rows) {
      expect(byDate.get(row.date)?.nonWorking, row.date).toBe(row.nonWorking)
    }
  })

  it('matches the per week block at rows 95 to 100', () => {
    const mine = aggregateByWeek(halfDays, days)
    expect(mine.map((w) => w.week)).toEqual(sample.weekTable.map((w) => w.week))
    for (const expected of sample.weekTable) {
      expect(mine.find((w) => w.week === expected.week), `CW ${expected.week}`).toMatchObject({
        workingDays: expected.workingDays,
        nonWorkingDays: expected.nonWorkingDays,
        total: expected.total,
      })
    }
  })

  it('matches the total at K101', () => {
    expect(totalDays(halfDays)).toBe(sample.totalDays)
  })

  it('matches the two absence totals at K86 and K87', () => {
    expect(absenceTotal(halfDays, 'Vacation or sickness')).toBe(sample.vacationDays)
    expect(absenceTotal(halfDays, 'Other absence')).toBe(sample.otherAbsenceDays)
  })

  it('matches the aggregation block at rows 71 to 85', () => {
    const mine = aggregateByProject(halfDays).filter((r) => r.workdayId !== null)
    for (const expected of sample.aggregate) {
      const actual = mine.find(
        (r) => r.workdayId === expected.workdayId && r.specification === expected.specification,
      )
      expect(actual, `${expected.workdayId} ${expected.specification}`).toBeDefined()
      expect(actual?.days).toBe(expected.days)
    }
  })

  it('takes the adjusted work days as the target when set', () => {
    expect(sample.adjustedWorkDays ?? sample.workDays).toBe(sample.target)
  })

  it('reaches the same verdict Excel reached', () => {
    const issues = validate({ halfDays, days, target: sample.target })
    const errors = issues.filter((i) => i.severity === 'error')
    const complete = sample.statusMessage === 'Your project tracker is completed!'

    if (complete) {
      // Excel says the sheet is done so nothing may be reported.
      expect(issues).toEqual([])
    } else {
      // Excel reports a gap so the same gap must appear here.
      const gap = issues.find((i) => i.code === 'daysTooMany' || i.code === 'daysMissing')
      expect(gap).toBeDefined()
      expect(gap?.values?.days).toBe(Math.abs(sample.totalDays - sample.target))
    }

    // Cell O3 is set only when a row is missing or invalid.
    const trackerFlagsEntries = (sample.entryMessage ?? '') !== ''
    expect(errors.length > 0).toBe(trackerFlagsEntries)
  })

  it('accepts every specification the sheet uses', () => {
    for (const entry of halfDays) {
      if (!entry.workdayId || !entry.specification) continue
      const options = specificationsFor(entry.workdayId).options
      expect(options, `${entry.workdayId} ${entry.specification}`).toContain(entry.specification)
    }
  })

  it('rebuilds a file name from the sheet', () => {
    const name = exportFilename({
      firstName: sample.firstName ?? '',
      lastName: sample.lastName ?? '',
      year: sample.year,
      month: sample.month,
      location: sample.location,
    })
    expect(name.startsWith(`${sample.lastName}.${sample.firstName}_${sample.year}_`)).toBe(true)
    expect(name.endsWith('.xlsm')).toBe(true)
  })
})

describe('the region in the file name', () => {
  it('is the country code of the location', () => {
    expect(regionOf('01_DE_Berlin')).toBe('DE')
    expect(regionOf('10_AT_Vienna')).toBe('AT')
    expect(regionOf('13_ES_Madrid')).toBe('ES')
  })

  it('names a city holding a separator by its country alone', () => {
    expect(regionOf('01_DE_Ruesselsheim / Bad Nauheim')).toBe('DE')
    expect(regionOf('05_CN_Shanghai / Changzhou / Beijing')).toBe('CN')
  })

  it('matches the workbook that was actually submitted', () => {
    // `Kennedy.Alexander_2026_08_projecttracker_DE.xlsm` came from
    // `01_DE_Berlin`. Open question 39 held this open until 2026-09-07.
    expect(
      exportFilename({
        firstName: 'Alexander',
        lastName: 'Kennedy',
        year: 2026,
        month: 8,
        location: '01_DE_Berlin',
      }),
    ).toBe('Kennedy.Alexander_2026_08_projecttracker_DE.xlsm')
  })

  it('reads the country from the catalogue rather than from the code', () => {
    // Every location the catalogue holds carries the field so the fallback is
    // never the path for a real one.
    for (const location of catalogue.locations) {
      expect(regionOf(location.code)).toBe(location.countryCode.toUpperCase())
    }
  })

  it('falls back to the second segment for a location nobody uploaded', () => {
    expect(regionOf('99_PL_Warsaw')).toBe('PL')
  })

  it('says so rather than guessing where there is no location', () => {
    expect(regionOf(null)).toBe('UNKNOWN')
    expect(regionOf('')).toBe('UNKNOWN')
  })
})

describe('a working weekend belongs to one location', () => {
  const CHINA = '05_CN_Shanghai / Changzhou / Beijing'
  // A Chinese make-up working day. It flanks the National Day holiday block.
  const MAKE_UP = '2026-09-20'

  it('is a Sunday', () => {
    expect(new Date(`${MAKE_UP}T00:00:00Z`).getUTCDay()).toBe(0)
  })

  it('is listed for that location and for no other', () => {
    const listed = Object.entries(catalogue.workingWeekends)
      .filter(([, dates]) => dates.includes(MAKE_UP))
      .map(([location]) => location)
    expect(listed).toEqual([CHINA])
  })

  it('is a working day there', () => {
    const days = buildMonth(2026, 9, CHINA)
    const day = days.find((d) => d.date === MAKE_UP)
    expect(day?.nonWorking).toBe(false)
    expect(day?.workingWeekend).toBe(true)
  })

  it('is not a working day in Berlin', () => {
    // One shared list applied everywhere made this a Berlin working day.
    const days = buildMonth(2026, 9, '01_DE_Berlin')
    const day = days.find((d) => d.date === MAKE_UP)
    expect(day?.nonWorking).toBe(true)
    expect(day?.workingWeekend).toBe(false)
  })

  it('leaves every other location its weekends', () => {
    for (const location of catalogue.locations) {
      if (location.code === CHINA) continue
      const days = buildMonth(2026, 9, location.code)
      const sundays = days.filter((d) => d.weekday === 7)
      expect(
        sundays.every((d) => d.nonWorking),
        location.code,
      ).toBe(true)
    }
  })

  it('counts the make-up day towards the working days', () => {
    const days = buildMonth(2026, 9, CHINA)
    const weekdays = days.filter((d) => d.weekday <= 5).length
    const holidaysOnWeekdays = (catalogue.holidays[CHINA] ?? []).filter((date) => {
      const day = days.find((d) => d.date === date)
      return day !== undefined && day.weekday <= 5
    }).length
    const makeUpDays = days.filter((d) => d.workingWeekend).length

    // September 2026 in Shanghai loses a weekday holiday and gains a Sunday.
    expect(makeUpDays).toBe(1)
    expect(workingDayCount(days)).toBe(weekdays - holidaysOnWeekdays + makeUpDays)
  })
})
