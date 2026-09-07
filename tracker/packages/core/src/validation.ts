// Validation taken from the tracker workbook.
//
// The tracker reports two messages. Cell O3 reports missing or invalid entries.
// Cell O2 reports the gap against the monthly target. An error blocks the
// export. A warning does not.
//
// One rule is an addition. A calendar day cannot hold more than one booked day.
// The workbook never checks it because its only guard is the monthly total.

import type { CalendarDay, HalfDay, ValidationIssue } from './types'
import { specificationIsRequired, specificationsFor } from './catalogue'
import { trackerRow } from './calendar'
import { AGGREGATE_SLOTS, aggregateByProject, dayTotals, totalDays } from './aggregate'

/** Column K accepts these and nothing else. */
const ALLOWED_DAYS = [0.5, 1]

function rowOf(entry: HalfDay, days: CalendarDay[]): string {
  const day = days.find((d) => d.date === entry.date)
  return day ? String(trackerRow(day.dayOfMonth, entry.half)) : entry.date
}

export interface ValidationInput {
  halfDays: HalfDay[]
  days: CalendarDay[]
  /** Tracker cell K102. Adjusted work days when set otherwise the calendar. */
  target: number
  /** Tracker cell A2. The office the user works from. */
  location?: string | null
  /** The legal entity the user belongs to. */
  entity?: string | null
}

export function validate({
  halfDays,
  days,
  target,
  location,
  entity,
}: ValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  /*
   * The settings come first because a month cannot be right without them. The
   * office decides the bank holidays and therefore the working days and the
   * target, and it names the file the recipient reads. Missing it is an error
   * rather than a warning.
   */
  if (location === null || location === '') {
    issues.push({ severity: 'error', code: 'locationMissing' })
  }
  if (entity === null || entity === '') {
    issues.push({ severity: 'warning', code: 'entityMissing' })
  }

  /*
   * An entry needs a workday id and a day value. It needs a specification as
   * well when the cost centre names a list of its own. A cost centre whose list
   * the workbook leaves empty has nothing that applies by right so a blank is
   * not a fault.
   *
   * This departs from the tracker. Cell O3 counts columns I and J and K and
   * calls the sheet invalid unless all three hold the same number of entries.
   * 44 cost centres have no list so that rule would make them unbookable.
   */
  const incomplete = halfDays.filter((h) => {
    const started = h.workdayId !== null || h.specification !== null || h.days !== null
    if (!started) return false
    if (h.workdayId === null || h.days === null) return true
    return specificationIsRequired(h.workdayId) && h.specification === null
  })
  if (incomplete.length > 0) {
    issues.push({
      severity: 'error',
      code: 'incompleteEntries',
      values: { count: incomplete.length },
      rows: incomplete.map((h) => rowOf(h, days)),
    })
  }

  /* Column K rejects anything but 0.5 or 1. */
  const badAmount = halfDays.filter((h) => h.days !== null && !ALLOWED_DAYS.includes(h.days))
  if (badAmount.length > 0) {
    issues.push({
      severity: 'error',
      code: 'invalidDayValue',
      values: { count: badAmount.length },
      rows: badAmount.map((h) => rowOf(h, days)),
    })
  }

  /* Mirrors tracker column AC. */
  const mismatched: HalfDay[] = []
  const unverified: HalfDay[] = []
  for (const entry of halfDays) {
    if (!entry.workdayId || !entry.specification) continue
    const spec = specificationsFor(entry.workdayId)
    if (!spec.options.includes(entry.specification)) mismatched.push(entry)
    // Said only when a value was chosen. A blank on such a row is allowed and
    // saying so on every one of them would be noise.
    else if (!spec.hasOwnList) unverified.push(entry)
  }
  if (mismatched.length > 0) {
    issues.push({
      severity: 'error',
      code: 'specificationMismatch',
      values: { count: mismatched.length },
      rows: mismatched.map((h) => rowOf(h, days)),
    })
  }
  if (unverified.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'specificationUnverified',
      values: { count: unverified.length },
      rows: unverified.map((h) => rowOf(h, days)),
    })
  }

  /* A day holds one day of work at most. */
  const overbooked = [...dayTotals(halfDays)].filter(([, amount]) => amount > 1)
  if (overbooked.length > 0) {
    issues.push({
      severity: 'error',
      code: 'dayOverbooked',
      values: { count: overbooked.length, dates: overbooked.map(([date]) => date).join(' ') },
    })
  }

  /* Mirrors tracker cell O2. */
  const total = totalDays(halfDays)
  const delta = Math.round((total - target) * 2) / 2
  if (delta < 0) {
    issues.push({ severity: 'warning', code: 'daysMissing', values: { days: Math.abs(delta) } })
  } else if (delta > 0) {
    issues.push({ severity: 'warning', code: 'daysTooMany', values: { days: delta } })
  }

  /* The tracker block holds 15 project rows. A longer list needs a taller block. */
  const groups = aggregateByProject(halfDays).length
  if (groups > AGGREGATE_SLOTS) {
    issues.push({
      severity: 'warning',
      code: 'aggregateOverflow',
      values: { count: groups, slots: AGGREGATE_SLOTS },
    })
  }

  return issues
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}

/** True when the sheet is complete and the target is met. */
export function isComplete(issues: ValidationIssue[], halfDays: HalfDay[]): boolean {
  return issues.length === 0 && halfDays.some((h) => h.days !== null)
}
