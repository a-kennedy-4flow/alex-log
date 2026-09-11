// The Jira routes and the token rotation.
//
// Rotation is the part of this feature most likely to break so most of what is
// here is about two callers spending one refresh token. See `docs/jira.md`.
//
// Nothing here reaches the network. Every double is in this file or in
// `jira-fake.ts`.

import { describe, expect, it, vi } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'
import { setCatalogue, type UserProfile } from '@tracker/core'

import type { Caller } from '../handlers'
import { AtlassianJira, JiraUnauthorised, type TokenSet } from '../jira'
import { FakeJira, PlainCipher } from '../jira-fake'
import { handleJira, jiraResponse, type JiraDeps } from '../jira-handlers'
import { accessTokenFor, linkFrom } from '../jira-tokens'
import { MemoryRepository, type StoredJiraLink } from '../repository'

setCatalogue(await loadCatalogue())

const CALLER: Caller = {
  sub: 'user-1',
  email: 'a.kennedy@4flow.com',
  firstName: 'Alexander',
  lastName: 'Kennedy',
  groups: [],
}

const CLIENT_ID = 'wJiihW00HOrSowAzpyBcDjWOj7vUMAXz'
const REDIRECT = 'https://tracker.4flow.io/jira/callback'
const SITE = 'https://4flow.atlassian.net'

function profileOf(
  jiraProjects: Record<string, string> = {},
  jiraTickets: Record<string, string> = {},
): UserProfile {
  return {
    email: CALLER.email,
    firstName: CALLER.firstName,
    lastName: CALLER.lastName,
    location: null,
    entity: null,
    businessLine: null,
    workPercent: null,
    locale: null,
    remindByEmail: true,
    hoursPerDay: null,
    jiraProjects,
    jiraTickets,
  }
}

function depsOf(over: Partial<JiraDeps> = {}): JiraDeps {
  return {
    repository: new MemoryRepository(),
    jira: new FakeJira(),
    cipher: new PlainCipher(),
    now: () => new Date('2026-09-07T12:00:00Z'),
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    siteUrl: SITE,
    ...over,
  }
}

function get(path: string) {
  return { method: 'GET', path, body: null, caller: CALLER }
}

/** A link as it stands after one exchange. Tokens are plain in a test. */
function linkOf(over: Partial<StoredJiraLink> = {}): StoredJiraLink {
  return {
    accountId: '712020:0cecee67',
    linkedAt: '2026-09-07T12:00:00.000Z',
    refresh: 'plain:refresh-1',
    previousRefresh: null,
    access: null,
    accessExpiresAt: null,
    generation: 1,
    cache: null,
    ...over,
  }
}

describe('the routes', () => {
  it('answers 404 for every route when no app is registered', async () => {
    const deps = depsOf({ clientId: '' })
    expect((await handleJira(get('/api/jira/link'), deps)).status).toBe(404)
    expect((await handleJira(get('/api/jira/completed/2026-08'), deps)).status).toBe(404)
  })

  it('refuses a caller with no token', async () => {
    const request = { ...get('/api/jira/link'), caller: null }
    expect((await handleJira(request, depsOf())).status).toBe(401)
  })

  it('reports an unlinked user with the client id the screen needs', async () => {
    const response = await handleJira(get('/api/jira/link'), depsOf())
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      linked: false,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT,
      siteUrl: SITE,
      accountId: null,
      linkedAt: null,
    })
  })

  it('links from a code then forgets on request', async () => {
    const deps = depsOf()
    const linked = await handleJira(
      { method: 'POST', path: '/api/jira/link', body: '{"code":"abc"}', caller: CALLER },
      deps,
    )
    expect(linked.status).toBe(200)
    expect(JSON.parse(linked.body).linked).toBe(true)
    expect(await deps.repository.getJiraLink(CALLER.sub)).not.toBeNull()

    const gone = await handleJira(
      { method: 'DELETE', path: '/api/jira/link', body: null, caller: CALLER },
      deps,
    )
    expect(JSON.parse(gone.body).linked).toBe(false)
    expect(await deps.repository.getJiraLink(CALLER.sub)).toBeNull()
  })

  it('refuses a code that is not there', async () => {
    const response = await handleJira(
      { method: 'POST', path: '/api/jira/link', body: '{}', caller: CALLER },
      depsOf(),
    )
    expect(response.status).toBe(400)
  })

  it('refuses a period that is not a month', async () => {
    const deps = depsOf()
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    expect((await handleJira(get('/api/jira/completed/2026-13'), deps)).status).toBe(400)
    expect((await handleJira(get('/api/jira/completed/august'), deps)).status).toBe(400)
  })

  it('tells an unlinked user to link rather than failing', async () => {
    const response = await handleJira(get('/api/jira/completed/2026-08'), depsOf())
    expect(response.status).toBe(409)
    expect(JSON.parse(response.body).linked).toBe(false)
  })
})

