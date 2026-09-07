// The quick fill spread. The workbook has no equivalent so these rules come
// from the spec. Shares fill from the first day onwards and skip non-working
// days.

import { describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'

import type { Allocation, HalfDay } from '../index'
import {
  bookableDays,
  buildMonth,
  collapseWholeDays,
  dayIsSplit,
  dayOptionsFor,
  dayValueFor,
  daysBookedInWeek,
  distribute,
  emptyGrid,
  halvesPerAllocation,
  setCatalogue,
  spareOfDay,
  totalDays,
  workingDayCount,
} from '../index'

setCatalogue(await loadCatalogue())

const LOCATION = '01_DE_Berlin'
const days = buildMonth(2026, 4, LOCATION)
const workingDays = workingDayCount(days)

function allocation(workdayId: string, percent: number): Allocation {
  return { workdayId, specification: '4s_Overheads_Other', percent, location: LOCATION, tasks: null }
}

describe('the share arithmetic', () => {
  it('splits a target in two', () => {
    expect(halvesPerAllocation([allocation('a', 50), allocation('b', 50)], 20)).toEqual([20, 20])
  })

  it('hits the target exactly when a share does not divide evenly', () => {
    const rows = [allocation('a', 70), allocation('b', 30)]
    const halves = halvesPerAllocation(rows, 22)
    expect(halves.reduce((sum, h) => sum + h, 0)).toBe(44)
  })

  it('gives the rounding remainder to the largest share', () => {
    const rows = [allocation('a', 34), allocation('b', 33), allocation('c', 33)]
    const halves = halvesPerAllocation(rows, 21)
    expect(halves.reduce((sum, h) => sum + h, 0)).toBe(42)
    expect(Math.max(...halves)).toBe(halves[0])
  })

  it('returns nothing for no shares', () => {
    expect(halvesPerAllocation([], 20)).toEqual([])
  })
})

describe('the spread', () => {
  it('books the target and nothing more', () => {
    const grid = distribute([allocation('18019', 100)], days, workingDays)
    expect(totalDays(grid)).toBe(workingDays)
  })

  it('never books a non-working day', () => {
    const grid = distribute([allocation('18019', 100)], days, workingDays)
    const nonWorking = new Set(days.filter((d) => d.nonWorking).map((d) => d.date))
    const offending = grid.filter((h) => h.days !== null && nonWorking.has(h.date))
    expect(offending).toEqual([])
  })

  it('starts on the first working day when every day is booked', () => {
    const grid = distribute([allocation('18019', 100)], days, workingDays)
    const booked = grid.filter((h) => h.days !== null)
    const firstWorkingDay = days.find((d) => !d.nonWorking)
    expect(booked[0]?.date).toBe(firstWorkingDay?.date)
    expect(totalDays(grid)).toBe(workingDays)
  })

  it('lands a single booked day as one whole day', () => {
    const grid = distribute([allocation('18019', 100)], days, 1)
    const booked = grid.filter((h) => h.days !== null)
    expect(booked).toHaveLength(1)
    expect(booked[0]?.days).toBe(1)
  })

  it('splits 70 and 30 in order and keeps the total', () => {
    const rows = [allocation('18019', 70), allocation('18119', 30)]
    const grid = distribute(rows, days, 20)
    expect(totalDays(grid)).toBe(20)
    const booked = grid.filter((h) => h.days !== null)
    const first = booked.filter((h) => h.workdayId === '18019')
    const second = booked.filter((h) => h.workdayId === '18119')
    expect(first.reduce((sum, h) => sum + (h.days ?? 0), 0)).toBe(14)
    expect(second.reduce((sum, h) => sum + (h.days ?? 0), 0)).toBe(6)
    // The first share takes the earlier dates.
    const lastOfFirst = first.at(-1)?.date ?? ''
    const firstOfSecond = second[0]?.date ?? ''
    expect(lastOfFirst <= firstOfSecond).toBe(true)
  })

  it('leaves a half day when a share lands on a half', () => {
    const rows = [allocation('18019', 50), allocation('18119', 50)]
    const grid = distribute(rows, days, 5)
    expect(totalDays(grid)).toBe(5)
    expect(grid.some((h) => h.days === 0.5)).toBe(true)
  })
})

describe('collapsing a whole day', () => {
  it('turns two matching halves into one row of a full day', () => {
    const grid = emptyGrid(days.slice(0, 1))
    for (const half of grid) {
      half.workdayId = '18019'
      half.specification = '4s_Overheads_Other'
      half.days = 0.5
    }
    collapseWholeDays(grid)
    expect(grid[0]?.days).toBe(1)
    expect(grid[1]?.days).toBeNull()
    expect(grid[1]?.workdayId).toBeNull()
  })

  it('leaves two different cost centres alone', () => {
    const grid = emptyGrid(days.slice(0, 1))
    grid[0]!.workdayId = '18019'
    grid[0]!.days = 0.5
    grid[1]!.workdayId = '18119'
    grid[1]!.days = 0.5
    collapseWholeDays(grid)
    expect(grid[0]?.days).toBe(0.5)
    expect(grid[1]?.days).toBe(0.5)
  })
})

describe('sharing a day between its rows', () => {
  function day(): [HalfDay, HalfDay] {
    return [
      { date: '2026-04-01', half: 0, workdayId: null, specification: null, specificationIsDefault: false, days: null, location: null, tasks: null },
      { date: '2026-04-01', half: 1, workdayId: null, specification: null, specificationIsDefault: false, days: null, location: null, tasks: null },
    ]
  }

  it('gives the upper row the whole day', () => {
    const rows = day()
    rows[0].workdayId = '18019'
    expect(dayValueFor(rows, rows[0])).toBe(1)
  })

  it('keeps the day closed while the upper row holds a whole day', () => {
    const rows = day()
    rows[0].workdayId = '18019'
    rows[0].days = 1
    expect(dayIsSplit(rows)).toBe(false)
  })

  it('opens the day once the upper row is set to a half', () => {
    const rows = day()
    rows[0].workdayId = '18019'
    rows[0].days = 0.5
    expect(dayIsSplit(rows)).toBe(true)
  })

  it('leaves an empty day closed', () => {
    expect(dayIsSplit(day())).toBe(false)
  })

  it('keeps a day with no cost centre closed however its days read', () => {
    const rows = day()
    rows[0].days = 0.5
    expect(dayIsSplit(rows)).toBe(false)
  })

  it('gives the lower row what the upper leaves', () => {
    const rows = day()
    rows[0].workdayId = '18019'
    rows[0].days = 0.5
    rows[1].workdayId = '18119'
    expect(dayValueFor(rows, rows[1])).toBe(0.5)
  })

  it('reports what is still free', () => {
    const rows = day()
    expect(spareOfDay(rows)).toBe(1)
    rows[0].days = 0.5
    expect(spareOfDay(rows)).toBe(0.5)
    rows[1].days = 0.5
    expect(spareOfDay(rows)).toBe(0)
    rows[0].days = 1
    expect(spareOfDay(rows)).toBe(0)
  })

  it('offers the lower row only what fits', () => {
    const rows = day()
    rows[0].workdayId = '18019'
    rows[0].days = 0.5
    expect(dayOptionsFor(rows, rows[0])).toEqual([0.5, 1])
    expect(dayOptionsFor(rows, rows[1])).toEqual([0.5])
  })

  it('never lets a split day exceed one', () => {
    const rows = day()
    rows[0].workdayId = '18019'
    rows[0].days = 0.5
    rows[1].workdayId = '18119'
    rows[1].days = dayValueFor(rows, rows[1])
    expect((rows[0].days ?? 0) + (rows[1].days ?? 0)).toBe(1)
  })
})

describe('spreading a part time month over its weeks', () => {
  const august = buildMonth(2026, 8, LOCATION)
  const augustWorking = workingDayCount(august)

  function perWeek(book: Map<string, number>, source = august) {
    const out = new Map<number, number>()
    for (const day of source) {
      const amount = book.get(day.date) ?? 0
      if (amount > 0) out.set(day.week, (out.get(day.week) ?? 0) + amount)
    }
    return out
  }

  it('books every working day at a full contract', () => {
    const book = bookableDays(august, augustWorking)
    expect([...book.values()].reduce((s, v) => s + v, 0)).toBe(augustWorking)
    expect(book.size).toBe(augustWorking)
  })

  it('books exactly the target', () => {
    for (const target of [17, 12.5, 8, 1, 0.5]) {
      const book = bookableDays(august, target)
      expect([...book.values()].reduce((s, v) => s + v, 0), String(target)).toBe(target)
    }
  })

  it('drops one day a week at eighty per cent rather than four at the end', () => {
    const book = bookableDays(august, 17)
    const full = august.filter((d) => !d.nonWorking && d.week === 32)
    const booked = full.filter((d) => (book.get(d.date) ?? 0) > 0)
    // A five day week keeps four of its days.
    expect(full).toHaveLength(5)
    expect(booked).toHaveLength(4)

    // The last week of the month is not the only one short.
    const weeks = [...perWeek(book).entries()].filter(([, days]) => days >= 4)
    expect(weeks.length).toBeGreaterThan(1)
  })

  it('never leaves a whole week unbooked while another is full', () => {
    const book = bookableDays(august, 17)
    const workingPerWeek = new Map<number, number>()
    for (const day of august) {
      if (!day.nonWorking) workingPerWeek.set(day.week, (workingPerWeek.get(day.week) ?? 0) + 1)
    }
    for (const [week, working] of workingPerWeek) {
      const booked = perWeek(book).get(week) ?? 0
      // Every week carries at least three quarters of its days at this share.
      expect(booked / working, `CW ${week}`).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('moves the dropped day from one week to the next', () => {
    const book = bookableDays(august, 17)
    const dropped: number[] = []
    for (const day of august) {
      if (day.nonWorking) continue
      if ((book.get(day.date) ?? 0) === 0) dropped.push(day.weekday)
    }
    // Four weeks lose a day and they are not all the same weekday.
    expect(dropped.length).toBeGreaterThan(1)
    expect(new Set(dropped).size).toBeGreaterThan(1)
  })

  it('books nothing for a target of zero', () => {
    expect(bookableDays(august, 0).size).toBe(0)
  })

  it('never books a non-working day', () => {
    const book = bookableDays(august, 17)
    for (const day of august.filter((d) => d.nonWorking)) {
      expect(book.has(day.date), day.date).toBe(false)
    }
  })

  it('feeds the spread through to the grid', () => {
    const grid = distribute([allocation('18019', 100)], august, 17)
    expect(totalDays(grid)).toBe(17)
    const booked = new Set(grid.filter((h) => h.days !== null).map((h) => h.date))
    const week32 = august.filter((d) => !d.nonWorking && d.week === 32 && booked.has(d.date))
    expect(week32).toHaveLength(4)
  })
})

describe('choosing which days of a week to book', () => {
  it('keeps them all when nothing is dropped', () => {
    expect(daysBookedInWeek(5, 5, 0)).toEqual([1, 1, 1, 1, 1])
  })

  it('spaces a single dropped day away from the edges', () => {
    const amounts = daysBookedInWeek(5, 4, 0)
    expect(amounts.filter((a) => a === 1)).toHaveLength(4)
    expect(amounts.indexOf(0)).not.toBe(0)
    expect(amounts.indexOf(0)).not.toBe(4)
  })

  it('turns the dropped day by one place each week', () => {
    const first = daysBookedInWeek(5, 4, 0).indexOf(0)
    const second = daysBookedInWeek(5, 4, 1).indexOf(0)
    expect(second).not.toBe(first)
  })

  it('puts an odd half day on a day that was dropped', () => {
    const amounts = daysBookedInWeek(5, 3.5, 0)
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(3.5)
    expect(amounts.filter((a) => a === 0.5)).toHaveLength(1)
  })

  it('handles a week shorter than the drop', () => {
    expect(daysBookedInWeek(1, 1, 0)).toEqual([1])
    expect(daysBookedInWeek(1, 0, 0)).toEqual([0])
    expect(daysBookedInWeek(0, 3, 0)).toEqual([])
  })
})
