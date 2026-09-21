// The rules for editing one half day.
//
// The grid and the board both write these rows. The rules live here rather than
// in either view. Because a) two views that compute a day apart will disagree
// on the total. b) the day value depends on what the other half of the day
// holds. c) a rule copied into a second view is a rule that drifts.

import {
  dayIsSplit,
  dayValueFor,
  defaultSpecificationFor,
  specificationIsRequired,
  specificationsFor,
} from '@tracker/core'
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

/** True once a row holds anything. Nothing is asked of an empty one. */
export function started(entry: HalfDay): boolean {
  return entry.workdayId !== null || entry.specification !== null || entry.days !== null
}

/*
 * The three below name one field each rather than the row.
 *
 * The row used to carry one mark and every control in it took the colour. A
 * row missing only its day value therefore marked the cost centre that was
 * filled in and the user had to read all three to find the empty one.
 */

export function missingWorkday(entry: HalfDay): boolean {
  return started(entry) && entry.workdayId === null
}

/**
 * A cost centre that names its own list must be told which of them applies. One
 * whose list the workbook leaves empty has nothing that applies by right so a
 * blank there is not missing. `validate` in core holds the same rule and the
 * grid marked those rows against it before.
 */
export function missingSpecification(entry: HalfDay): boolean {
  if (!started(entry) || entry.specification !== null) return false
  return entry.workdayId !== null && specificationIsRequired(entry.workdayId)
}

export function missingDays(entry: HalfDay): boolean {
  return started(entry) && entry.days === null
}

/** A row is part filled when any one of its required fields is missing. */
export function incomplete(entry: HalfDay): boolean {
  return missingWorkday(entry) || missingSpecification(entry) || missingDays(entry)
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
 * Empties one row of a day as the clear button does. A booking in the lower
 * row moves up into the upper one when the upper one goes. Because a) the user
 * asked for the row they were looking at to go rather than the whole day. b)
 * the lower row is not on show without the upper one so a booking left behind
 * there would ship unseen.
 */
export function clearHalf(entry: HalfDay): void {
  clearRow(entry)
  if (entry.half !== 0) return
  const lower = rowsOf(entry.date)[1]
  if (!lower || lower.workdayId === null) return
  entry.workdayId = lower.workdayId
  entry.specification = lower.specification
  entry.specificationIsDefault = lower.specificationIsDefault
  entry.days = lower.days
  entry.location = lower.location
  entry.tasks = lower.tasks
  clearRow(lower)
}

/**
 * Clearing the workday id empties the whole row because a specification and a
 * day value without a cost centre are a part filled row. Either way the day is
 * shared again between the rows that remain filled.
 */
export function setWorkday(entry: HalfDay, value: string | null): void {
  if (value === null) {
    clearHalf(entry)
    return
  }
  entry.workdayId = value
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

/**
 * Drops the mark on a specification that was filled in.
 *
 * Opening the list is the double check the mark asks for. So the mark goes on
 * reaching the field rather than only on picking a different value. Because a)
 * the value filled in is usually the right one and confirming it is not an
 * edit. b) a mark that survives the check it asked for is a mark nobody can
 * clear. c) the stored field is what the reload reads so the answer has to be
 * written rather than held on the screen.
 */
export function confirmSpecification(entry: HalfDay): void {
  entry.specificationIsDefault = false
}
