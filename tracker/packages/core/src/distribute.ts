// Spreads a month total across the grid for the simple view.
//
// The user gives each cost centre a share. The month fills from the first day
// onwards. Non-working days are skipped. A day splits into two halves so every
// amount lands on a 0.5 boundary. A day taken whole by one cost centre collapses
// to a single row so the sheet reads the way a hand filled one does.

import type { CalendarDay, HalfDay } from './types'
import { defaultSpecificationFor } from './catalogue'

export interface Allocation {
  workdayId: string
  specification: string | null
  /** Share of the monthly target. 0 through 100. */
  percent: number
  location: string | null
  tasks: string | null
}

/** Rounds to the nearest half day. */
function toHalves(days: number): number {
  return Math.round(days * 2)
}

export function percentTotal(allocations: Allocation[]): number {
  return allocations.reduce((sum, a) => sum + a.percent, 0)
}

/**
 * Converts shares into whole half days. Rounding leaves a remainder so the
 * largest share absorbs it. That keeps the month total exactly on target.
 */
export function halvesPerAllocation(allocations: Allocation[], target: number): number[] {
  const wanted = toHalves(target)
  const halves = allocations.map((a) => toHalves((a.percent / 100) * target))
  let drift = wanted - halves.reduce((sum, h) => sum + h, 0)
  if (drift === 0 || halves.length === 0) return halves

  // Give the remainder to the largest share. Repeat because one step of drift
  // can exceed what a single share can give back.
  const order = halves
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h - a.h)
    .map((x) => x.i)
  let cursor = 0
  while (drift !== 0) {
    const index = order[cursor % order.length] as number
    const next = (halves[index] as number) + Math.sign(drift)
    if (next >= 0) {
      halves[index] = next
      drift -= Math.sign(drift)
    }
    cursor++
    if (cursor > order.length * (Math.abs(wanted) + 2)) break
  }
  return halves
}

function blank(date: string, half: 0 | 1): HalfDay {
  return {
    date,
    half,
    workdayId: null,
    specification: null,
    specificationIsDefault: false,
    days: null,
    location: null,
    tasks: null,
  }
}

/**
 * How much of a day is still free.
 *
 * A day holds one day of work. The upper row is what the user sets so the lower
 * row can only take what the upper leaves.
 */
export function spareOfDay(rows: HalfDay[]): number {
  const used = rows.reduce((sum, row) => sum + (row.days ?? 0), 0)
  return Math.max(0, Math.round((1 - used) * 2) / 2)
}

/**
 * The day value a row takes when it is first given a cost centre.
 *
 * The upper row takes the whole day. The lower row takes what is left, which is
 * a half because the lower row is only reachable once the upper is set to a
 * half.
 */
export function dayValueFor(rows: HalfDay[], row: HalfDay): 0.5 | 1 {
  if (row.half === 0) return 1
  return spareOfDay(rows) >= 1 ? 1 : 0.5
}

/**
 * The values the days dropdown may offer for one row.
 *
 * The lower row is offered only what the upper leaves so a day cannot be
 * pushed over one from a dropdown that should never have shown the value.
 */
export function dayOptionsFor(rows: HalfDay[], row: HalfDay): (0.5 | 1)[] {
  if (row.half === 0) return [0.5, 1]
  const spare = spareOfDay(rows) + (row.days ?? 0)
  return spare >= 1 ? [0.5, 1] : [0.5]
}

/**
 * True when the lower row of a day is reachable.
 *
 * A day splits only when the user says so by setting the upper row to a half.
 * Filling a second cost centre is then what uses the other half.
 */
export function dayIsSplit(rows: HalfDay[]): boolean {
  const upper = rows.find((row) => row.half === 0)
  return upper !== undefined && upper.workdayId !== null && upper.days === 0.5
}

/** An empty grid for the month. Two rows for every calendar day. */
export function emptyGrid(days: CalendarDay[]): HalfDay[] {
  return days.flatMap((d) => [blank(d.date, 0), blank(d.date, 1)])
}

/**
 * Which days of one week to leave unbooked and by how much.
 *
 * A part time month is short of days so some working days go unbooked. Spread
 * over the month they would all fall at its end. Spread over the week they fall
 * one a week which is how a four day week is actually worked.
 *
 * The skipped days are chosen evenly inside the week and rotated by the week
 * number so the same weekday is not always the one dropped.
 */
export function daysBookedInWeek(
  workingDays: number,
  daysToBook: number,
  weekIndex: number,
): number[] {
  const amounts = new Array<number>(workingDays).fill(0)
  if (workingDays === 0 || daysToBook <= 0) return amounts

  const whole = Math.min(Math.floor(daysToBook), workingDays)
  const half = daysToBook - whole >= 0.5 && whole < workingDays
  const skipped = workingDays - whole

  if (skipped === 0) {
    amounts.fill(1)
    return amounts
  }

  // Space the skipped days out then turn the whole set by one place a week.
  const drop = new Set<number>()
  for (let j = 0; j < skipped; j++) {
    drop.add((Math.floor(((j + 0.5) * workingDays) / skipped) + weekIndex) % workingDays)
  }

  for (let i = 0; i < workingDays; i++) if (!drop.has(i)) amounts[i] = 1
  // The odd half day goes on the first day that was dropped so the week still
  // reads left to right.
  if (half) {
    const first = [...drop].sort((a, b) => a - b)[0]
    if (first !== undefined) amounts[first] = 0.5
  }
  return amounts
}

