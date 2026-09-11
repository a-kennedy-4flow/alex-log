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

import type { CompletedTicket, CostCentreChoices } from '@tracker/core'

import { json, problem, type ApiRequest, type ApiResponse, type Caller } from './handlers'
import { JiraThrottledRefresh, accessTokenFor, linkFrom, type TokenDeps } from './jira-tokens'
import { JiraThrottled, JiraUnauthorised, refusedTheTracker } from './jira'
import {
  PERIOD,
  TICKET_CACHE_CLOSED_MS,
  TICKET_CACHE_CURRENT_MS,
  TICKET_CACHE_VERSION,
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
  /**
   * The Atlassian site a person browses. `https://4flow.atlassian.net`.
   *
   * It is answered rather than compiled into the browser bundle. Because a) the
   * screen already takes its client id and its callback from this route. b) one
   * deployment reads one site so the site belongs beside the cloud id. c) empty
   * leaves the screen showing a ticket id it cannot link.
   */
  siteUrl: string
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
  // A cache written against an older ticket shape is not stale so much as the
  // wrong shape. Reading it would hand the screen a row missing its cost centre
  // and its days.
  if (cache.version !== TICKET_CACHE_VERSION) return false
  return now.getTime() - Date.parse(cache.fetchedAt) < cacheWindow(period, now)
}

/**
 * Fills in the Workday ID a person has answered for each ticket.
 *
 * Both maps are per user and both are written by hand on the screen. The ticket
 * one is read first because one project is not one cost centre. A ticket in
 * neither stays null so the screen can show it unanswered. It is never hidden
 * and never booked.
 *
 * The Jira cost centre is not read here. It converts through the catalogue and
 * this function never loads one. `resolveCostCentre` in core does that in the
 * browser and it outranks the project map. So this field is the answer of last
 * resort rather than the final one.
 */
function mapped(tickets: CompletedTicket[], choices: CostCentreChoices): CompletedTicket[] {
  return tickets.map((ticket) => ({
    ...ticket,
    workdayId: choices.tickets[ticket.key] ?? choices.projects[ticket.projectKey] ?? null,
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
  const choices: CostCentreChoices = {
    tickets: profile?.jiraTickets ?? {},
    projects: profile?.jiraProjects ?? {},
  }
  const now = deps.now()

  if (cacheIsFresh(link, period, now)) {
    const cache = link.cache as NonNullable<StoredJiraLink['cache']>
    return json(200, {
      period,
      fetchedAt: cache.fetchedAt,
      cached: true,
      tickets: mapped(cache.tickets, choices),
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
      {
        ...current,
        cache: { period, fetchedAt, version: TICKET_CACHE_VERSION, tickets },
        generation: current.generation + 1,
      },
      current.generation,
    )
  }
  return json(200, { period, fetchedAt, cached: false, tickets: mapped(tickets, choices) })
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
      siteUrl: deps.siteUrl,
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
      // Every refusal leaves a line. Because a) a wrong secret and a redirect
      // the console never registered read the same from the screen. b) this is
      // the one place every refusal passes through. c) the 409 said nothing so
      // nine invocations answered it and left no trace.
      console.error('Atlassian refused a credential', {
        route: `${request.method} ${request.path}`,
        status: error.refusal?.status ?? null,
        grant: error.refusal?.grant ?? null,
        reason: error.refusal?.reason ?? error.message,
      })
      // A refused exchange is not a consent that lapsed. There was none to
      // lapse. It is the deployment being wrong so the reason is carried out
      // rather than replaced and nothing offers a relink that would fail again.
      if (error.refusal?.grant === 'authorization_code') {
        // The reason alone. `jira.consentFailed` on the screen already supplies
        // the sentence around it.
        return problem(400, error.refusal.reason, { linked: false, relink: false })
      }
      // A refresh Atlassian refused for any reason but `invalid_grant` is the
      // deployment being wrong. The link is still there and a relink would ask
      // the same question and be told the same thing. So it is not offered.
      if (refusedTheTracker(error.refusal)) {
        return problem(502, `Jira refused the tracker credentials. ${error.refusal?.reason}`, {
          linked: true,
          relink: false,
        })
      }
      return problem(409, 'the Jira consent is no longer valid', { linked: false, relink: true })
    }
    if (error instanceof JiraThrottledRefresh || error instanceof JiraThrottled) {
      return problem(503, 'Jira is busy so try again in a moment', { retry: true })
    }
    throw error
  }
}
