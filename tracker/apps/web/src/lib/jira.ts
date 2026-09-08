// The consent redirect.
//
// Only the redirect and the callback live here. The four HTTP calls sit in
// `api.ts` beside every other one because nothing about them is special.
//
// Atlassian supports no PKCE on this flow and its token endpoint requires the
// client secret. So the browser never exchanges anything. It carries the code
// to `POST /api/jira/link` and the Jira function does the exchange. See
// `docs/jira.md`.

import { ref } from 'vue'

import { CONSENT_SCOPES, DEV_JIRA_CLIENT_ID, DEV_JIRA_CODE } from '@tracker/core'
import { api } from '@/lib/api'

export const JIRA_CALLBACK_PATH = '/jira/callback'

const STATE_KEY = 'tracker.jira.state'
const RETURN_KEY = 'tracker.jira.return'

/**
 * Why the last consent failed. Held rather than thrown because a) the shell has
 * to render whatever Atlassian answered. b) a Jira failure is not a sign in
 * failure. c) the screen that offers the button is the screen that has to
 * carry the reason.
 */
export const consentError = ref<string | null>(null)

/**
 * Where a press on the consent button sends the browser.
 *
 * It is separate from `startLink` so a test can read it. Navigation is the one
 * thing jsdom refuses to do.
 */
export function consentUrl(clientId: string, redirectUri: string, state: string): string {
  // The local API owns no Atlassian app so its client id is refused by a real
  // consent screen. The callback is entered directly instead and `FakeJira`
  // grants the token. `import.meta.env.DEV` keeps this out of a built bundle.
  if (import.meta.env.DEV && clientId === DEV_JIRA_CLIENT_ID) {
    return `${JIRA_CALLBACK_PATH}?code=${DEV_JIRA_CODE}&state=${state}`
  }

  const query = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: clientId,
    scope: CONSENT_SCOPES.join(' '),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    // Required. `consent` is its only documented value so the screen is shown
    // on every authorize call. Under this design that is once per user.
    prompt: 'consent',
  })
  return `https://auth.atlassian.com/authorize?${query.toString()}`
}

/** Sends the user to Atlassian. It does not return. */
export function startLink(clientId: string, redirectUri: string, returnTo: string): void {
  consentError.value = null
  const state = crypto.randomUUID()
  // Nothing outlives the tab. `lib/auth.ts` says why. There is no verifier to
  // keep because there is no PKCE on this flow.
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(RETURN_KEY, returnTo)
  location.assign(consentUrl(clientId, redirectUri, state))
}

/**
 * Finishes a consent. Returns where to send the user or null when this address
 * is not a callback.
 *
 * It runs before the router mounts. That is how `lib/auth.ts` already handles
 * `/auth/callback` so the path needs no route of its own.
 *
 * The address is taken as an argument rather than read from `location`. Because
 * a) sign in may have carried the callback through its own redirect so the
 * address bar holds `/auth/callback` while the Jira one waits in `returnTo`. b)
 * the router defers its write to the address bar to a microtask so a path just
 * handed to `history.replace` is not on `location` yet. c) a caller that has
 * neither passes nothing and the real address answers.
 */
export async function finishLink(
  at: string = location.pathname + location.search,
): Promise<string | null> {
  const address = new URL(at, location.origin)
  if (address.pathname !== JIRA_CALLBACK_PATH) return null
  const query = address.searchParams
  const expected = sessionStorage.getItem(STATE_KEY)
  const back = sessionStorage.getItem(RETURN_KEY) ?? '/jira'
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(RETURN_KEY)

  if (query.get('error')) {
    throw new Error(query.get('error_description') ?? query.get('error') ?? 'Jira refused')
  }
  const code = query.get('code')
  const state = query.get('state')
  // A response the tab did not ask for is refused. This is the CSRF guard.
  if (!code || !state || state !== expected) {
    throw new Error('the Jira response does not match this tab')
  }
  await api.linkJira(code)
  return back
}
