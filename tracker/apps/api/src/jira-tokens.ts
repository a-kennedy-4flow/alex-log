// Holding a Jira link.
//
// Atlassian rotates a refresh token. Spending one returns a new one and
// disables the one that was spent. Two callers that spend the same token race
// and the loser is told `Unknown or invalid refresh token`. That ends the link
// and sends the user back through consent. It is the most reported fault
// against this flow so four rules guard it here. See `docs/jira.md`.
//
// The function runs in its own container so a lock held in memory guards
// nothing. Two tabs are two containers and the reminder is a third.

import {
  ACCESS_MARGIN_MS,
  PREVIOUS_REFRESH_WINDOW_MS,
  REFRESH_LEASE_MS,
  type Repository,
  type StoredJiraLink,
} from './repository'
import { JiraUnauthorised, type Jira, type TokenSet } from './jira'

/** Turns a token into something a table export cannot use. */
export interface Cipher {
  encrypt(plain: string): Promise<string>
  decrypt(cipher: string): Promise<string>
}

export interface TokenDeps {
  repository: Repository
  jira: Jira
  cipher: Cipher
  now: () => Date
  /** Present so a test does not wait. */
  wait?: (ms: number) => Promise<void>
}

/** How many times a caller that lost the claim looks for the winner result. */
const POLL_ATTEMPTS = 3
const POLL_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** True while the cached access token has enough life left to use. */
function accessIsLive(link: StoredJiraLink, now: Date): boolean {
  if (!link.access || !link.accessExpiresAt) return false
  return Date.parse(link.accessExpiresAt) - ACCESS_MARGIN_MS > now.getTime()
}

/** True while the token the current one replaced is still worth trying. */
function previousIsWorthTrying(link: StoredJiraLink, now: Date): boolean {
  if (!link.previousRefresh) return false
  return now.getTime() - Date.parse(link.linkedAt) < PREVIOUS_REFRESH_WINDOW_MS
}

/**
 * The link as it stands after a grant.
 *
 * The spent refresh token moves into `previousRefresh` so a caller that lost a
 * race has something to fall back on. A response that carried no refresh token
 * leaves the stored one alone. Because writing null over a working token ends
 * the link as surely as a race does.
 */
async function applied(
  link: StoredJiraLink,
  tokens: TokenSet,
  deps: TokenDeps,
): Promise<StoredJiraLink> {
  const now = deps.now()
  return {
    ...link,
    refresh: tokens.refreshToken ? await deps.cipher.encrypt(tokens.refreshToken) : link.refresh,
    previousRefresh: tokens.refreshToken ? link.refresh : link.previousRefresh,
    access: await deps.cipher.encrypt(tokens.accessToken),
    accessExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000).toISOString(),
    linkedAt: now.toISOString(),
    generation: link.generation + 1,
  }
}

/**
 * A first link from the code the consent screen returned.
 *
 * The exchange runs here rather than in the browser. Because Atlassian requires
 * the client secret on the token endpoint and there is no PKCE on this flow.
 */
export async function linkFrom(
  sub: string,
  code: string,
  redirectUri: string,
  deps: TokenDeps,
): Promise<StoredJiraLink> {
  const tokens = await deps.jira.exchange(code, redirectUri)
  if (!tokens.refreshToken) {
    // Without one the consent buys an hour and nothing more. The authorize URL
    // is missing `offline_access` when this happens.
    throw new Error('the exchange returned no refresh token so offline_access was not granted')
  }
  const now = deps.now()
  const link: StoredJiraLink = {
    accountId: await deps.jira.accountId(tokens.accessToken),
    linkedAt: now.toISOString(),
    refresh: await deps.cipher.encrypt(tokens.refreshToken),
    previousRefresh: null,
    access: await deps.cipher.encrypt(tokens.accessToken),
    accessExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000).toISOString(),
    generation: 1,
    cache: null,
  }
  await deps.repository.putJiraLink(sub, link)
  return link
}

/**
 * An access token for this user. Null means they have not linked.
 *
 * A revoked consent deletes the link and raises `JiraUnauthorised` so the
 * screen can offer to relink rather than showing an error nobody can act on.
 */
export async function accessTokenFor(sub: string, deps: TokenDeps): Promise<string | null> {
  const link = await deps.repository.getJiraLink(sub)
  if (!link) return null

  // Rule one. A live token is served without spending anything. This is what
  // keeps one user to at most one refresh an hour.
  if (accessIsLive(link, deps.now())) return deps.cipher.decrypt(link.access as string)

  // Rule two. Only the holder of the claim may refresh.
  const until = new Date(deps.now().getTime() + REFRESH_LEASE_MS)
  if (await deps.repository.claimJiraRefresh(sub, until)) {
    try {
      return await refreshHolding(sub, link, deps)
    } catch (error) {
      await deps.repository.releaseJiraRefresh(sub)
      throw error
    }
  }

  return waitForWinner(sub, link, deps)
}

async function refreshHolding(
  sub: string,
  link: StoredJiraLink,
  deps: TokenDeps,
): Promise<string> {
  let tokens: TokenSet
  try {
    tokens = await deps.jira.refresh(await deps.cipher.decrypt(link.refresh))
  } catch (error) {
    if (!(error instanceof JiraUnauthorised)) throw error
    // Rule three. The stored token was already spent by a writer that overran
    // its claim. The one it replaced is reported to work for ten minutes.
    if (!previousIsWorthTrying(link, deps.now())) {
      await deps.repository.deleteJiraLink(sub)
      throw error
    }
    tokens = await deps.jira
      .refresh(await deps.cipher.decrypt(link.previousRefresh as string))
      .catch(async (second: unknown) => {
        if (second instanceof JiraUnauthorised) await deps.repository.deleteJiraLink(sub)
        throw second
      })
  }

  const next = await applied(link, tokens, deps)
  const written = await deps.repository.putJiraLinkIfUnchanged(sub, next, link.generation)
  if (written) return tokens.accessToken

  // Somebody wrote first so their token is the live one. Ours is already spent
  // and cannot be stored without disabling theirs.
  const fresh = await deps.repository.getJiraLink(sub)
  if (fresh && accessIsLive(fresh, deps.now())) {
    return deps.cipher.decrypt(fresh.access as string)
  }
  return tokens.accessToken
}

/**
 * What a caller that lost the claim does.
 *
 * It never refreshes. It looks for the token the winner wrote and falls back to
 * the previous refresh token only when nothing arrives.
 */
async function waitForWinner(
  sub: string,
  link: StoredJiraLink,
  deps: TokenDeps,
): Promise<string> {
  const wait = deps.wait ?? sleep
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await wait(POLL_MS)
    const fresh = await deps.repository.getJiraLink(sub)
    if (!fresh) throw new JiraUnauthorised('the link was removed while waiting for a refresh')
    if (accessIsLive(fresh, deps.now())) return deps.cipher.decrypt(fresh.access as string)
  }

  if (previousIsWorthTrying(link, deps.now())) {
    const tokens = await deps.jira.refresh(
      await deps.cipher.decrypt(link.previousRefresh as string),
    )
    return tokens.accessToken
  }
  throw new JiraThrottledRefresh()
}

/** Raised when a refresh is in flight elsewhere and no token can be served. */
export class JiraThrottledRefresh extends Error {
  constructor() {
    super('another request is refreshing this link')
    this.name = 'JiraThrottledRefresh'
  }
}
