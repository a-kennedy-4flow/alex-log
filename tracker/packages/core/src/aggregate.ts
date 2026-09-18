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
 * The absences the tracker totals on lines of their own at rows 86 and 87.
 *
 * A booking against one of these is left out of the project block. Because a)
 * the tracker grand total is `SUM(K71:K87)` so a row in both places is counted
 * twice. b) the submitted August workbook books five vacation days and its
 * block at 71 to 85 names only the cost centre. c) an absence line that totals
 * nothing would be the alternative and the tracker prints both lines always.
 *
 * A label absent from this list stays in the block so no booked day can fall
 * between the two.
 */
export const ABSENCE_LINES = ['Vacation or sickness', 'Other absence'] as const

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
 *
 * The key is tracker column AB which the workbook names the combined cost
 * centre and builds as `CONCAT(I," - ",J)`. Cell K71 then sums column K over
 * every grid row carrying that key. The separator is repeated here so two ids
 * cannot join into the key of a third.
 *
 * Absence is totalled on its own lines and so is left out. See
 * [ABSENCE_LINES].
 */
export function aggregateByProject(halfDays: HalfDay[]): AggregateRow[] {
  const groups = new Map<string, AggregateRow>()
  for (const entry of filledEntries(halfDays)) {
    if (isAbsenceLine(entry.workdayId)) continue
    const key = `${entry.workdayId ?? ''} - ${entry.specification ?? ''}`
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

/** True when the tracker gives this label an absence line of its own. */
export function isAbsenceLine(workdayId: string | null): boolean {
  return workdayId !== null && (ABSENCE_LINES as readonly string[]).includes(workdayId)
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
