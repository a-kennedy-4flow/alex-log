// The rules for editing one half day.
//
// The grid and the board both write these rows. The rules live here rather than
// in either view. Because a) two views that compute a day apart will disagree
// on the total. b) the day value depends on what the other half of the day
// holds. c) a rule copied into a second view is a rule that drifts.

import { dayIsSplit, dayValueFor, defaultSpecificationFor, specificationsFor } from '@tracker/core'
import type { HalfDay } from '@tracker/core'

import { clearRow, profile, rowsByDate } from './useTimesheet'

/** Both halves of a day in grid order. */
export function rowsOf(date: string): HalfDay[] {
  return rowsByDate.value.get(date) ?? []
}

/**
 * The rows a day actually shows. The lower one appears only once the upper one
 * holds a cost centre and gives up half the day. A day therefore reads as one
 * row until something splits it.
 */
export function shownRows(date: string): HalfDay[] {
  const rows = rowsOf(date)
  const first = rows[0]
  if (!first) return []
  return dayIsSplit(rows) ? rows : [first]
}

/** A row is part filled when some of the three required fields are missing. */
export function incomplete(entry: HalfDay): boolean {
  const parts = [entry.workdayId, entry.specification, entry.days].filter(
    (v) => v !== null && v !== '',
  )
  return parts.length > 0 && parts.length < 3
}

export function specMismatch(entry: HalfDay): boolean {
  if (!entry.workdayId || !entry.specification) return false
  return !specificationsFor(entry.workdayId).options.includes(entry.specification)
}

/**
 * The upper row taking the whole day again takes the lower row with it. The
 * lower row is then off screen so leaving anything in it would ship a booking
 * the user cannot see.
 */
function clearLower(entry: HalfDay): void {
  if (entry.half !== 0) return
  const lower = rowsOf(entry.date)[1]
  if (lower && !dayIsSplit(rowsOf(entry.date))) clearRow(lower)
}

export function setDays(entry: HalfDay, value: 0.5 | 1 | null): void {
  entry.days = value
  clearLower(entry)
}

/**
 * Clearing the workday id drops the specification because the list changes.
 * Either way the day is shared again between the rows that remain filled.
 */
export function setWorkday(entry: HalfDay, value: string | null): void {
  entry.workdayId = value
  if (value === null) {
    entry.specification = null
    entry.specificationIsDefault = false
    entry.days = null
    entry.location = null
    entry.tasks = null
    clearLower(entry)
    return
  }
  // A cost centre allows its own list so a specification from the last one may
  // no longer be on it. Either way the user is given a starting point.
  const options = specificationsFor(value).options
  if (entry.specification === null || !options.includes(entry.specification)) {
    entry.specification = defaultSpecificationFor(value)
    entry.specificationIsDefault = entry.specification !== null
  }
  if (entry.location === null) entry.location = profile.location
  if (entry.days === null) entry.days = dayValueFor(rowsOf(entry.date), entry)
}

/** Choosing from the list makes it the user own pick rather than a default. */
export function setSpecification(entry: HalfDay, value: string | null): void {
  entry.specification = value
  entry.specificationIsDefault = false
}
