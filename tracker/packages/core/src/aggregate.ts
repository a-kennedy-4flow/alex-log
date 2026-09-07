// The two summary blocks the tracker keeps below the grid.
//
// The export carries no lookup table so both blocks ship as values. That makes
// this module the authority for them.

import type { AggregateRow, CalendarDay, HalfDay, WeekRow } from './types'
import { findProject } from './catalogue'
import { weeksOf } from './calendar'

/** The tracker aggregation block holds this many project rows at 71 to 85. */
export const AGGREGATE_SLOTS = 15

/**
 * Every row carrying a day value.
 *
 * A missing cost centre does not exclude the row. Because a) the tracker totals
 * column K on its own. b) its O3 check reports the missing cost centre
 * separately. c) dropping the row here would understate the month and hide the
 * fault. The shipped sample holds eight such rows.
 */
export function filledEntries(halfDays: HalfDay[]): HalfDay[] {
  return halfDays.filter((h) => h.days !== null)
}

/**
 * Groups the entries by workday id and specification. Mirrors tracker rows 71
 * to 85.
 */
export function aggregateByProject(halfDays: HalfDay[]): AggregateRow[] {
  const groups = new Map<string, AggregateRow>()
  for (const entry of filledEntries(halfDays)) {
    const key = `${entry.workdayId ?? ''} ${entry.specification ?? ''}`
    const existing = groups.get(key)
    if (existing) {
      existing.days += entry.days ?? 0
      continue
    }
    const project = findProject(entry.workdayId)
    groups.set(key, {
      workdayId: entry.workdayId,
      specification: entry.specification,
      days: entry.days ?? 0,
      customer: project?.customer ?? null,
      projectTitle: project?.projectTitle ?? null,
      businessLine: project?.businessLine ?? null,
    })
  }
  return [...groups.values()].sort((a, b) => b.days - a.days)
}

/** Total days booked against one absence label. Mirrors rows 86 and 87. */
export function absenceTotal(halfDays: HalfDay[], label: string): number {
  return filledEntries(halfDays)
    .filter((h) => h.workdayId === label)
    .reduce((sum, h) => sum + (h.days ?? 0), 0)
}

/** Mirrors tracker cell K101. */
export function totalDays(halfDays: HalfDay[]): number {
  return filledEntries(halfDays).reduce((sum, h) => sum + (h.days ?? 0), 0)
}

/**
 * Splits each week into days booked on working days and days booked on
 * non-working days. Mirrors tracker rows 95 to 100.
 */
export function aggregateByWeek(halfDays: HalfDay[], days: CalendarDay[]): WeekRow[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const rows = new Map<number, WeekRow>()
  for (const week of weeksOf(days)) {
    rows.set(week, { week, workingDays: 0, nonWorkingDays: 0, total: 0 })
  }
  for (const entry of filledEntries(halfDays)) {
    const day = byDate.get(entry.date)
    const row = day ? rows.get(day.week) : undefined
    if (!day || !row) continue
    const amount = entry.days ?? 0
    if (day.nonWorking) row.nonWorkingDays += amount
    else row.workingDays += amount
    row.total += amount
  }
  return [...rows.values()]
}

/** Days booked against one calendar date across both halves. */
export function dayTotals(halfDays: HalfDay[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const entry of filledEntries(halfDays)) {
    out.set(entry.date, (out.get(entry.date) ?? 0) + (entry.days ?? 0))
  }
  return out
}