describe('reading a month', () => {
  it('returns the seven tickets with no hours on any of them', async () => {
    const deps = depsOf()
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    const body = JSON.parse((await handleJira(get('/api/jira/completed/2026-08'), deps)).body)
    expect(body.tickets).toHaveLength(7)
    expect(body.tickets.every((t: { hours: number }) => t.hours === 0)).toBe(true)
    // No field answered so the source is empty. Nothing is typed any more.
    expect(body.tickets.every((t: { hoursSource: string }) => t.hoursSource === '')).toBe(true)
  })

  it('marks a ticket unmapped until the profile says otherwise', async () => {
    const deps = depsOf()
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    const before = JSON.parse((await handleJira(get('/api/jira/completed/2026-08'), deps)).body)
    expect(before.tickets.every((t: { workdayId: null }) => t.workdayId === null)).toBe(true)

    await deps.repository.putProfile(CALLER.sub, profileOf({ PLRS: '4100782' }))
    const after = JSON.parse((await handleJira(get('/api/jira/completed/2026-08'), deps)).body)
    const plrs = after.tickets.filter((t: { projectKey: string }) => t.projectKey === 'PLRS')
    const devh = after.tickets.filter((t: { projectKey: string }) => t.projectKey === 'DEVH')
    expect(plrs.every((t: { workdayId: string }) => t.workdayId === '4100782')).toBe(true)
    expect(devh.every((t: { workdayId: null }) => t.workdayId === null)).toBe(true)
  })

  // One project is not one cost centre so a ticket carries an answer of its
  // own. The screen writes it for a ticket no cost centre was found for.
  it('lets a cost centre set against one ticket beat the project map', async () => {
    const deps = depsOf()
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await deps.repository.putProfile(
      CALLER.sub,
      profileOf({ PLRS: '4100782' }, { 'PLRS-1141': '10100' }),
    )
    const body = JSON.parse((await handleJira(get('/api/jira/completed/2026-08'), deps)).body)
    const of = (key: string) => body.tickets.find((t: { key: string }) => t.key === key).workdayId
    expect(of('PLRS-1141')).toBe('10100')
    expect(of('PLRS-1099')).toBe('4100782')
  })

  it('serves a closed month from the cache without a second search', async () => {
    const jira = new FakeJira()
    const deps = depsOf({ jira })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await handleJira(get('/api/jira/completed/2026-08'), deps)
    const second = JSON.parse((await handleJira(get('/api/jira/completed/2026-08'), deps)).body)
    expect(jira.searches).toBe(1)
    expect(second.cached).toBe(true)
    expect(second.tickets).toHaveLength(7)
  })

  it('searches again once the cache of a closed month is a day old', async () => {
    const jira = new FakeJira()
    const deps = depsOf({ jira })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await handleJira(get('/api/jira/completed/2026-08'), deps)

    const later = depsOf({ jira, repository: deps.repository, now: () => new Date('2026-09-08T13:00:00Z') })
    const again = JSON.parse((await handleJira(get('/api/jira/completed/2026-08'), later)).body)
    expect(jira.searches).toBe(2)
    expect(again.cached).toBe(false)
  })

  it('holds the current month for fifteen minutes rather than a day', async () => {
    const jira = new FakeJira('2026-09')
    const deps = depsOf({ jira })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await handleJira(get('/api/jira/completed/2026-09'), deps)

    const later = depsOf({ jira, repository: deps.repository, now: () => new Date('2026-09-07T12:20:00Z') })
    await handleJira(get('/api/jira/completed/2026-09'), later)
    expect(jira.searches).toBe(2)
  })
})

/** Refuses whatever it is given. Stands in for a revoked consent. */
class RevokedJira extends FakeJira {
  override async refresh(): Promise<TokenSet> {
    throw new JiraUnauthorised('revoked')
  }
}

/**
 * Refuses the way a stale client secret does.
 *
 * A container that started before the secret was corrected holds the old one
 * for its whole life. Atlassian answers that with `access_denied` on a grant it
 * would otherwise honour.
 */
class StaleSecretJira extends FakeJira {
  override async refresh(): Promise<TokenSet> {
    throw new JiraUnauthorised('the token endpoint refused the refresh_token grant with 400', {
      status: 400,
      reason: 'access_denied: Unauthorized',
      grant: 'refresh_token',
    })
  }
}

/** Refuses the way a spent or revoked refresh token does. */
class DeadTokenJira extends FakeJira {
  override async refresh(): Promise<TokenSet> {
    throw new JiraUnauthorised('the token endpoint refused the refresh_token grant with 403', {
      status: 403,
      reason: 'invalid_grant: Unknown or invalid refresh token.',
      grant: 'refresh_token',
    })
  }
}

/** Returns an access token and no refresh token. Atlassian sometimes does. */
class StingyJira extends FakeJira {
  override async refresh(): Promise<TokenSet> {
    this.refreshes++
    return { accessToken: `access-${this.refreshes + 1}`, expiresIn: 3600, refreshToken: null }
  }
}

