// Turning Jira hours into days the tracker can hold.
//
// Jira supplies no hours on the 4flow site so the user types most of them. See
// `docs/jira.md`. What arrives here is a number of hours against a Workday ID
// and what leaves is a number of days the export can write.
//
// Rounding runs per Workday ID rather than once on the total. So the rounded
// total is almost always larger than the true one. Both figures are returned
// because the user is answerable for the number they submit.
//
// A half day is the day length halved rather than a fixed four hours. The
// length comes from the profile so a six hour day makes it three. Decision 2 of
// `docs/todo-jira-option-a.md` asked for that.

import type { CalendarDay } from './types'
import type { Allocation } from './distribute'
import { defaultSpecificationFor } from './catalogue'
import { workingDayCount } from './calendar'

/**
 * How long a working day is when nobody has said.
 *
 * A day is not four hours everywhere. A six hour day makes three hours the half
 * day and a fixed constant would book that person a whole day for half of one.
 * So the length is held on the profile and this is only the fallback.
 */
export const DEFAULT_HOURS_PER_DAY = 8

/** Column K takes 0.5 or 1 so half a day is the smallest unit there is. */
export function hoursPerHalfDay(hoursPerDay: number | null): number {
  const day = hoursPerDay ?? DEFAULT_HOURS_PER_DAY
  return day > 0 ? day / 2 : DEFAULT_HOURS_PER_DAY / 2
}

/**
 * What the month expects in hours.
 *
 * The day length times the days the month asks of this user. It states the
 * contract in the unit the tickets are measured in so the two can be compared
 * at all.
 */
export function hoursPerMonth(hoursPerDay: number | null, target: number): number {
  return (hoursPerDay ?? DEFAULT_HOURS_PER_DAY) * target
}

/** One completed ticket with whatever hours were found or typed for it. */
export interface TicketHours {
  key: string
  summary: string
  /** Null until the project it came from is mapped. Such a ticket books nothing. */
  workdayId: string | null
  hours: number
}

/**
 * The Jira field an hours figure came from. Empty when none answered.
 *
 * It is a field name rather than one of a fixed set. Because the fields worth
 * searching are still being settled so the list is configuration rather than
 * code. `JIRA_HOURS_FIELDS` on the Jira function holds it.
 */
export type HoursSource = string

/** Read when nothing answered. Every row of the 4flow site reads this. */
export const NO_HOURS_SOURCE = ''

/** The fields searched when nobody has configured a list. */
export const DEFAULT_HOURS_FIELDS = ['worklog', 'timespent']

/**
 * One ticket as the screen receives it.
 *
 * It lives in core rather than beside the Jira client because the browser and
 * the Lambda and the stored cache all hold the same shape.
 */
export interface CompletedTicket extends TicketHours {
  projectKey: string
  /** When the ticket was closed. Empty on a ticket that was worked and left open. */
  resolvedAt: string
  /** The epic key. Null when the ticket has no parent. */
  parentKey: string | null
  /** The epic summary. Shown as context and never written to a timesheet. */
  parentSummary: string | null
  /**
   * The Jira `Internal Cost Center`.
   *
   * Null when neither the ticket nor any ancestor of it carries one. It is
   * carried rather than booked against. Because a) the Workday ID still comes
   * from the per user project map. b) a Jira cost centre is a string Jira owns
   * and nothing has checked it against the catalogue. c) showing it is what
   * tells a user whether the map they typed agrees with Jira.
   */
  costCentre: string | null
  /** The ticket the cost centre was read from. The ticket itself or an ancestor. */
  costCentreFrom: string | null
  /** The Jira `Cost Center Specification`. Resolved up the same chain. */
  costCentreSpecification: string | null
  /**
   * Hours this user logged per day keyed `yyyy-mm-dd`.
   *
   * Only days inside the period appear and only worklogs this user wrote. Empty
   * where the user logged nothing against the ticket in the month.
   */
  days: Record<string, number>
  hoursSource: HoursSource
}

