// The Jira routes and the token rotation.
//
// Rotation is the part of this feature most likely to break so most of what is
// here is about two callers spending one refresh token. See `docs/jira.md`.
//
// Nothing here reaches the network. Every double is in this file or in
// `jira-fake.ts`.

import { describe, expect, it } from 'vitest'
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

function profileOf(jiraProjects: Record<string, string> = {}): UserProfile {
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

/** Answers a search with one issue carrying whatever fields a test wants. */
function issueWith(fields: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      issues: [
        {
          key: 'PLRS-1',
          fields: { summary: 'one', project: { key: 'PLRS' }, resolutiondate: '', ...fields },
        },
      ],
    }),
  } as unknown as Response
}

describe('where the hours come from', () => {
  /** Records what the search asked for so a test can pin the field list. */
  function clientOf(fields: string[], issueFields: Record<string, unknown>) {
    const asked: string[][] = []
    const fetching = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { fields?: string[]; jql?: string }
      if (body.fields) asked.push(body.fields)
      // The worklog search finds nothing so no per issue call follows.
      if (body.jql?.includes('worklogAuthor')) {
        return { ok: true, status: 200, json: async () => ({ issues: [] }) } as unknown as Response
      }
      if (body.jql) return issueWith(issueFields)
      return {
        ok: true,
        status: 200,
        json: async () => ({ accountId: '712020:x' }),
      } as unknown as Response
    }) as unknown as typeof fetch
    return {
      jira: new AtlassianJira('client', async () => 'secret', 'cloud', fetching, fields),
      asked,
    }
  }

  it('asks Jira for every configured field except the worklog', async () => {
    const { jira, asked } = clientOf(['worklog', 'timespent', 'customfield_10234'], {})
    await jira.completed('access', '2026-08')
    expect(asked[0]).toContain('customfield_10234')
    expect(asked[0]).toContain('timespent')
    expect(asked[0]).not.toContain('worklog')
  })

  it('takes the first field that answers', async () => {
    const { jira } = clientOf(['timespent', 'customfield_10234'], {
      timespent: null,
      customfield_10234: 6,
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(6)
    expect(ticket?.hoursSource).toBe('customfield_10234')
  })

  it('prefers the earlier field in the list', async () => {
    const { jira } = clientOf(['timespent', 'customfield_10234'], {
      timespent: 3600 * 4,
      customfield_10234: 6,
    })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(4)
    expect(ticket?.hoursSource).toBe('timespent')
  })

  it('reads a custom field as hours and a Jira field as seconds', async () => {
    const seconds = await clientOf(['timespent'], { timespent: 3600 * 7 }).jira.completed('a', '2026-08')
    expect(seconds[0]?.hours).toBe(7)
    const hours = await clientOf(['customfield_1'], { customfield_1: 7 }).jira.completed('a', '2026-08')
    expect(hours[0]?.hours).toBe(7)
  })

  it('reads a select field through its value', async () => {
    const { jira } = clientOf(['customfield_1'], { customfield_1: { value: '2.5' } })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(2.5)
  })

  it('reports no source where no field answered', async () => {
    const { jira } = clientOf(['worklog', 'timespent'], { timespent: null })
    const [ticket] = await jira.completed('access', '2026-08')
    expect(ticket?.hours).toBe(0)
    expect(ticket?.hoursSource).toBe('')
  })

  it('skips the account lookup when no worklog is wanted', async () => {
    const { jira, asked } = clientOf(['timespent'], { timespent: 3600 })
    await jira.completed('access', '2026-08')
    // One search and nothing else. The worklog search is what costs the extra.
    expect(asked).toHaveLength(1)
  })
})
