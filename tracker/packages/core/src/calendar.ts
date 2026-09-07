// Calendar rules taken from the tracker workbook.
//
// A non-working day is a weekend or a bank holiday at the user location. A
// location may also list a Saturday that counts as a working day. Bank holidays
// differ between Berlin and Munich so the location is the key and not the
// country.

import type { CalendarDay } from './types'
import { catalogue } from './catalogue'

export interface HolidayData {
  /** Keyed by location code. Values are ISO dates. */
  holidays: Record<string, string[]>
  /** Weekend days that count as working days, keyed by location. */
  workingWeekends: Record<string, string[]>
}

/** The tracker grid starts at this row. */
export const FIRST_GRID_ROW = 5

/** The tracker grid ends here. It holds 31 days at two rows each. */
export const LAST_GRID_ROW = 66

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

/**
 * ISO 8601 week number. The tracker computes the same number with a serial date
 * expression at column F.
 */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  // Shift to the Thursday of the same ISO week. The week number is then the
  // week that Thursday falls in.
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
}

/** Monday is 1. Sunday is 7. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * Builds the calendar for one month at one location.
 *
 * The workbook holds a dead branch that would have read a second holiday row.
 * It always falls through to the weekend test so only the location holiday list
 * and the weekend matter. The working weekend list is applied here because the
 * spec asks for a working Saturday to be handled.
 */
export function buildMonth(
  year: number,
  month: number,
  location: string | null,
  data: HolidayData = catalogue,
): CalendarDay[] {
  const locationHolidays = new Set(location ? (data.holidays[location] ?? []) : [])
  // A working weekend belongs to the location that works it. Reading the list
  // of every location at once made a Chinese make-up day a Berlin working day.
  const workingWeekends = new Set(location ? (data.workingWeekends[location] ?? []) : [])
  const out: CalendarDay[] = []

  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const date = isoDate(year, month, day)
    const weekday = isoWeekday(date)
    const isHoliday = locationHolidays.has(date)
    const workingWeekend = workingWeekends.has(date)
    const isWeekend = weekday > 5 && !workingWeekend
    out.push({
      date,
      dayOfMonth: day,
      week: isoWeek(date),
      weekday,
      nonWorking: isHoliday || isWeekend,
      holiday: isHoliday,
      workingWeekend,
    })
  }
  return out
}

/** Counts the working days of a month. This is the default monthly target. */
export function workingDayCount(days: CalendarDay[]): number {
  return days.filter((d) => !d.nonWorking).length
}

/**
 * The tracker row a half day writes to. Day 1 upper half is row 5. Every day
 * takes two rows.
 */
export function trackerRow(dayOfMonth: number, half: 0 | 1): number {
  return FIRST_GRID_ROW + (dayOfMonth - 1) * 2 + half
}

/**
 * The day and the half one tracker row writes. The inverse of `trackerRow`.
 *
 * A validation issue carries tracker rows. The board holds cells by date so it
 * needs the day back to mark the one an issue points at.
 */
export function rowToDay(row: number): { dayOfMonth: number; half: 0 | 1 } | null {
  if (!Number.isInteger(row)) return null
  const offset = row - FIRST_GRID_ROW
  if (offset < 0 || row > LAST_GRID_ROW) return null
  return { dayOfMonth: Math.floor(offset / 2) + 1, half: (offset % 2) as 0 | 1 }
}

/** The weeks a month touches in the order the tracker lists them. */
export function weeksOf(days: CalendarDay[]): number[] {
  const seen: number[] = []
  for (const day of days) if (!seen.includes(day.week)) seen.push(day.week)
  return seen
}

/**
 * The days a user is expected to book for one month. Tracker cell K102.
 *
 * A month override wins because it is the most specific. The contract
 * percentage comes next. A full calendar month is the fallback. The result
 * lands on a half day because column K accepts nothing finer.
 */
export function targetDays(
  workingDays: number,
  workPercent: number | null,
  monthOverride: number | null,
): number {
  if (monthOverride !== null) return monthOverride
  if (workPercent === null) return workingDays
  return Math.round(workingDays * (workPercent / 100) * 2) / 2
}

/**
 * The working days that fall past the target.
 *
 * A part time month asks for fewer days than it holds. Counting from day one
 * puts the surplus at the end of the month. A day carrying the last half of the
 * target is not surplus so it is left out.
 */
export function daysPastTarget(days: CalendarDay[], target: number): Set<string> {
  const out = new Set<string>()
  let counted = 0
  for (const day of days) {
    if (day.nonWorking) continue
    if (counted >= target) out.add(day.date)
    counted++
  }
  return out
}