export interface WorkdayGroup {
  workdayId: string
  tickets: TicketHours[]
  hours: number
  /** The hours as days before rounding. */
  trueDays: number
  /** What the fill books. */
  days: number
}

export interface HoursTotals {
  hours: number
  trueDays: number
  roundedDays: number
  /** How much the per group rounding added. */
  inflation: number
  /** Tickets whose project maps to nothing. They are shown and never booked. */
  unmapped: TicketHours[]
}

/**
 * Rounds up to the nearest half day.
 *
 * Up rather than down. Because a) rounding down books less time than was
 * worked. b) the tracker warns on a month that misses its target so the
 * inflation surfaces there. c) a user can always correct a day by hand.
 */
export function daysFromHours(hours: number, hoursPerDay: number | null = null): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0
  return Math.ceil(hours / hoursPerHalfDay(hoursPerDay)) / 2
}

/**
 * Groups the tickets and rounds each group once.
 *
 * The order is by days descending then by Workday ID. A stable order matters
 * because the fill walks these groups and the screen lists them.
 */
export function groupByWorkdayId(
  tickets: TicketHours[],
  hoursPerDay: number | null = null,
): WorkdayGroup[] {
  const byId = new Map<string, WorkdayGroup>()
  for (const ticket of tickets) {
    if (ticket.workdayId === null) continue
    const group = byId.get(ticket.workdayId) ?? {
      workdayId: ticket.workdayId,
      tickets: [],
      hours: 0,
      trueDays: 0,
      days: 0,
    }
    group.tickets.push(ticket)
    group.hours += Math.max(0, ticket.hours)
    byId.set(ticket.workdayId, group)
  }
  for (const group of byId.values()) {
    group.trueDays = group.hours / (hoursPerHalfDay(hoursPerDay) * 2)
    group.days = daysFromHours(group.hours, hoursPerDay)
  }
  return [...byId.values()].sort(
    (a, b) => b.days - a.days || a.workdayId.localeCompare(b.workdayId),
  )
}

export function hoursTotals(
  tickets: TicketHours[],
  groups: WorkdayGroup[],
  hoursPerDay: number | null = null,
): HoursTotals {
  const hours = groups.reduce((sum, g) => sum + g.hours, 0)
  const trueDays = hours / (hoursPerHalfDay(hoursPerDay) * 2)
  const roundedDays = groups.reduce((sum, g) => sum + g.days, 0)
  return {
    hours,
    trueDays,
    roundedDays,
    inflation: roundedDays - trueDays,
    unmapped: tickets.filter((t) => t.workdayId === null),
  }
}

/**
 * Whether the month has room for what the rounding produced.
 *
 * The fill stops on false rather than pushing a day onto a weekend. A month can
 * refuse where no single group does. Because rounding adds half a day per group
 * and enough groups exhaust a short month.
 */
export function fitsMonth(roundedDays: number, days: CalendarDay[]): boolean {
  return roundedDays <= workingDayCount(days)
}

/**
 * The groups as shares of their own total.
 *
 * `distribute` takes a percentage and a target rather than days per entry. It
 * is reused rather than reimplemented. Because a) it already skips a
 * non-working day. b) it already collapses a day held whole by one Workday ID.
 * c) a second walker over the month is a second place for those rules to drift.
 */
export function allocationsFromGroups(
  groups: WorkdayGroup[],
  location: string | null,
): Allocation[] {
  const total = groups.reduce((sum, g) => sum + g.days, 0)
  if (total <= 0) return []
  return groups.map((group) => ({
    workdayId: group.workdayId,
    specification: defaultSpecificationFor(group.workdayId),
    percent: (group.days / total) * 100,
    location,
    tasks: tasksFor(group),
  }))
}

/**
 * The column M text for one group.
 *
 * Column M is one string per half day and a group may hold several tickets. The
 * summaries are joined so nothing a user might search for is dropped. Decision
 * 4 of the todo took the ticket summary over the epic summary.
 */
export function tasksFor(group: WorkdayGroup): string {
  return group.tickets.map((t) => `${t.key} ${t.summary}`).join('; ')
}
