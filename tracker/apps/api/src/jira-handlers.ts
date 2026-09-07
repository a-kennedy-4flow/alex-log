// The Jira routes.
//
// A handler of its own because these routes run in a function of their own. It
// is the only function that reads the client secret and the only one that uses
// the KMS key so the API role gains neither. `lambda.ts` states the same rule
// about the reminder and permission to send mail.
//
// Nothing here writes a timesheet. The fill posts to `PUT /api/timesheets/...`
// on the API function. Because a) that route already validates every half day.
// b) the export must never carry a sheet the tracker would reject. c) a second
// writer is a second place for those rules to drift.
//
// Nothing here reads the catalogue either. The answer carries Workday IDs and
// the browser resolves the titles from the catalogue it already holds.

import type { CompletedTicket } from '@tracker/core'

import { json, problem, type ApiRequest, type ApiResponse, type Caller } from './handlers'
import { JiraThrottledRefresh, accessTokenFor, linkFrom, type TokenDeps } from './jira-tokens'
import { JiraThrottled, JiraUnauthorised } from './jira'
import {
  PERIOD,
  TICKET_CACHE_CLOSED_MS,
  TICKET_CACHE_CURRENT_MS,
  type StoredJiraLink,
} from './repository'

/**
 * It extends the token deps rather than restating them. The routes and the
 * rotation take the same repository and the same cipher so two declarations
 * would drift.
 */
export interface JiraDeps extends TokenDeps {
  /**
   * The client id of the registered app. Empty means no app is configured for
   * this deployment and every route answers 404.
   */
  clientId: string
  /** Where Atlassian sends the browser back to. */
  redirectUri: string
}

/** The period key of the month the clock is in. */
function currentPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** A closed month rarely changes again. The current one might. */
function cacheWindow(period: string, now: Date): number {
  return period === currentPeriod(now) ? TICKET_CACHE_CURRENT_MS : TICKET_CACHE_CLOSED_MS
}

function cacheIsFresh(link: StoredJiraLink, period: string, now: Date): boolean {
  const cache = link.cache
  if (!cache || cache.period !== period) return false
  return now.getTime() - Date.parse(cache.fetchedAt) < cacheWindow(period, now)
}

/**
 * Fills in the Workday ID each ticket books against.
 *
 * The map is per user and it is written when a row is mapped by hand on the
 * screen. A ticket whose project is not in it stays null so the screen can show
 * it unmapped. It is never hidden and never booked.
 */
function mapped(tickets: CompletedTicket[], jiraProjects: Record<string, string>): CompletedTicket[] {
  return tickets.map((ticket) => ({
    ...ticket,
    workdayId: jiraProjects[ticket.projectKey] ?? null,
  }))
}

async function readTickets(
  caller: Caller,
  period: string,
  deps: JiraDeps,
): Promise<ApiResponse> {
  const link = await deps.repository.getJiraLink(caller.sub)
  if (!link) return problem(409, 'this user has not linked Jira', { linked: false })

  const profile = await deps.repository.getProfile(caller.sub)
  const jiraProjects = profile?.jiraProjects ?? {}
  const now = deps.now()

  if (cacheIsFresh(link, period, now)) {
    const cache = link.cache as NonNullable<StoredJiraLink['cache']>
    return json(200, {
      period,
      fetchedAt: cache.fetchedAt,
      cached: true,
      tickets: mapped(cache.tickets, jiraProjects),
    })
  }

  const access = await accessTokenFor(caller.sub, deps)
  if (access === null) return problem(409, 'this user has not linked Jira', { linked: false })

  const tickets = await deps.jira.completed(access, period)
  const fetchedAt = now.toISOString()
  // The link is read again rather than reused. Getting the access token may
  // have rotated the refresh token which moves the generation on. Writing the
  // cache against the generation from before that would fail the condition
  // every time and the cache would never hold anything.
  const current = await deps.repository.getJiraLink(caller.sub)
  if (current) {
    await deps.repository.putJiraLinkIfUnchanged(
      caller.sub,
      { ...current, cache: { period, fetchedAt, tickets }, generation: current.generation + 1 },
      current.generation,
    )
  }
  return json(200, { period, fetchedAt, cached: false, tickets: mapped(tickets, jiraProjects) })
}

export async function handleJira(request: ApiRequest, deps: JiraDeps): Promise<ApiResponse> {
  const { method, path, caller } = request
  if (!path.startsWith('/api/jira/')) return problem(404, 'no such route')
  // A deployment with no app registered behaves as though the feature is not
  // built rather than failing halfway into a consent flow.
  if (deps.clientId === '') return problem(404, 'no such route')
  if (!caller) return problem(401, 'a token is required')

  if (method === 'GET' && path === '/api/jira/link') {
    const link = await deps.repository.getJiraLink(caller.sub)
    return json(200, {
      linked: link !== null,
      clientId: deps.clientId,
      redirectUri: deps.redirectUri,
      accountId: link?.accountId ?? null,
      linkedAt: link?.linkedAt ?? null,
    })
  }

  if (method === 'POST' && path === '/api/jira/link') {
    let code: unknown
    try {
      code = (JSON.parse(request.body ?? '{}') as { code?: unknown }).code
    } catch {
      return problem(400, 'the body must be JSON')
    }
    if (typeof code !== 'string' || code === '') return problem(400, 'code is required')
    const link = await linkFrom(caller.sub, code, deps.redirectUri, deps)
    return json(200, { linked: true, accountId: link.accountId, linkedAt: link.linkedAt })
  }

  if (method === 'DELETE' && path === '/api/jira/link') {
    await deps.repository.deleteJiraLink(caller.sub)
    return json(200, { linked: false })
  }

  const completed = path.match(/^\/api\/jira\/completed\/([^/]+)$/)
  if (method === 'GET' && completed) {
    const period = completed[1] as string
    // The month is a path segment rather than a query because neither adapter
    // passes a query string through to a handler. `/api/timesheets/<period>`
    // already addresses a month this way.
    if (!PERIOD.test(period)) return problem(400, 'period must be yyyy-mm')
    return readTickets(caller, period, deps)
  }

  return problem(404, 'no such route')
}

/**
 * Turns what Atlassian refused into something the screen can act on.
 *
 * A revoked consent is not an error the user can do anything about except link
 * again so it is answered as such rather than as a failure.
 */
export async function jiraResponse(
  request: ApiRequest,
  deps: JiraDeps,
): Promise<ApiResponse> {
  try {
    return await handleJira(request, deps)
  } catch (error) {
    if (error instanceof JiraUnauthorised) {
      return problem(409, 'the Jira consent is no longer valid', { linked: false, relink: true })
    }
    if (error instanceof JiraThrottledRefresh || error instanceof JiraThrottled) {
      return problem(503, 'Jira is busy so try again in a moment', { retry: true })
    }
    throw error
  }
}
