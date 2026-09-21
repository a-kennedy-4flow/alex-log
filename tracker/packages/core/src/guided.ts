// Builds a month from four answers.
//
// Absence is the fixed part of a month. A day off is recorded on the day it was
// taken because that is the date the recipient checks. Work is the free part.
// The tracker asks what was worked in the month and never on which day so the
// work is spread over whatever the absence leaves.
//
// The split is the whole reason this exists. A month filled by share alone puts
// a day off wherever the arithmetic lands it.

import { defaultSpecificationFor } from './catalogue'
import {
  bookableDays,
  collapseWholeDays,
  emptyGrid,
  halvesPerAllocation,
  type Allocation,
} from './distribute'
import type { CalendarDay, HalfDay } from './types'

/** One day this user was away. */
export interface GuidedAbsence {
  date: string
  /** An absence label from the catalogue. `Vacation or sickness` is one. */
  workdayId: string
  days: 0.5 | 1
}

export interface GuidedInput {
  days: CalendarDay[]
  absences: readonly GuidedAbsence[]
  allocations: readonly Allocation[]
  /** What the month expects of this user. Tracker cell K102. */
  target: number
}

export interface GuidedMonth {
  halfDays: HalfDay[]
  /** Days of absence written. */
  absenceDays: number
  /** Days of work the shares were asked to cover. */
  workDays: number
  /**
   * Days the month is short of its target. Zero when it fits.
   *
   * A month runs short when the free days ran out before the shares did. That
   * happens where the absence took days the target still needed.
   */
  shortBy: number
  /** Absence dates that are not working days. Nothing was written for them. */
  ignored: string[]
}

/** Rounds to the nearest half day. A booking lands on no other boundary. */
function toHalf(days: number): number {
  return Math.round(days * 2) / 2
}

/**
 * The absence days that can be written.
 *
 * A bank holiday and a weekend are dropped rather than booked. Because a) the
 * tracker books no non working day so the row would be an error. b) somebody
 * marking a holiday as leave has miscounted rather than worked. c) the count is
 * reported so the miscount is visible.
 */
function workingAbsences(
  absences: readonly GuidedAbsence[],
  days: CalendarDay[],
): { kept: GuidedAbsence[]; ignored: string[] } {
  const working = new Map(days.map((day) => [day.date, day]))
  const kept: GuidedAbsence[] = []
  const ignored: string[] = []
  const seen = new Set<string>()
  for (const absence of absences) {
    const day = working.get(absence.date)
    if (!day || day.nonWorking || seen.has(absence.date)) {
      ignored.push(absence.date)
      continue
    }
    seen.add(absence.date)
    kept.push(absence)
  }
  return { kept, ignored }
}

/**
 * The month as the four answers describe it.
 *
 * The absence is written first and the day it sits on is then closed to work.
 * A half day off closes the whole day rather than leaving the other half open.
 * Because a) the work spread divides a month by week and knows nothing of a day
 * already part booked. b) half a day is what such a month falls short by and
 * `shortBy` says so. c) the user finishes that day in the month view where the
 * other half is one click.
 */
export function guidedMonth({ days, absences, allocations, target }: GuidedInput): GuidedMonth {
  const { kept, ignored } = workingAbsences(absences, days)
  const grid = emptyGrid(days)
  const upper = new Map(grid.filter((row) => row.half === 0).map((row) => [row.date, row]))

  let absenceDays = 0
  for (const absence of kept) {
    const row = upper.get(absence.date)
    if (!row) continue
    row.workdayId = absence.workdayId
    row.specification = defaultSpecificationFor(absence.workdayId)
    row.specificationIsDefault = row.specification !== null
    row.days = absence.days
    row.location = null
    absenceDays += absence.days
  }

  const away = new Set(kept.map((absence) => absence.date))
  const free = days.map((day) => (away.has(day.date) ? { ...day, nonWorking: true } : day))
  const workDays = Math.max(0, toHalf(target - absenceDays))

  const bookable = bookableDays(free, workDays)
  const slots: HalfDay[] = []
  for (const day of free) {
    const amount = bookable.get(day.date) ?? 0
    if (amount <= 0) continue
    const row = upper.get(day.date)
    if (!row) continue
    slots.push(row)
    if (amount === 1) {
      const lower = grid.find((entry) => entry.date === day.date && entry.half === 1)
      if (lower) slots.push(lower)
    }
  }

  const halves = halvesPerAllocation([...allocations], workDays)
  let cursor = 0
  allocations.forEach((allocation, index) => {
    let remaining = halves[index] ?? 0
    while (remaining > 0 && cursor < slots.length) {
      const slot = slots[cursor] as HalfDay
      slot.workdayId = allocation.workdayId
      slot.specification = allocation.specification ?? defaultSpecificationFor(allocation.workdayId)
      slot.specificationIsDefault = allocation.specification === null && slot.specification !== null
      slot.days = 0.5
      slot.location = allocation.location
      slot.tasks = allocation.tasks
      remaining--
      cursor++
    }
  })

  // What the shares asked for beyond the slots the month had left.
  const asked = halves.reduce((sum, half) => sum + half, 0)
  const shortBy = toHalf(Math.max(0, asked - cursor) / 2)

  return {
    halfDays: collapseWholeDays(grid),
    absenceDays,
    workDays,
    shortBy,
    ignored,
  }
}
