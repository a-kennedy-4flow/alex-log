// Sign in.
//
// The browser holds no secret so the flow is the OAuth 2.0 authorization code
// grant with PKCE against the Cognito hosted sign in. Cognito hands the user
// straight on to IAM Identity Center. Nobody types a password here.
//
// Nothing is written to storage that outlives the tab. Because a) a refresh
// token in `localStorage` is readable by any script that gets injected. b) the
// Cognito session cookie already makes the redirect on reload invisible. c) a
// reload is then a redirect and not a sign in.

export interface Claims {
  sub: string
  email: string
  firstName: string
  lastName: string
  groups: string[]
}

const DOMAIN: string = import.meta.env.VITE_COGNITO_DOMAIN ?? ''
const CLIENT_ID: string = import.meta.env.VITE_COGNITO_CLIENT_ID ?? ''
/** Naming the provider skips the Cognito page and goes straight to the portal. */
const PROVIDER: string = import.meta.env.VITE_COGNITO_IDP ?? ''

/** Sign in runs only where the pool is configured. The fixtures build has none. */
export const authEnabled: boolean = DOMAIN !== '' && CLIENT_ID !== ''

export const CALLBACK_PATH = '/auth/callback'
const SIGNED_OUT = 'signedout'
const VERIFIER_KEY = 'timesheets.pkce.verifier'
const STATE_KEY = 'timesheets.pkce.state'
const RETURN_KEY = 'timesheets.pkce.return'

/** Renewed a minute early so a request never carries an expired token. */
const RENEW_MARGIN_MS = 60_000

interface Session {
  accessToken: string
  claims: Claims
  expiresAt: number
  refreshToken: string | null
}

let session: Session | null = null
let renewal: Promise<Session | null> | null = null
let returnTo: string | null = null

/* ---------- PKCE ---------- */

function randomString(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

function base64Url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

/* ---------- the token ---------- */

/**
 * A JWT payload is base64url with the padding removed. It is read for display
 * only. The API verifies the signature and this side never does.
 */
function claimsOf(idToken: string): Claims {
  const part = idToken.split('.')[1] ?? ''
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
      .split('')
      .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join(''),
  )
  const payload = JSON.parse(json) as Record<string, unknown>
  const groups = payload['cognito:groups']
  return {
    sub: String(payload.sub ?? ''),
    email: String(payload.email ?? ''),
    firstName: String(payload.given_name ?? ''),
    lastName: String(payload.family_name ?? ''),
    groups: Array.isArray(groups) ? groups.map(String) : [],
  }
}

interface TokenResponse {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
}

async function exchange(body: Record<string, string>): Promise<Session> {
  const response = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }).toString(),
  })
  if (!response.ok) throw new Error(`token endpoint returned ${response.status}`)
  const token = (await response.json()) as TokenResponse
  return {
    accessToken: token.access_token,
    claims: claimsOf(token.id_token),
    expiresAt: Date.now() + token.expires_in * 1000,
    refreshToken: token.refresh_token ?? null,
  }
}

/* ---------- the flow ---------- */

/** Leaves the page. Nothing after the call runs. */
export async function signIn(): Promise<void> {
  const verifier = randomString()
  const state = randomString()
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(RETURN_KEY, location.pathname + location.search)

  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: location.origin + CALLBACK_PATH,
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  if (PROVIDER) query.set('identity_provider', PROVIDER)

  location.assign(`${DOMAIN}/oauth2/authorize?${query.toString()}`)
}

/** Ends the Cognito session and the Identity Center session with it. */
export function signOut(): void {
  session = null
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: `${location.origin}/?${SIGNED_OUT}=1`,
  })
  location.assign(`${DOMAIN}/logout?${query.toString()}`)
}

export function signedOut(): boolean {
  return new URLSearchParams(location.search).has(SIGNED_OUT)
}

/**
 * Reads the code the hosted sign in put in the address bar. Returns false when
 * this load is not a callback.
 */
async function finishCallback(): Promise<boolean> {
  if (location.pathname !== CALLBACK_PATH) return false
  const query = new URLSearchParams(location.search)
  const code = query.get('code')
  const state = query.get('state')
  const expected = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const back = sessionStorage.getItem(RETURN_KEY) ?? '/'
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(RETURN_KEY)

  if (query.get('error')) {
    throw new Error(query.get('error_description') ?? query.get('error') ?? 'sign in failed')
  }
  // A response the tab did not ask for is refused. This is the CSRF guard.
  if (!code || !state || state !== expected || !verifier) {
    throw new Error('the sign in response does not match this tab')
  }

  session = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: location.origin + CALLBACK_PATH,
    code_verifier: verifier,
  })
  returnTo = back === CALLBACK_PATH ? '/' : back
  return true
}

/**
 * Where the user was when they were sent to sign in. The router owns the address
 * bar so it performs the move rather than this module. Reading it clears it.
 */
export function takeReturnTo(): string | null {
  const path = returnTo
  returnTo = null
  return path
}

/**
 * Settles the identity before anything renders. Redirects to sign in when there
 * is nobody. Returns null when the user has signed out and is being shown the
 * way back in.
 */
export async function establish(): Promise<Claims | null> {
  if (!authEnabled) return null
  if (await finishCallback()) return session!.claims
  if (signedOut()) return null
  await signIn()
  // The page is leaving. This never settles.
  return new Promise<never>(() => {})
}

async function renew(): Promise<Session | null> {
  if (!session?.refreshToken) return null
  try {
    const next = await exchange({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
    // A refresh response carries no new refresh token so the old one is kept.
    session = { ...next, refreshToken: next.refreshToken ?? session.refreshToken }
    return session
  } catch {
    return null
  }
}

/**
 * The token for the next API call. A single renewal is shared so ten parallel
 * requests do not each ask for one.
 */
export async function accessToken(): Promise<string | null> {
  if (!session) return null
  if (Date.now() < session.expiresAt - RENEW_MARGIN_MS) return session.accessToken
  renewal ??= renew().finally(() => {
    renewal = null
  })
  const renewed = await renewal
  // The refresh token has run out so the user signs in again.
  if (!renewed) {
    await signIn()
    return null
  }
  return renewed.accessToken
}

export function currentClaims(): Claims | null {
  return session?.claims ?? null
}