/**
 * How much of each working day the month should carry.
 *
 * The target is split between the weeks in proportion to their working days so
 * a short week is not asked for the same as a full one. Rounding leaves a
 * remainder which the weeks take in turn.
 */
export function bookableDays(days: CalendarDay[], target: number): Map<string, number> {
  const out = new Map<string, number>()
  const weeks: { week: number; days: CalendarDay[] }[] = []
  for (const day of days) {
    if (day.nonWorking) continue
    const last = weeks.at(-1)
    if (last && last.week === day.week) last.days.push(day)
    else weeks.push({ week: day.week, days: [day] })
  }

  const workingDays = weeks.reduce((sum, w) => sum + w.days.length, 0)
  if (workingDays === 0) return out

  const wanted = Math.min(target, workingDays)
  const wholeDays = Math.floor(wanted)
  const hasHalf = wanted - wholeDays >= 0.5

  // Whole days are shared out by largest remainder so the total is exact and
  // no week is handed a half it did not earn. Rounding each week on its own
  // would give two weeks half a day each where one whole day was meant.
  const exact = weeks.map((w) => (wholeDays * w.days.length) / workingDays)
  const perWeek = exact.map((value) => Math.floor(value))
  let remaining = wholeDays - perWeek.reduce((sum, n) => sum + n, 0)

  const byRemainder = exact
    .map((value, i) => ({ remainder: value - Math.floor(value), length: weeks[i]!.days.length, i }))
    .sort((a, b) => b.remainder - a.remainder || b.length - a.length)
    .map((x) => x.i)

  // Two passes. The first respects the order. The second mops up anything the
  // capacity of a short week refused.
  for (const pass of [0, 1]) {
    for (const i of byRemainder) {
      if (remaining <= 0) break
      if ((perWeek[i] as number) < weeks[i]!.days.length) {
        perWeek[i] = (perWeek[i] as number) + 1
        remaining--
      }
    }
    if (remaining <= 0 || pass === 1) break
  }

  // The month carries at most one half day. It goes to the last week with room
  // so the short weeks at the start stay whole.
  if (hasHalf) {
    for (let i = weeks.length - 1; i >= 0; i--) {
      if ((perWeek[i] as number) < weeks[i]!.days.length) {
        perWeek[i] = (perWeek[i] as number) + 0.5
        break
      }
    }
  }

  weeks.forEach((week, index) => {
    const amounts = daysBookedInWeek(week.days.length, perWeek[index] ?? 0, index)
    week.days.forEach((day, i) => {
      const amount = amounts[i] ?? 0
      if (amount > 0) out.set(day.date, amount)
    })
  })
  return out
}

export function distribute(
  allocations: Allocation[],
  days: CalendarDay[],
  target: number,
): HalfDay[] {
  const grid = emptyGrid(days)
  const byKey = new Map(grid.map((h) => [`${h.date}:${h.half}`, h]))
  const bookable = bookableDays(days, target)
  const slots: HalfDay[] = []
  for (const day of days) {
    const amount = bookable.get(day.date) ?? 0
    if (amount <= 0) continue
    slots.push(byKey.get(`${day.date}:0`) as HalfDay)
    if (amount === 1) slots.push(byKey.get(`${day.date}:1`) as HalfDay)
  }

  const halves = halvesPerAllocation(allocations, target)
  let cursor = 0
  allocations.forEach((allocation, index) => {
    let remaining = halves[index] ?? 0
    while (remaining > 0 && cursor < slots.length) {
      const slot = slots[cursor] as HalfDay
      slot.workdayId = allocation.workdayId
      slot.specification = allocation.specification ?? defaultSpecificationFor(allocation.workdayId)
      // Nothing was filled in for the user when the cost centre names no list.
      slot.specificationIsDefault = allocation.specification === null && slot.specification !== null
      slot.days = 0.5
      slot.location = allocation.location
      slot.tasks = allocation.tasks
      remaining--
      cursor++
    }
  })

  return collapseWholeDays(grid)
}

/**
 * Turns a day held entirely by one cost centre into a single row of 1 day. The
 * lower row is cleared. This matches how the sample workbook was filled by hand.
 */
export function collapseWholeDays(grid: HalfDay[]): HalfDay[] {
  const byDate = new Map<string, HalfDay[]>()
  for (const half of grid) {
    const list = byDate.get(half.date) ?? []
    list.push(half)
    byDate.set(half.date, list)
  }
  for (const list of byDate.values()) {
    const upper = list.find((h) => h.half === 0)
    const lower = list.find((h) => h.half === 1)
    if (!upper || !lower) continue
    const sameEntry =
      upper.workdayId !== null &&
      upper.workdayId === lower.workdayId &&
      upper.specification === lower.specification &&
      upper.days === 0.5 &&
      lower.days === 0.5
    if (!sameEntry) continue
    upper.days = 1
    lower.workdayId = null
    lower.specification = null
    lower.specificationIsDefault = false
    lower.days = null
    lower.location = null
    lower.tasks = null
  }
  return grid
}