describe('rotation', () => {
  it('serves a live access token without spending anything', async () => {
    const jira = new FakeJira()
    const deps = depsOf({ jira })
    await deps.repository.putJiraLink(
      CALLER.sub,
      linkOf({ access: 'plain:access-live', accessExpiresAt: '2026-09-07T12:30:00.000Z' }),
    )
    expect(await accessTokenFor(CALLER.sub, deps)).toBe('access-live')
    expect(jira.refreshes).toBe(0)
  })

  it('refreshes a token that is inside the renewal margin', async () => {
    const jira = new FakeJira()
    const deps = depsOf({ jira })
    await deps.repository.putJiraLink(
      CALLER.sub,
      linkOf({ access: 'plain:access-old', accessExpiresAt: '2026-09-07T12:00:30.000Z' }),
    )
    expect(await accessTokenFor(CALLER.sub, deps)).toBe('access-2')
    expect(jira.refreshes).toBe(1)
  })

  it('writes the new token back and keeps the one it replaced', async () => {
    const deps = depsOf()
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await accessTokenFor(CALLER.sub, deps)
    const link = await deps.repository.getJiraLink(CALLER.sub)
    expect(link?.refresh).toBe('plain:refresh-2')
    expect(link?.previousRefresh).toBe('plain:refresh-1')
    expect(link?.generation).toBe(2)
  })

  it('leaves the stored token alone when the response carries none', async () => {
    const deps = depsOf({ jira: new StingyJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    expect(await accessTokenFor(CALLER.sub, deps)).toBe('access-2')
    const link = await deps.repository.getJiraLink(CALLER.sub)
    expect(link?.refresh).toBe('plain:refresh-1')
    expect(link?.previousRefresh).toBeNull()
  })

  it('deletes the link when the consent has been revoked', async () => {
    const deps = depsOf({ jira: new RevokedJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await expect(accessTokenFor(CALLER.sub, deps)).rejects.toThrow(JiraUnauthorised)
    expect(await deps.repository.getJiraLink(CALLER.sub)).toBeNull()
  })

  it('answers a revoked consent as something the screen can act on', async () => {
    const deps = depsOf({ jira: new RevokedJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    const response = await jiraResponse(get('/api/jira/completed/2026-08'), deps)
    expect(response.status).toBe(409)
    expect(JSON.parse(response.body).relink).toBe(true)
  })

  it('deletes the link when the refresh token itself is dead', async () => {
    const deps = depsOf({ jira: new DeadTokenJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await expect(accessTokenFor(CALLER.sub, deps)).rejects.toThrow(JiraUnauthorised)
    expect(await deps.repository.getJiraLink(CALLER.sub)).toBeNull()
  })

  it('keeps the link when Atlassian refused the tracker rather than the token', async () => {
    // A stale client secret is a deployment fault. Deleting the link would put
    // every user through a consent that fails in the same way.
    const deps = depsOf({ jira: new StaleSecretJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await expect(accessTokenFor(CALLER.sub, deps)).rejects.toThrow(JiraUnauthorised)
    expect(await deps.repository.getJiraLink(CALLER.sub)).not.toBeNull()
  })

  it('offers no relink for a refusal a relink cannot fix', async () => {
    const deps = depsOf({ jira: new StaleSecretJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    const response = await jiraResponse(get('/api/jira/completed/2026-08'), deps)
    expect(response.status).toBe(502)
    const body = JSON.parse(response.body)
    expect(body.relink).toBe(false)
    expect(body.error).toContain('access_denied')
  })

  it('releases the claim it took so the next hour can refresh', async () => {
    // The claim is an attribute of the item. A refusal that leaves the link in
    // place must leave it claimable or the link is dead in a different way.
    const deps = depsOf({ jira: new StaleSecretJira() })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    await expect(accessTokenFor(CALLER.sub, deps)).rejects.toThrow(JiraUnauthorised)
    expect(await deps.repository.claimJiraRefresh(CALLER.sub, new Date(Date.now() + 30_000))).toBe(
      true,
    )
  })

  it('never refreshes without the claim and takes what the winner wrote', async () => {
    const jira = new FakeJira()
    const repository = new MemoryRepository()
    await repository.putJiraLink(CALLER.sub, linkOf())
    // Somebody else holds the claim for the next half minute.
    await repository.claimJiraRefresh(CALLER.sub, new Date(Date.now() + 30_000))

    // The winner finishes while this caller is waiting.
    const wait = async () => {
      await repository.putJiraLink(
        CALLER.sub,
        linkOf({
          generation: 2,
          refresh: 'plain:refresh-2',
          previousRefresh: 'plain:refresh-1',
          access: 'plain:access-from-winner',
          accessExpiresAt: '2026-09-07T12:59:00.000Z',
        }),
      )
    }

    const deps = depsOf({ jira, repository, wait })
    expect(await accessTokenFor(CALLER.sub, deps)).toBe('access-from-winner')
    expect(jira.refreshes).toBe(0)
  })

  it('spends the previous token once when the winner never writes', async () => {
    const jira = new FakeJira()
    const repository = new MemoryRepository()
    await repository.putJiraLink(
      CALLER.sub,
      linkOf({ refresh: 'plain:refresh-2', previousRefresh: 'plain:refresh-1' }),
    )
    await repository.claimJiraRefresh(CALLER.sub, new Date(Date.now() + 30_000))

    const deps = depsOf({ jira, repository, wait: async () => {} })
    expect(await accessTokenFor(CALLER.sub, deps)).toBe('access-2')
    expect(jira.refreshes).toBe(1)
  })

  it('gives up rather than racing when there is no previous token', async () => {
    const repository = new MemoryRepository()
    await repository.putJiraLink(CALLER.sub, linkOf())
    await repository.claimJiraRefresh(CALLER.sub, new Date(Date.now() + 30_000))

    const deps = depsOf({ repository, wait: async () => {} })
    const response = await jiraResponse(get('/api/jira/completed/2026-08'), deps)
    expect(response.status).toBe(503)
    expect(JSON.parse(response.body).retry).toBe(true)
  })

  it('takes over a claim a crashed container left behind', async () => {
    const jira = new FakeJira()
    const repository = new MemoryRepository()
    await repository.putJiraLink(CALLER.sub, linkOf())
    // The lease has already lapsed so nobody is really holding it.
    await repository.claimJiraRefresh(CALLER.sub, new Date(Date.now() - 1_000))

    const deps = depsOf({ jira, repository })
    expect(await accessTokenFor(CALLER.sub, deps)).toBe('access-2')
    expect(jira.refreshes).toBe(1)
  })

  it('gives nothing for a user who never linked', async () => {
    expect(await accessTokenFor('nobody', depsOf())).toBeNull()
  })
})

/** Grants an exchange that never carried `offline_access`. */
class NoOfflineJira extends FakeJira {
  override async exchange(): Promise<TokenSet> {
    return { accessToken: 'access-1', expiresIn: 3600, refreshToken: null }
  }
}

describe('the first link', () => {
  it('stores the account id Atlassian reports', async () => {
    const deps = depsOf()
    const link = await linkFrom(CALLER.sub, 'code', REDIRECT, deps)
    expect(link.accountId).toBe('712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c')
    expect(link.generation).toBe(1)
    expect(link.previousRefresh).toBeNull()
  })

  it('refuses an exchange that returned no refresh token', async () => {
    const deps = depsOf({ jira: new NoOfflineJira() })
    await expect(linkFrom(CALLER.sub, 'code', REDIRECT, deps)).rejects.toThrow(/offline_access/)
  })
})

/** Refuses a grant the way Atlassian refuses one. */
class RefusingJira extends FakeJira {
  constructor(
    private readonly grant: string,
    private readonly reason: string,
  ) {
    super()
  }

  override async exchange(): Promise<TokenSet> {
    throw new JiraUnauthorised(`refused. ${this.reason}`, {
      status: 400,
      reason: this.reason,
      grant: this.grant,
    })
  }

  override async refresh(): Promise<TokenSet> {
    throw new JiraUnauthorised(`refused. ${this.reason}`, {
      status: 400,
      reason: this.reason,
      grant: this.grant,
    })
  }
}

const REFUSED = 'invalid_grant: The redirect_uri MUST match the registered callback URL'

function post(path: string, body: string) {
  return { method: 'POST', path, body, caller: CALLER }
}

describe('a refusal from Atlassian', () => {
  /** Answers the token endpoint with the body Atlassian sends on a bad grant. */
  function refusing(status: number, body: unknown) {
    const fetching = (async () =>
      ({ ok: false, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch
    return new AtlassianJira(CLIENT_ID, async () => 'secret', 'cloud', fetching)
  }

  async function raisedBy(run: Promise<unknown>): Promise<JiraUnauthorised> {
    const raised = await run.catch((error: unknown) => error)
    expect(raised).toBeInstanceOf(JiraUnauthorised)
    return raised as JiraUnauthorised
  }

  it('carries the reason Atlassian gave', async () => {
    const error = await raisedBy(
      refusing(400, {
        error: 'invalid_grant',
        error_description: 'The redirect_uri MUST match the registered callback URL',
      }).exchange('code', REDIRECT),
    )
    expect(error.message).toContain('authorization_code')
    expect(error.message).toContain('The redirect_uri MUST match')
    expect(error.refusal).toEqual({ status: 400, reason: REFUSED, grant: 'authorization_code' })
  })

  it('stands a body that carries no reason', async () => {
    const error = await raisedBy(refusing(401, {}).exchange('code', REDIRECT))
    expect(error.refusal?.reason).toBe('the body carried no reason')
    expect(error.refusal?.status).toBe(401)
  })

  it('names the grant that was refused', async () => {
    const error = await raisedBy(refusing(400, { error: 'invalid_grant' }).refresh('refresh-1'))
    expect(error.refusal).toEqual({
      status: 400,
      reason: 'invalid_grant',
      grant: 'refresh_token',
    })
  })

  it('answers a refused exchange with the reason and offers no relink', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = depsOf({ jira: new RefusingJira('authorization_code', REFUSED) })
    const response = await jiraResponse(post('/api/jira/link', '{"code":"abc"}'), deps)
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).error).toBe(REFUSED)
    expect(JSON.parse(response.body).relink).toBe(false)
    logged.mockRestore()
  })

  it('leaves a line naming the route and the grant and the reason', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = depsOf({ jira: new RefusingJira('authorization_code', REFUSED) })
    await jiraResponse(post('/api/jira/link', '{"code":"abc"}'), deps)
    expect(logged).toHaveBeenCalledWith('Atlassian refused a credential', {
      route: 'POST /api/jira/link',
      status: 400,
      grant: 'authorization_code',
      reason: REFUSED,
    })
    logged.mockRestore()
  })

  it('still reads a refused refresh as a consent that lapsed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = depsOf({ jira: new RefusingJira('refresh_token', 'invalid_grant') })
    await deps.repository.putJiraLink(CALLER.sub, linkOf())
    const response = await jiraResponse(get('/api/jira/completed/2026-08'), deps)
    expect(response.status).toBe(409)
    expect(JSON.parse(response.body).relink).toBe(true)
    logged.mockRestore()
  })
})

/** Answers a search with one issue carrying whatever fields a test wants. */
const ACCOUNT = '712020:x'

/** One issue as a search returns it. The project is taken from the key. */
function issueOf(key: string, fields: Record<string, unknown> = {}) {
  return {
    key,
    fields: {
      summary: `summary of ${key}`,
      project: { key: key.split('-')[0] },
      resolutiondate: '',
      ...fields,
    },
  }
}

/** One worklog as a search carries it inline. */
function logOf(started: string, hours: number, accountId = ACCOUNT) {
  return { author: { accountId }, started, timeSpentSeconds: hours * 3600 }
}

/**
 * A Jira site as a stub.
 *
 * Every call the client makes is answered from one object so a test states the
 * site rather than the sequence of responses. `asked` and `jqls` are recorded
 * so a test can pin what was requested rather than only what came back.
 */
function siteOf(site: {
  fields?: { id: string; name: string }[]
  /** Answers the field call with 401. That is a grant short of a scope. */
  fieldsRefused?: boolean
  closed?: unknown[]
  logged?: unknown[]
  parents?: Record<string, unknown>
  worklogs?: Record<string, { total: number; worklogs: unknown[] }>
}) {
  const asked: string[][] = []
  const jqls: string[] = []
  const paths: string[] = []
  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response
  const fetching = (async (url: string, init?: RequestInit) => {
    const at = String(url)
    paths.push(at)
    if (at.includes('/rest/api/3/myself')) return ok({ accountId: ACCOUNT })
    if (at.includes('/rest/api/3/field')) {
      if (site.fieldsRefused) {
        return { ok: false, status: 401, json: async () => ({}) } as unknown as Response
      }
      return ok(site.fields ?? [])
    }
    const worklog = at.match(/\/rest\/api\/3\/issue\/([^/]+)\/worklog/)
    if (worklog) return ok(site.worklogs?.[worklog[1] as string] ?? { total: 0, worklogs: [] })
    const body = JSON.parse(String(init?.body ?? '{}')) as { fields?: string[]; jql?: string }
    if (body.fields) asked.push(body.fields)
    if (body.jql) jqls.push(body.jql)
    const batch = body.jql?.match(/^key in \(([^)]*)\)$/)
    if (batch) {
      const keys = (batch[1] as string).split(',')
      return ok({ issues: keys.map((key) => site.parents?.[key]).filter(Boolean) })
    }
    if (body.jql?.includes('worklogAuthor')) return ok({ issues: site.logged ?? [] })
    return ok({ issues: site.closed ?? [] })
  }) as unknown as typeof fetch
  return { fetching, asked, jqls, paths }
}

/** @param asUser The dev only switch. Null is every deployment. */
function clientOf(
  hoursFields: string[],
  site: Parameters<typeof siteOf>[0],
  asUser: string | null = null,
): { jira: AtlassianJira; asked: string[][]; jqls: string[]; paths: string[] } {
  const stub = siteOf(site)
  return {
    jira: new AtlassianJira(
      'client',
      async () => 'secret',
      'cloud',
      stub.fetching,
      hoursFields,
      asUser,
    ),
    asked: stub.asked,
    jqls: stub.jqls,
    paths: stub.paths,
  }
}

/** The two cost centre fields as `/rest/api/3/field` names them. */
const COST_FIELDS = [
  { id: 'customfield_11500', name: 'Internal Cost Center' },
  { id: 'customfield_11501', name: 'Cost Center Specification' },
]

describe('a cost centre that cannot be read', () => {
  it('still answers the month', async () => {
    // `/rest/api/3/field` needs five granular scopes. A grant short of one is
    // answered with 401 and the caller turns that into an expired connection.
    // A cost centre is context beside a ticket so it is dropped instead.
    const { jira } = clientOf(['worklog'], {
      fieldsRefused: true,
      closed: [issueOf('PLRS-1', {})],
    })
    const tickets = await jira.completed('access', '2026-08')
    expect(tickets).toHaveLength(1)
    expect(tickets[0]?.key).toBe('PLRS-1')
  })
})

describe('where the hours come from', () => {
  /** One closed ticket carrying whatever fields the test is about. */
  function hoursClient(hoursFields: string[], issueFields: Record<string, unknown>) {
    return clientOf(hoursFields, { closed: [issueOf('PLRS-1', issueFields)] })
  }

  it('asks Jira for every configured field and for the worklog with them', async () => {
    const { jira, asked } = clientOf(['worklog', 'timespent', 'customfield_10234'], {})
    await jira.completed('access', '2026-08')
    expect(asked[0]).toContain('customfield_10234')
    expect(asked[0]).toContain('timespent')
    // The worklog rides along with the search now. It used to cost a call per
    // ticket and it no longer does.
    expect(asked[0]).toContain('worklog')
  })

  it('takes the first field that answers', async () => {
    const { jira } = hoursClient(['timespent', 'customfield_10234'], {
      timespent: null,
      customfield_10234: 6,
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(6)
    expect(ticket?.hoursSource).toBe('customfield_10234')
  })

  it('prefers the earlier field in the list', async () => {
    const { jira } = hoursClient(['timespent', 'customfield_10234'], {
      timespent: 3600 * 4,
      customfield_10234: 6,
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(4)
    expect(ticket?.hoursSource).toBe('timespent')
  })

  it('reads a custom field as hours and a Jira field as seconds', async () => {
    const seconds = await hoursClient(['timespent'], { timespent: 3600 * 7 }).jira.completed(
      'a',
      '2026-08',
    )
    expect(seconds[0]?.hours).toBe(7)
    const hours = await hoursClient(['customfield_1'], { customfield_1: 7 }).jira.completed(
      'a',
      '2026-08',
    )
    expect(hours[0]?.hours).toBe(7)
  })

  it('reads a select field through its value', async () => {
    const { jira } = hoursClient(['customfield_1'], { customfield_1: { value: '2.5' } })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(2.5)
  })

  it('reports no source where no field answered', async () => {
    const { jira } = hoursClient(['worklog', 'timespent'], { timespent: null })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(0)
    expect(ticket?.hoursSource).toBe('')
  })

  it('sums the days it logged into the hours', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [
        issueOf('PLRS-1', {
          worklog: {
            total: 2,
            worklogs: [logOf('2026-08-03T09:00:00.000+0200', 2), logOf('2026-08-04T09:00:00.000+0200', 3)],
          },
        }),
      ],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(5)
    expect(ticket?.hoursSource).toBe('worklog')
  })

  it('reads the month with one search for what closed and one for what was logged', async () => {
    const { jira, jqls } = clientOf(['timespent'], { closed: [issueOf('PLRS-1')] })
    await jira.completed('access', '2026-08')
    expect(jqls).toHaveLength(2)
    expect(jqls[0]).toContain('statusCategory = Done')
    expect(jqls[1]).toContain('worklogAuthor')
  })
})

describe('which tickets a month holds', () => {
  it('returns a ticket that was logged against and never closed', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [issueOf('PLRS-1')],
      logged: [issueOf('PLRS-2')],
    })
    const keys = (await jira.completed('access', '2026-08')).map((ticket) => ticket.key)
    expect(keys).toEqual(['PLRS-1', 'PLRS-2'])
  })

  it('keeps the resolution date of a ticket both closed and logged against', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [issueOf('PLRS-1', { resolutiondate: '2026-08-26T14:34:46.607+0200' })],
      logged: [issueOf('PLRS-1')],
    })
    const tickets = await jira.completed('access', '2026-08')
    expect(tickets).toHaveLength(1)
    expect(tickets[0]?.resolvedAt).toBe('2026-08-26T14:34:46.607+0200')
  })

  it('carries the parent key and the parent summary', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [issueOf('PLRS-1', { parent: { key: 'PLRS-900', fields: { summary: 'the epic' } } })],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.parentKey).toBe('PLRS-900')
    expect(ticket?.parentSummary).toBe('the epic')
  })
})

describe('the days a ticket was worked', () => {
  it('builds the breakdown from the worklogs the search carried inline', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [
        issueOf('PLRS-1', {
          worklog: {
            total: 3,
            worklogs: [
              logOf('2026-08-03T09:00:00.000+0200', 2),
              logOf('2026-08-03T13:00:00.000+0200', 1.5),
              logOf('2026-08-04T09:00:00.000+0200', 4),
            ],
          },
        }),
      ],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.days).toEqual({ '2026-08-03': 3.5, '2026-08-04': 4 })
  })

  it('drops a worklog somebody else wrote', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [
        issueOf('PLRS-1', {
          worklog: {
            total: 2,
            worklogs: [
              logOf('2026-08-03T09:00:00.000+0200', 2),
              logOf('2026-08-03T13:00:00.000+0200', 8, 'someone-else'),
            ],
          },
        }),
      ],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.days).toEqual({ '2026-08-03': 2 })
  })

  it('drops a worklog outside the month', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [
        issueOf('PLRS-1', {
          worklog: {
            total: 3,
            worklogs: [
              logOf('2026-07-31T09:00:00.000+0200', 5),
              logOf('2026-08-03T09:00:00.000+0200', 2),
              logOf('2026-09-01T09:00:00.000+0200', 5),
            ],
          },
        }),
      ],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.days).toEqual({ '2026-08-03': 2 })
  })

  it('reads the ticket worklog endpoint where more exist than came inline', async () => {
    const { jira } = clientOf(['worklog'], {
      closed: [
        issueOf('PLRS-1', {
          // Jira inlines the oldest first so these two are July and the month
          // is August. Reading them would report no August at all.
          worklog: {
            total: 4,
            worklogs: [logOf('2026-07-01T09:00:00.000+0200', 1), logOf('2026-07-02T09:00:00.000+0200', 1)],
          },
        }),
      ],
      worklogs: {
        'PLRS-1': {
          total: 4,
          worklogs: [
            logOf('2026-07-01T09:00:00.000+0200', 1),
            logOf('2026-07-02T09:00:00.000+0200', 1),
            logOf('2026-08-05T09:00:00.000+0200', 6),
            logOf('2026-08-06T09:00:00.000+0200', 2),
          ],
        },
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.days).toEqual({ '2026-08-05': 6, '2026-08-06': 2 })
  })

  it('leaves the days empty where the user logged nothing', async () => {
    const { jira } = clientOf(['worklog'], { closed: [issueOf('PLRS-1')] })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.days).toEqual({})
    expect(ticket?.hours).toBe(0)
  })
})

