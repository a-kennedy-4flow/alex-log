// The Jira screen.
//
// The tickets come from the Jira function. Everything below them is derived so
// typing an hour moves every figure at once. Nothing here holds a total of its
// own. See `docs/jira.md`.
//
// The hours are almost always the user own. Jira holds no worklogs on the
// 4flow site so the function returns zero on every row and marks it `typed`.

import { computed, nextTick, reactive, ref } from 'vue'
import {
  allocationsFromGroups,
  buildMonth,
  defaultSpecificationFor,
  distribute,
  fitsMonth,
  groupByWorkdayId,
  hoursPerHalfDay,
  hoursPerMonth,
  hoursTotals,
  tasksFor,
  targetDays,
  workingDayCount,
  type Allocation,
  type CompletedTicket,
  type TicketHours,
} from '@tracker/core'

import { api, usingApi, type JiraLinkState } from '@/lib/api'
import {
  halfDays,
  loadHistory,
  month,
  monthOverride,
  openMonth,
  profile,
  saveProfile,
  saveSheet,
  year,
} from '@/composables/useTimesheet'

export const link = ref<JiraLinkState | null>(null)
/** Set when the link state could not be read at all. Null while it is unknown. */
export const linkError = ref<string | null>(null)
export const tickets = ref<CompletedTicket[]>([])
export const loading = ref(false)
export const filling = ref(false)
/** Set when Jira answered that the consent has gone. The screen offers to relink. */
export const relinkNeeded = ref(false)
export const error = ref<string | null>(null)
export const fetchedAt = ref<string | null>(null)

/**
 * The hours as the screen shows them.
 *
 * Decision 1 of the todo said not to type them. So this holds the figure Jira
 * reported rendered as text and nothing here parses it back. Every row reads
 * empty on the 4flow site because that site has no worklogs. The month is
 * divided by the share per Workday ID instead.
 */
export function hoursTextOf(ticket: CompletedTicket): string {
  return ticket.hours > 0 ? String(ticket.hours) : ''
}

/** A Workday ID chosen on the screen for a project the profile does not map. */
export const chosenProjects = reactive<Record<string, string>>({})

