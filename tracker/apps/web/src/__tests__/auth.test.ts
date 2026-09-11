// Sign in. The callback is the one place the browser hands the app something a
// stranger could have written so the guard on it is tested rather than trusted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DOMAIN = 'https://pool.example'
const CLIENT = 'client-id'
const ORIGIN = 'https://site.example'

/** A JWT the app only reads. The signature is never checked on this side. */
function idToken(payload: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `header.${body}.signature`
}

/** Returns the navigation the module makes from this address. */
function landOn(search: string, pathname = '/auth/callback') {
  const assign = vi.fn()
  vi.stubGlobal('location', { origin: ORIGIN, pathname, search, assign })
  return assign
}

function tokenReply(payload: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'access',
        id_token: idToken(payload),
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
    })),
  )
}

/** The module reads the configuration once so each test imports it afresh. */
async function load() {
  vi.stubEnv('VITE_COGNITO_DOMAIN', DOMAIN)
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', CLIENT)
  vi.stubEnv('VITE_COGNITO_IDP', 'IdentityCenter')
  vi.resetModules()
  return import('@/lib/auth')
}

beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem('timesheets.pkce.state', 'the-state')
  sessionStorage.setItem('timesheets.pkce.verifier', 'the-verifier')
  sessionStorage.setItem('timesheets.pkce.return', '/settings')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the sign in callback', () => {
  it('reads the person out of the token', async () => {
    landOn('?code=the-code&state=the-state')
    tokenReply({
      sub: 'abc',
      email: 'a.kennedy@4flow.com',
      given_name: 'Alexander',
      family_name: 'Kennedy',
      'cognito:groups': ['backoffice'],
    })

    const auth = await load()
    expect(auth.authEnabled).toBe(true)

    const claims = await auth.establish()
    expect(claims).toEqual({
      sub: 'abc',
      email: 'a.kennedy@4flow.com',
      firstName: 'Alexander',
      lastName: 'Kennedy',
      groups: ['backoffice'],
    })
    expect(await auth.apiToken()).toBe(idToken({ sub: 'abc', email: 'a.kennedy@4flow.com', given_name: 'Alexander', family_name: 'Kennedy', 'cognito:groups': ['backoffice'] }))
  })

  it('sends the user back to the screen they were on', async () => {
    landOn('?code=the-code&state=the-state')
    tokenReply({ sub: 'abc' })

    const auth = await load()
    await auth.establish()
    expect(auth.takeReturnTo()).toBe('/settings')
    // Reading it clears it so a later render cannot move the address bar again.
    expect(auth.takeReturnTo()).toBeNull()
  })

  it('refuses a response this tab did not ask for', async () => {
    landOn('?code=the-code&state=a-state-from-somewhere-else')
    tokenReply({ sub: 'abc' })

    const auth = await load()
    await expect(auth.establish()).rejects.toThrow(/does not match this tab/)
  })

  it('refuses a response with no code', async () => {
    landOn('?state=the-state')
    const auth = await load()
    await expect(auth.establish()).rejects.toThrow(/does not match this tab/)
  })

  it('reports what the provider refused', async () => {
    landOn('?error=access_denied&error_description=not+assigned+to+this+application')
    const auth = await load()
    await expect(auth.establish()).rejects.toThrow('not assigned to this application')
  })

  it('sends a retried callback to the month grid', async () => {
    // A callback that failed leaves its spent code in the address bar and the
    // signed out screen renders there. The button stores that address.
    landOn('?code=spent&state=spent')
    const auth = await load()
    await auth.signIn()

    landOn(`?code=fresh&state=${sessionStorage.getItem('timesheets.pkce.state')}`)
    tokenReply({ sub: 'abc' })
    await auth.establish()
    expect(auth.takeReturnTo()).toBe('/')
  })

  it('treats a missing group claim as no group', async () => {
    landOn('?code=the-code&state=the-state')
    tokenReply({ sub: 'abc', email: 'd.novak@4flow.com' })

    const auth = await load()
    const claims = await auth.establish()
    expect(claims?.groups).toEqual([])
  })
})

describe('signing out', () => {
  it('asks Cognito for the address the stack registered', async () => {
    const assign = landOn('', '/settings')
    const auth = await load()
    auth.signOut()

    expect(assign).toHaveBeenCalledOnce()
    const sent = new URL(String(assign.mock.lastCall?.[0]))
    // Cognito matches this against its sign out list exactly. The stack
    // registers the bare origin so anything more is refused.
    expect(sent.searchParams.get('logout_uri')).toBe(`${ORIGIN}/`)
  })

  it('holds the user on the way back in', async () => {
    landOn('', '/settings')
    const auth = await load()
    auth.signOut()

    landOn('', '/')
    expect(await (await load()).establish()).toBeNull()
  })

  it('does not hold them again once they are back', async () => {
    landOn('', '/settings')
    let auth = await load()
    auth.signOut()

    // The one button the signed out screen carries.
    landOn('', '/')
    auth = await load()
    await auth.signIn()

    landOn(`?code=the-code&state=${sessionStorage.getItem('timesheets.pkce.state')}`)
    tokenReply({ sub: 'abc' })
    expect(await auth.establish()).not.toBeNull()
    expect(auth.takeReturnTo()).toBe('/')

    // The reload that used to land back on the signed out screen. It leaves for
    // the hosted sign in instead and never settles.
    const assign = landOn('', '/')
    auth = await load()
    let settled = false
    void auth.establish().then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(assign).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    expect(new URL(String(assign.mock.lastCall?.[0])).pathname).toBe('/oauth2/authorize')
  })
})

describe('a bundle that names no pool', () => {
  it('renders nothing once it is built', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const auth = await import('@/lib/auth')
    expect(auth.authMisconfigured).toBe(true)
  })

  it('is how the fixtures are worked on', async () => {
    vi.resetModules()
    const auth = await import('@/lib/auth')
    expect(auth.authMisconfigured).toBe(false)
  })
})

describe('without a pool', () => {
  it('does nothing at all', async () => {
    vi.resetModules()
    const auth = await import('@/lib/auth')
    expect(auth.authEnabled).toBe(false)
    expect(await auth.establish()).toBeNull()
  })
})
