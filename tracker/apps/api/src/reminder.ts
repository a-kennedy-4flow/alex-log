// The monthly reminder.
//
// A schedule runs this once a day. The run decides for each user whether today
// is their day. Because a) the last working day of a month moves with the bank
// holidays of the location the user works at. b) `buildMonth` already resolves
// those from the catalogue the backoffice uploads. c) a fixed day of the month
// lands on a weekend about a third of the time.
//
// A user is reminded when the month is still owed. Owed means no workbook has
// been downloaded for it since the last edit. That is the only evidence the
// application has because the workbook is mailed on by the user rather than by
// us. See `docs/mail.md`.

import { buildMonth, setCatalogue } from '@tracker/core'

import { reminderMessage, type Mailer } from './mail'
import { periodOf, type Repository } from './repository'
import { accessTokenFor, type TokenDeps } from './jira-tokens'

/** How many working days of the month remain when the reminder is sent. */
export const WORKING_DAYS_LEFT = 3

export interface DirectoryUser {
  sub: string
  email: string
  firstName: string
}

/**
 * Everyone who may sign in. The user pool holds this rather than the table.
 * Because a) somebody who signed in once and saved nothing is exactly who the
 * reminder is for. b) that person has no row in the table. c) the pool is also
 * where a leaver stops being listed.
 */
export interface Directory {
  list(): Promise<DirectoryUser[]>
}

export interface ReminderDeps {
  repository: Repository
  mailer: Mailer
  directory: Directory
  now: () => Date
  /** The zone the schedule fires in. It decides which day today is. */
  timeZone: string
  /** Where the tracker answers. */
  url: string
  /**
   * Absent leaves the message exactly as it was. Present adds a line naming how
   * many Jira tickets the user closed this month.
   *
   * It is read only for a user being reminded today. Because the run considers
   * every user every morning so an unguarded read would query Jira for the
   * whole company daily. See `docs/jira.md`.
   */
  jira?: TokenDeps
}

export interface ReminderSummary {
  considered: number
  sent: number
  failed: number
}

/** The calendar date at a place. `en-CA` renders it as `yyyy-mm-dd`. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** The working dates of a month at one location. Earliest first. */
export function workingDates(year: number, month: number, location: string | null): string[] {
  return buildMonth(year, month, location)
    .filter((day) => !day.nonWorking)
    .map((day) => day.date)
}

/**
 * The date the reminder is due at one location. Null when the month is too
 * short to have one which no real month is.
 */
export function reminderDate(year: number, month: number, location: string | null): string | null {
  const working = workingDates(year, month, location)
  return working[working.length - WORKING_DAYS_LEFT] ?? working[0] ?? null
}

/**
 * How many tickets this user touched in the month. Null when there is nothing
 * to say.
 *
 * Closed or logged against. That is the union `Jira.completed` returns and it
 * is what the screen lists. So the count in the message agrees with the page it
 * links to.
 *
 * A failure here is never allowed to stop a reminder. Because a) the message
 * is the point and the count is an extra. b) Atlassian being down would
 * otherwise mute the whole run. c) a revoked consent is the ordinary case for
 * anybody who has left the app connected and then changed their mind.
 */
async function ticketsThisMonth(
  sub: string,
  period: string,
  deps: ReminderDeps,
): Promise<number | null> {
  if (!deps.jira) return null
  try {
    const access = await accessTokenFor(sub, deps.jira)
    if (access === null) return null
    return (await deps.jira.jira.completed(access, period)).length
  } catch (error) {
    console.error(`the Jira count for ${sub} could not be read`, error)
    return null
  }
}

/**
 * How many profiles are read at once.
 *
 * The run screens the whole pool every morning and almost nobody is due. One
 * read at a time made the run as long as the pool. Twenty five is well under
 * what the table gives on demand.
 */
const READ_AT_ONCE = 25

/** Runs `work` over `items` a few at a time. The answers keep their order. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await work(items[i]!)
  })
  await Promise.all(runners)
  return out
}

export async function runReminders(deps: ReminderDeps): Promise<ReminderSummary> {
  const catalogue = await deps.repository.getCatalogue()
  // Without it the bank holidays are unknown so every date computed here would
  // be wrong. Sending nothing is the honest answer.
  if (!catalogue) throw new Error('no catalogue has been uploaded so no working day is known')
  setCatalogue(catalogue.data)

  const at = deps.now()
  const today = localDate(at, deps.timeZone)
  const [year, month] = today.split('-').map(Number) as [number, number, number]
  const period = periodOf(year, month)

  const users = await deps.directory.list()
  const summary: ReminderSummary = { considered: users.length, sent: 0, failed: 0 }

  // The month is built once per location rather than once per user. A pool of
  // hundreds shares a handful of offices.
  const byLocation = new Map<string, string[]>()
  function workingAt(location: string | null): string[] {
    const key = location ?? ''
    let dates = byLocation.get(key)
    if (!dates) {
      dates = workingDates(year, month, location)
      byLocation.set(key, dates)
    }
    return dates
  }

  // The screen runs a few at a time. The sends that follow stay one at a time
  // so a claim is never taken for a message the next line fails to send.
  const profiles = await mapWithLimit(users, READ_AT_ONCE, (user) =>
    deps.repository.getProfile(user.sub),
  )

  for (const [index, user] of users.entries()) {
    const profile = profiles[index] ?? null
    // Only an explicit refusal mutes a user. Anything else is opted in.
    if (profile?.remindByEmail === false) continue

    const location = profile?.location ?? null
    const working = workingAt(location)
    const due = working[working.length - WORKING_DAYS_LEFT] ?? working[0] ?? null
    if (due !== today) continue

    const sheet = await deps.repository.getSheet(user.sub, period)
    if (sheet?.exportedAt) continue

    // Claimed before the send so a retried run repeats nothing.
    if (!(await deps.repository.claimReminder(user.sub, period, at))) continue

    const jiraTickets = await ticketsThisMonth(user.sub, period, deps)

    const message = reminderMessage({
      locale: profile?.locale ?? null,
      firstName: user.firstName || profile?.firstName || '',
      year,
      month,
      daysLeft: working.length - working.indexOf(today),
      url: deps.url,
      jiraTickets,
      // The month is named so the screen opens on the one being reminded about
      // rather than on the one it would default to.
      jiraUrl: jiraTickets === null ? null : `${deps.url.replace(/\/$/, '')}/jira?period=${period}`,
    })

    try {
      await deps.mailer.send({ to: user.email, ...message })
      summary.sent++
    } catch (error) {
      // Released so a later run may try again. The address may simply be gone.
      await deps.repository.releaseReminder(user.sub, period)
      summary.failed++
      console.error(`reminder to ${user.sub} failed`, error)
    }
  }

  // Every attempt failing is a fault of the sender rather than of one address.
  // Throwing hands it back to the schedule which retries. One bad address must
  // not do that because the rest have already been reminded.
  if (summary.failed > 0 && summary.sent === 0) {
    throw new Error(`all ${summary.failed} reminders failed`)
  }
  return summary
}
