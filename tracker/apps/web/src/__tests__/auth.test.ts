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

function landOn(search: string, pathname = '/auth/callback'): void {
  vi.stubGlobal('location', { origin: ORIGIN, pathname, search, assign: vi.fn() })
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

  it('leaves a signed out user on the way back in', async () => {
    landOn('?signedout=1', '/')
    const auth = await load()
    expect(await auth.establish()).toBeNull()
  })

  it('treats a missing group claim as no group', async () => {
    landOn('?code=the-code&state=the-state')
    tokenReply({ sub: 'abc', email: 'd.novak@4flow.com' })

    const auth = await load()
    const claims = await auth.establish()
    expect(claims?.groups).toEqual([])
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