// A 4flow cost centre epic sits in `COMM` or `TMS` while the work sits in a
// product project. So it is never on the parent chain of the ticket booking
// against it. `docs/jira.md` calls that epic the specification ticket.
describe('the specification ticket a link names', () => {
  /** One link as a search carries it. Only one side of a link is ever filled. */
  function linkTo(key: string) {
    return [{ type: { name: 'implements' }, outwardIssue: { key } }]
  }

  it('asks Jira for the links with the rest of the fields', async () => {
    const { jira, asked } = clientOf(['worklog'], { fields: COST_FIELDS, closed: [issueOf('PLRS-1')] })
    await jira.completed('access', '2026-08')
    expect(asked[0]).toContain('issuelinks')
  })

  it('takes the specification off the linked ticket and names it', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { issuelinks: linkTo('COMM-23079') })],
      parents: {
        'COMM-23079': issueOf('COMM-23079', {
          customfield_11501: '4s_Overheads_Concept_&_development',
        }),
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentreSpecification).toBe('4s_Overheads_Concept_&_development')
    expect(ticket?.costCentreSpecificationFrom).toBe('COMM-23079')
  })

  it('takes the cost centre of that ticket too where the chain named none', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { issuelinks: linkTo('COMM-23079') })],
      parents: {
        'COMM-23079': issueOf('COMM-23079', {
          customfield_11500: 21111,
          customfield_11501: '4s_Overheads_Product_operations',
        }),
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentre).toBe('21111')
    expect(ticket?.costCentreFrom).toBe('COMM-23079')
  })

  it('keeps the cost centre the parent chain answered', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', { customfield_11500: '4100782', issuelinks: linkTo('COMM-23079') }),
      ],
      parents: {
        'COMM-23079': issueOf('COMM-23079', {
          customfield_11500: 21111,
          customfield_11501: '4s_Overheads_Other',
        }),
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentre).toBe('4100782')
    expect(ticket?.costCentreSpecification).toBe('4s_Overheads_Other')
  })

  it('reads a link whichever end of it the ticket sits on', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', {
          issuelinks: [{ type: { name: 'implements' }, inwardIssue: { key: 'TMS-2346' } }],
        }),
      ],
      parents: {
        'TMS-2346': issueOf('TMS-2346', { customfield_11501: '4s_Overheads_Absence' }),
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentreSpecification).toBe('4s_Overheads_Absence')
  })

  it('walks the parents of the linked ticket as well', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { issuelinks: linkTo('ECLIPSE-613') })],
      parents: {
        'ECLIPSE-613': issueOf('ECLIPSE-613', { parent: { key: 'COMM-23079' } }),
        'COMM-23079': issueOf('COMM-23079', { customfield_11501: '4s_changeRequest' }),
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentreSpecification).toBe('4s_changeRequest')
    expect(ticket?.costCentreSpecificationFrom).toBe('COMM-23079')
  })

  it('leaves the links alone where the parent chain already answered', async () => {
    const { jira, jqls } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', {
          customfield_11501: '4s_Overheads_Other',
          issuelinks: linkTo('COMM-23079'),
        }),
      ],
    })
    await jira.completed('access', '2026-08')
    expect(jqls.filter((jql) => jql.startsWith('key in ('))).toEqual([])
  })

  it('asks for every link of the month in one search', async () => {
    const { jira, jqls } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', { issuelinks: linkTo('COMM-23079') }),
        issueOf('PLRS-2', { issuelinks: linkTo('COMM-23080') }),
      ],
      parents: {
        'COMM-23079': issueOf('COMM-23079', { customfield_11501: '4s_Overheads_Other' }),
        'COMM-23080': issueOf('COMM-23080', { customfield_11501: '4s_Overheads_Absence' }),
      },
    })
    await jira.completed('access', '2026-08')
    expect(jqls.filter((jql) => jql.startsWith('key in ('))).toEqual([
      'key in (COMM-23079,COMM-23080)',
    ])
  })

  it('follows no link at all where the site has no specification field', async () => {
    const { jira, jqls } = clientOf(['worklog'], {
      fields: [{ id: 'customfield_11500', name: 'Internal Cost Center' }],
      closed: [issueOf('PLRS-1', { issuelinks: linkTo('COMM-23079') })],
    })
    await jira.completed('access', '2026-08')
    expect(jqls.filter((jql) => jql.startsWith('key in ('))).toEqual([])
  })

  it('answers nothing where no link carries one', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { issuelinks: linkTo('PLRS-944') })],
      parents: { 'PLRS-944': issueOf('PLRS-944') },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentreSpecification).toBeNull()
    expect(ticket?.costCentreSpecificationFrom).toBeNull()
  })
})

