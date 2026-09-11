// The Jira double.
//
// It is a file of its own rather than a class beside `AtlassianJira`. Because
// `build.mjs` bundles from `lambda.ts` and nothing there reaches this module so
// it cannot arrive in the deployed artefact.
//
// The seven tickets are the real ones. They were read from
// `4flow.atlassian.net` on 2026-09-07 with the JQL in `docs/jira.md`. Every
// hours figure is zero because that site holds no worklogs. So the double shows
// what a linked user actually sees rather than a convenient fiction.
//
// The parent key and the two cost centre fields and the day breakdown all read
// as absent here. Not because the site holds none but because that capture
// never asked for them. A test about any of the three stubs `fetch` behind
// `AtlassianJira` instead. `__tests__/jira.test.ts` does exactly that.

import { NO_HOURS_SOURCE, type CompletedTicket } from '@tracker/core'

import type { Cipher } from './jira-tokens'
import type { Jira, TokenSet } from './jira'

type FakeTicket = Omit<
  CompletedTicket,
  | 'workdayId'
  | 'hours'
  | 'hoursSource'
  | 'parentKey'
  | 'costCentre'
  | 'costCentreFrom'
  | 'costCentreSpecification'
  | 'costCentreSpecificationFrom'
  | 'specification'
  | 'days'
>

const AUGUST: FakeTicket[] = [
  {
    key: 'PLRS-1141',
    summary: 'Add TO/Load identification or subsequent emails, not just the first one',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-26T14:34:46.607+0200',
    parentSummary: 'User group feedback/Additional Scope',
  },
  {
    key: 'PLRS-1099',
    summary: 'Add ability to customize reopen status (when a new email comes into a closed ticket)',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-13T10:50:53.684+0200',
    parentSummary: 'Customization Abilities',
  },
  {
    key: 'PLRS-995',
    summary: 'Bring frontend in line with date time recommendations',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-13T10:50:39.378+0200',
    parentSummary: 'Release 2 technical tasks',
  },
  {
    key: 'DEVH-4887',
    summary: 'Create WebProxy 4FL-APP-167v',
    projectKey: 'DEVH',
    resolvedAt: '2026-08-13T10:49:44.964+0200',
    parentSummary: null,
  },
  {
    key: 'PLRS-1115',
    summary: 'Set up roles throughout the front and backend.',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-13T10:49:22.166+0200',
    parentSummary: null,
  },
  {
    key: 'PLRS-1116',
    summary: 'Add role requirements to openapi documention',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-13T10:49:14.922+0200',
    parentSummary: 'Release 2 technical tasks',
  },
  {
    key: 'PLRS-1117',
    summary: 'Email templates page should not kill the preview just because the subject is missing.',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-13T10:49:04.787+0200',
    parentSummary: null,
  },
]

export class FakeJira implements Jira {
  /** Counted so a test can prove a cache or a claim stopped a second call. */
  refreshes = 0
  searches = 0

  constructor(
    private readonly period = '2026-08',
    private readonly account = '712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c',
  ) {}

  async exchange(): Promise<TokenSet> {
    return { accessToken: 'access-1', expiresIn: 3600, refreshToken: 'refresh-1' }
  }

  async refresh(): Promise<TokenSet> {
    this.refreshes++
    return {
      accessToken: `access-${this.refreshes + 1}`,
      expiresIn: 3600,
      refreshToken: `refresh-${this.refreshes + 1}`,
    }
  }

  async accountId(): Promise<string> {
    return this.account
  }

  async completed(_accessToken: string, period: string): Promise<CompletedTicket[]> {
    this.searches++
    if (period !== this.period) return []
    return AUGUST.map((ticket) => ({
      ...ticket,
      parentKey: null,
      costCentre: null,
      costCentreFrom: null,
      costCentreSpecification: null,
      costCentreSpecificationFrom: null,
      days: {},
      workdayId: null,
      specification: null,
      hours: 0,
      // No field answered. That is what every row of the real site reads.
      hoursSource: NO_HOURS_SOURCE,
    }))
  }
}

/**
 * No encryption at all.
 *
 * The development server has no KMS key and a test must not reach one. The
 * prefix is there so a value that ever reached a real table would be obvious.
 */
export class PlainCipher implements Cipher {
  async encrypt(plain: string): Promise<string> {
    return `plain:${plain}`
  }

  async decrypt(cipher: string): Promise<string> {
    return cipher.startsWith('plain:') ? cipher.slice('plain:'.length) : cipher
  }
}
