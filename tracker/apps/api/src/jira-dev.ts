// The local only switch that reads the month of another Atlassian account.
//
// `JIRA_AS_USER` sets it for the whole server. The `x-dev-jira-as-user` header
// sets it for one request so the browser can change the account without this
// server restarting. Neither reaches a deployment. `build.mjs` bundles from
// `lambda.ts` and nothing there imports this file or `local.ts`.
//
// It is not impersonation. Every search carries the token of whoever consented
// on this machine so it returns what that person may already browse and nothing
// more. `docs/jira.md` says why the switch exists at all.

import { ATLASSIAN_ACCOUNT_ID, DEV_JIRA_AS_USER } from '@tracker/core'

import type { Jira } from './jira'
import type { JiraDeps } from './jira-handlers'
import type { Repository, StoredJiraLink } from './repository'

/** What `node:http` hands over. One header arrives three shapes. */
export type RequestHeaders = Record<string, string | string[] | undefined>

/** Refused rather than answered as though another account had been read. */
export class JiraAsUserRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JiraAsUserRefused'
  }
}

/**
 * The account one request names. Null where it names none.
 *
 * A malformed id is refused rather than dropped. Because a) a dropped one reads
 * as the switch never having worked. b) the id reaches JQL inside quotes so it
 * is checked before anything holds it. c) typing it is the only way it arrives.
 */
export function accountFrom(headers: RequestHeaders): string | null {
  const raw = headers[DEV_JIRA_AS_USER]
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  if (value === '') return null
  if (!ATLASSIAN_ACCOUNT_ID.test(value)) {
    throw new JiraAsUserRefused(`${value} is not an Atlassian account id`)
  }
  return value
}

/**
 * The stored month hidden from a read of another account.
 *
 * That cache rides on the Jira link of the caller and it is keyed by period
 * alone. So a month read as one account would be served again for the next
 * account and the switch would show the wrong tickets for up to a day. A read
 * of another account therefore sees no cache and leaves none behind.
 *
 * The rest of the record still lands. A refresh token that rotated during the
 * read is the rest of it and dropping that would end the link.
 *
 * A proxy rather than a copy. Because a) `Repository` is nineteen methods and
 * only two of them touch the cache. b) the implementation is a class holding
 * its own state so a spread would lose both. c) the default traps forward a
 * write so the state stays where it was.
 */
export function withoutTicketCache(inner: Repository): Repository {
  return new Proxy(inner, {
    get(target, name, receiver) {
      if (name === 'getJiraLink') {
        return async (sub: string): Promise<StoredJiraLink | null> => {
          const link = await target.getJiraLink(sub)
          return link === null ? null : { ...link, cache: null }
        }
      }
      if (name === 'putJiraLinkIfUnchanged') {
        return (sub: string, link: StoredJiraLink, generation: number): Promise<boolean> =>
          target.putJiraLinkIfUnchanged(sub, { ...link, cache: null }, generation)
      }
      return Reflect.get(target, name, receiver)
    },
  })
}

/**
 * The Jira deps of one request.
 *
 * The deps built at startup answer where no header names an account. Where one
 * does the client of that account answers instead and the stored month is
 * hidden from it.
 *
 * One client per account rather than one per request. Because the two cost
 * centre field ids are looked up once per client so a client per request would
 * spend that call on every month read.
 *
 * @param clientFor Builds the client of one account. Null where the double is
 *   answering and a header is then refused rather than obeyed. Because the
 *   double serves one fixed month of one fixed account so a switch with nothing
 *   behind it would answer as though the account it named looked like that.
 */
export function jiraPerRequest(
  base: JiraDeps,
  clientFor: ((account: string) => Jira) | null,
): (headers: RequestHeaders) => JiraDeps {
  const clients = new Map<string, Jira>()
  const uncached = withoutTicketCache(base.repository)
  return (headers) => {
    const account = accountFrom(headers)
    if (account === null) return base
    if (clientFor === null) {
      throw new JiraAsUserRefused(
        'the double serves one fixed month so it reads no other account. Start the server with JIRA_CLIENT_SECRET.',
      )
    }
    let client = clients.get(account)
    if (!client) {
      client = clientFor(account)
      clients.set(account, client)
    }
    return { ...base, jira: client, repository: uncached }
  }
}