/** The month before the one the clock is in. That is what this screen reads. */
export function lastPeriod(now = new Date()): string {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth()
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * The month named in the address or the month before this one.
 *
 * The reminder links here with a period on it so the screen opens on the month
 * the message was about rather than on the one it would default to. It is read
 * from the address rather than declared as a route search parameter which is
 * how `lib/auth.ts` and `lib/jira.ts` already read their own callbacks.
 */
function initialPeriod(): string {
  const asked = new URLSearchParams(location.search).get('period')
  return asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : lastPeriod()
}

export const period = ref(initialPeriod())

const calendarOfPeriod = computed(() => {
  const [year, month] = period.value.split('-').map(Number) as [number, number]
  return buildMonth(year, month, profile.location ?? '')
})

/**
 * The days the month expects of this user.
 *
 * The store target follows the month the editor has open which is not always
 * the month this screen reads. So it is computed here from the period.
 */
const monthTarget = computed(() =>
  targetDays(workingDayCount(calendarOfPeriod.value), profile.workPercent, null),
)

/** The month this screen may read. This one and the one before it. */
export const offeredPeriods = computed(() => {
  const now = new Date()
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return [lastPeriod(now), current]
})

export async function choosePeriod(next: string): Promise<void> {
  period.value = next
  await loadMonth()
}

/** The Workday ID a ticket books against. The screen choice wins over the profile. */
export function workdayIdOf(ticket: CompletedTicket): string | null {
  return chosenProjects[ticket.projectKey] ?? ticket.workdayId ?? null
}

/** What the arithmetic uses. Only a worklog or `timespent` ever fills it. */
export function hoursOf(ticket: CompletedTicket): number {
  return ticket.hours
}

/** The list as the arithmetic sees it. */
export const withHours = computed<TicketHours[]>(() =>
  tickets.value.map((ticket) => ({
    key: ticket.key,
    summary: ticket.summary,
    workdayId: workdayIdOf(ticket),
    hours: hoursOf(ticket),
  })),
)

export const groups = computed(() => groupByWorkdayId(withHours.value, profile.hoursPerDay))
export const totals = computed(() =>
  hoursTotals(withHours.value, groups.value, profile.hoursPerDay),
)

/** Half of the working day this user keeps. Three hours on a six hour day. */
export const halfDayHours = computed(() => hoursPerHalfDay(profile.hoursPerDay))

/** What the month expects in hours. The contract said in the unit Jira uses. */
export const monthHours = computed(() => hoursPerMonth(profile.hoursPerDay, monthTarget.value))

/**
 * How the month is divided.
 *
 * Hours are the literal request. The percentage is offered because Jira
 * supplies neither and a share needs no arithmetic the user has to trust. It is
 * what `distribute` already takes. Decision 1 of the todo is still open.
 */
export const mode = ref<'hours' | 'percent'>('percent')

/** A share per Workday ID. Empty means the hours decide the split. */
export const shares = reactive<Record<string, number>>({})

/**
 * The share of the month one Workday ID takes.
 *
 * It falls back to what the hours imply so switching to percentages starts from
 * the answer the user already gave rather than from zero.
 */
export function shareOf(workdayId: string): number {
  const held = shares[workdayId]
  if (held !== undefined) return held
  const total = totals.value.hours
  if (total <= 0) return groups.value.length ? Math.round(100 / groups.value.length) : 0
  const group = groups.value.find((entry) => entry.workdayId === workdayId)
  return group ? Math.round((group.hours / total) * 100) : 0
}

export const shareTotal = computed(() =>
  groups.value.reduce((sum, group) => sum + shareOf(group.workdayId), 0),
)

/** What the fill would book. The hours decide it or the target does. */
export const daysToBook = computed(() =>
  mode.value === 'hours' ? totals.value.roundedDays : monthTarget.value,
)

export const fits = computed(() => fitsMonth(daysToBook.value, calendarOfPeriod.value))

/** How many half days the fill would replace. Decision 2 took overwrite. */
export const wouldReplace = computed(
  () => halfDays.value.filter((entry) => entry.workdayId !== null).length,
)

/**
 * Reads whether this user has linked.
 *
 * A failure is held rather than thrown. Because a) the screen has to offer the
 * connect button whatever happened. b) an unhandled rejection in `onMounted`
 * leaves the page rendering the linked layout for a user who has not linked.
 * c) a deployment with no app registered answers 404 here and that is not a
 * fault.
 */
export async function loadLink(): Promise<void> {
  linkError.value = null
  try {
    link.value = await api.jiraLink()
  } catch (raised) {
    const problem = raised as { status?: number; message?: string }
    link.value =
      problem.status === 404
        ? { linked: false, clientId: '', redirectUri: '', accountId: null, linkedAt: null }
        : null
    if (problem.status !== 404) linkError.value = problem.message ?? 'the Jira link could not be read'
  }
}

/** Forgets the token. The user may connect again straight away. */
export async function unlink(): Promise<void> {
  await api.unlinkJira()
  tickets.value = []
  fetchedAt.value = null
  relinkNeeded.value = false
  await loadLink()
}

export async function loadMonth(): Promise<void> {
  loading.value = true
  error.value = null
  relinkNeeded.value = false
  try {
    const month = await api.jiraMonth(period.value)
    tickets.value = month.tickets
    fetchedAt.value = month.fetchedAt
  } catch (raised) {
    const problem = raised as { codes?: string[]; message?: string; status?: number }
    // A revoked consent is not a failure the user can act on except by linking
    // again so it is shown as that rather than as an error.
    if (problem.status === 409) relinkNeeded.value = true
    else error.value = problem.message ?? 'Jira could not be read'
    tickets.value = []
  } finally {
    loading.value = false
  }
}

/**
 * Remembers which Workday ID a project books against.
 *
 * It is written to the profile the moment it is chosen rather than on the fill.
 * Because the answer is worth keeping even when the user leaves without
 * filling anything.
 */
export async function mapProject(projectKey: string, workdayId: string): Promise<void> {
  chosenProjects[projectKey] = workdayId
  profile.jiraProjects = { ...profile.jiraProjects, [projectKey]: workdayId }
  await saveProfile()
}

/**
 * Writes the month from the tickets.
 *
 * It replaces whatever the month held. Decision 2 of the todo took overwrite
 * over asking because a user who opens this screen has asked for the month to
 * be filled. `wouldReplace` is what the button says first.
 *
 * The grid comes from `distribute` rather than from a walk of its own. Because
 * a) that already skips a non-working day. b) it already collapses a day held
 * whole by one Workday ID. c) a second walker is a second place for those
 * rules to drift.
 *
 * The write happens before the editor is moved. Because a) a watcher on the
 * month calls `openMonth` which resets the grid to an empty one. b) `openMonth`
 * also reads the month back from the API so its answer would land on top of the
 * fill. c) writing first makes that read return what was just written.
 */
/** The split the chosen mode asks for. */
function allocations(): Allocation[] {
  if (mode.value === 'hours') return allocationsFromGroups(groups.value, profile.location)
  return groups.value.map((group) => ({
    workdayId: group.workdayId,
    specification: defaultSpecificationFor(group.workdayId),
    percent: shareOf(group.workdayId),
    location: profile.location,
    tasks: tasksFor(group),
  }))
}

export async function fillMonth(): Promise<boolean> {
  if (!fits.value) return false
  const [y, m] = period.value.split('-').map(Number) as [number, number]
  filling.value = true
  try {
    const grid = distribute(
      allocations(),
      buildMonth(y, m, profile.location ?? ''),
      daysToBook.value,
    )

    if (usingApi) {
      await api.putSheet(period.value, {
        location: profile.location ?? '',
        halfDays: grid,
        adjustedWorkDays: null,
      })
      // Reads back what was written so the editor shows the filled month.
      openMonth(y, m)
      await loadHistory()
      return true
    }

    // The fixtures build keeps months in `localStorage` where `openMonth` is
    // synchronous. So the month is moved first and the tick lets the watcher
    // run before the grid is written over what it left.
    year.value = y
    month.value = m
    await nextTick()
    halfDays.value = grid
    monthOverride.value = null
    await saveSheet()
    return true
  } finally {
    filling.value = false
  }
}