describe('the cost centre', () => {
  it('finds both fields by name whatever id the site gave them', async () => {
    const { jira, asked } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', { customfield_11500: 4100782, customfield_11501: 'Delivery' }),
      ],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(asked[0]).toContain('customfield_11500')
    expect(ticket?.costCentre).toBe('4100782')
    expect(ticket?.costCentreSpecification).toBe('Delivery')
  })

  it('names the ticket its own cost centre came from', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { customfield_11500: '4100782' })],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentreFrom).toBe('PLRS-1')
  })

  it('inherits the one on the epic and says where it came from', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { parent: { key: 'PLRS-900', fields: { summary: 'the epic' } } })],
      parents: { 'PLRS-900': issueOf('PLRS-900', { customfield_11500: '4100782' }) },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentre).toBe('4100782')
    expect(ticket?.costCentreFrom).toBe('PLRS-900')
  })

  it('walks past an ancestor that carries none', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { parent: { key: 'PLRS-900' } })],
      parents: {
        'PLRS-900': issueOf('PLRS-900', { parent: { key: 'PLRS-800' } }),
        'PLRS-800': issueOf('PLRS-800', { customfield_11500: '4100915' }),
      },
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentre).toBe('4100915')
    expect(ticket?.costCentreFrom).toBe('PLRS-800')
  })

  it('asks for every missing parent of one depth in a single search', async () => {
    const { jira, jqls } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', { parent: { key: 'PLRS-900' } }),
        issueOf('PLRS-2', { parent: { key: 'PLRS-901' } }),
      ],
      parents: {
        'PLRS-900': issueOf('PLRS-900', { customfield_11500: '1' }),
        'PLRS-901': issueOf('PLRS-901', { customfield_11500: '2' }),
      },
    })
    await jira.completed('access', '2026-08')
    const batches = jqls.filter((jql) => jql.startsWith('key in ('))
    expect(batches).toEqual(['key in (PLRS-900,PLRS-901)'])
  })

  it('reads a select option through its value and a list through all of them', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [
        issueOf('PLRS-1', {
          customfield_11500: { value: '4100782' },
          customfield_11501: [{ value: 'Delivery' }, { value: 'Support' }],
        }),
      ],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentre).toBe('4100782')
    expect(ticket?.costCentreSpecification).toBe('Delivery, Support')
  })

  it('treats a blank field as no cost centre at all', async () => {
    const { jira } = clientOf(['worklog'], {
      fields: COST_FIELDS,
      closed: [issueOf('PLRS-1', { customfield_11500: '   ' })],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.costCentre).toBeNull()
    expect(ticket?.costCentreFrom).toBeNull()
  })

  it('walks no parent at all where the site has neither field', async () => {
    const { jira, jqls } = clientOf(['worklog'], {
      fields: [],
      closed: [issueOf('PLRS-1', { parent: { key: 'PLRS-900', fields: { summary: 'the epic' } } })],
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(jqls.some((jql) => jql.startsWith('key in ('))).toBe(false)
    // The parent still arrives. It rides on the ticket rather than on a walk.
    expect(ticket?.parentKey).toBe('PLRS-900')
    expect(ticket?.costCentre).toBeNull()
  })
})

describe('reading the month of another account', () => {
  // The switch `apps/api/src/local.ts` sets and no deployment can. It exists so
  // the hours path and the cost centre path can be seen against an account that
  // holds both. See `docs/jira.md`.
  const OTHER = '712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c'

  it('names the account in both searches rather than the token owner', async () => {
    const { jira, jqls } = clientOf(['worklog'], { closed: [issueOf('PLRS-1')] }, OTHER)
    await jira.completed('access', '2026-08')
    expect(jqls[0]).toContain(`assignee = "${OTHER}"`)
    expect(jqls[1]).toContain(`worklogAuthor = "${OTHER}"`)
    expect(jqls.join(' ')).not.toContain('currentUser()')
  })

  it('says currentUser with no switch set', async () => {
    const { jira, jqls } = clientOf(['worklog'], { closed: [issueOf('PLRS-1')] })
    await jira.completed('access', '2026-08')
    expect(jqls[0]).toContain('assignee = currentUser()')
    expect(jqls[1]).toContain('worklogAuthor = currentUser()')
  })

  it('asks nobody who the token belongs to', async () => {
    // The account is already named so `/myself` would answer what is held. It
    // would also answer the wrong account and every worklog would be dropped.
    const { jira, paths } = clientOf(['worklog'], { closed: [issueOf('PLRS-1')] }, OTHER)
    await jira.completed('access', '2026-08')
    expect(paths.some((at) => at.includes('/rest/api/3/myself'))).toBe(false)
  })

  it('keeps the worklogs of the named account and drops the rest', async () => {
    const { jira } = clientOf(
      ['worklog'],
      {
        closed: [
          issueOf('PLRS-1', {
            worklog: {
              total: 2,
              worklogs: [logOf('2026-08-04T09:00:00.000+0200', 3, OTHER), logOf('2026-08-05T09:00:00.000+0200', 4)],
            },
          }),
        ],
      },
      OTHER,
    )
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.days).toEqual({ '2026-08-04': 3 })
    expect(ticket?.hours).toBe(3)
  })

  it('refuses anything that is not an account id', async () => {
    // The value reaches JQL inside quotes. A quote in it would close the term.
    const bad = () =>
      new AtlassianJira('client', async () => 'secret', 'cloud', fetch, ['worklog'], `x" OR assignee = currentUser()`)
    expect(bad).toThrow('is not an Atlassian account id')
  })
})
