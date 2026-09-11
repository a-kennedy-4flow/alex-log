// The local only switch that reads the month of another Atlassian account.
//
// `JIRA_AS_USER` sets it for the whole server. A header sets it for one request
// so the browser can change the account without a restart. The account the
// feature was developed on holds no worklog and no cost centre so neither path
// can be seen without borrowing an account that has them.
//
// Nothing here reaches Atlassian. The clients are counted rather than called.

import { describe, expect, it } from 'vitest'
import { DEV_JIRA_AS_USER, type CompletedTicket } from '@tracker/core'

import { accountFrom, jiraPerRequest, withoutTicketCache, JiraAsUserRefused } from '../jira-dev'
import type { Jira, TokenSet } from '../jira'
import type { JiraDeps } from '../jira-handlers'
import { MemoryRepository, type StoredJiraLink } from '../repository'
import { PlainCipher } from '../jira-fake'

const ALEX = '712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c'

/** A client that answers nothing. Only which one was picked matters here. */
function clientOf(): Jira {
  return {
    exchange: () => Promise.resolve({} as TokenSet),
    refresh: () => Promise.resolve({} as TokenSet),
    accountId: () => Promise.resolve(''),
    completed: () => Promise.resolve([] as CompletedTicket[]),
  }
}

function depsOf(repository = new MemoryRepository()): JiraDeps {
  return {
    repository,
    jira: clientOf(),
    cipher: new PlainCipher(),
    now: () => new Date('2026-09-08T12:00:00.000Z'),
    clientId: 'client-1',
    redirectUri: 'http://localhost:5173/jira/callback',
    siteUrl: 'https://4flow.atlassian.net',
  }
}

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

const cacheOf = () => ({
  period: '2026-08',
  fetchedAt: '2026-09-08T11:00:00.000Z',
  version: 1,
  tickets: [] as CompletedTicket[],
})

describe('the account a request names', () => {
  it('is nothing where no header carries one', () => {
    expect(accountFrom({})).toBeNull()
    expect(accountFrom({ [DEV_JIRA_AS_USER]: '' })).toBeNull()
    expect(accountFrom({ [DEV_JIRA_AS_USER]: '   ' })).toBeNull()
  })

  it('is the id the header carries', () => {
    expect(accountFrom({ [DEV_JIRA_AS_USER]: ALEX })).toBe(ALEX)
    // A twenty four character hex id is the older shape Atlassian issues.
    expect(accountFrom({ [DEV_JIRA_AS_USER]: '5b10a2844c20165700ede21g' })).toBe(
      '5b10a2844c20165700ede21g',
    )
  })

  it('takes the first where a header arrives twice', () => {
    expect(accountFrom({ [DEV_JIRA_AS_USER]: [ALEX, 'other'] })).toBe(ALEX)
  })

  it('refuses an id no Atlassian account could have', () => {
    // The id reaches JQL inside quotes. A quote in it would close the term and
    // whatever followed would be read as query.
    for (const bad of ['"', `${ALEX}" OR key = "X`, 'a b', "o'brien", '712020:*']) {
      expect(() => accountFrom({ [DEV_JIRA_AS_USER]: bad })).toThrow(JiraAsUserRefused)
    }
  })
})

describe('the deps of one request', () => {
  it('answers the startup deps where no header names an account', () => {
    const base = depsOf()
    const perRequest = jiraPerRequest(base, () => clientOf())
    expect(perRequest({})).toBe(base)
  })

  it('answers the client of the account a header names', () => {
    const base = depsOf()
    const named: string[] = []
    const perRequest = jiraPerRequest(base, (account) => {
      named.push(account)
      return clientOf()
    })
    const deps = perRequest({ [DEV_JIRA_AS_USER]: ALEX })
    expect(named).toEqual([ALEX])
    expect(deps.jira).not.toBe(base.jira)
    // Everything else is the startup deps. The consent and the token are of
    // whoever linked on this machine and the account named changes neither.
    expect(deps.clientId).toBe(base.clientId)
    expect(deps.cipher).toBe(base.cipher)
  })

  it('builds one client per account rather than one per request', () => {
    // The two cost centre field ids are looked up once per client. A client per
    // request would spend that call on every month read.
    const named: string[] = []
    const perRequest = jiraPerRequest(depsOf(), (account) => {
      named.push(account)
      return clientOf()
    })
    const first = perRequest({ [DEV_JIRA_AS_USER]: ALEX })
    const again = perRequest({ [DEV_JIRA_AS_USER]: ALEX })
    const other = perRequest({ [DEV_JIRA_AS_USER]: 'other-account' })
    expect(named).toEqual([ALEX, 'other-account'])
    expect(again.jira).toBe(first.jira)
    expect(other.jira).not.toBe(first.jira)
  })

  it('refuses the switch where the double is answering', () => {
    // The double serves one fixed month of one fixed account so a switch with
    // nothing behind it would answer as though the account it named looked
    // like that.
    const perRequest = jiraPerRequest(depsOf(), null)
    expect(() => perRequest({ [DEV_JIRA_AS_USER]: ALEX })).toThrow(JiraAsUserRefused)
    expect(() => perRequest({})).not.toThrow()
  })
})

describe('the stored month of a read as another account', () => {
  it('is hidden from the read', async () => {
    // The cache rides on the link of the caller and it is keyed by period
    // alone. Serving it would show the tickets of the account read before.
    const repository = new MemoryRepository()
    await repository.putJiraLink('user-1', linkOf({ cache: cacheOf() }))
    const hidden = withoutTicketCache(repository)
    expect((await repository.getJiraLink('user-1'))?.cache).not.toBeNull()
    expect((await hidden.getJiraLink('user-1'))?.cache).toBeNull()
  })

  it('is not written by the read either', async () => {
    const repository = new MemoryRepository()
    await repository.putJiraLink('user-1', linkOf())
    const hidden = withoutTicketCache(repository)
    const wrote = await hidden.putJiraLinkIfUnchanged(
      'user-1',
      linkOf({ cache: cacheOf(), refresh: 'plain:refresh-2', generation: 2 }),
      1,
    )
    expect(wrote).toBe(true)
    const stored = await repository.getJiraLink('user-1')
    expect(stored?.cache).toBeNull()
    // The rest of the record lands. A refresh token that rotated during the
    // read is the rest of it and dropping that would end the link.
    expect(stored?.refresh).toBe('plain:refresh-2')
  })

  it('leaves every other method of the repository alone', async () => {
    const repository = new MemoryRepository()
    const hidden = withoutTicketCache(repository)
    // A field the implementation assigns rather than mutates. The proxy has to
    // forward the write or the catalogue would land on the wrapper.
    const entry = { version: '1', updatedAt: '2026-09-08T12:00:00.000Z', data: { projects: [] } }
    await hidden.putCatalogue(entry)
    expect(await repository.getCatalogue()).toEqual(entry)
    await hidden.deleteJiraLink('user-1')
    expect(await hidden.getJiraLink('user-1')).toBeNull()
  })
})
