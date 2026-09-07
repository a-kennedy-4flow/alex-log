// Atlassian.
//
// One interface in front of the Jira REST API so no handler holds a client.
// That is the arrangement `cognito.ts` and `mail.ts` already take.
//
// Nothing here writes to Jira. The app is granted `read:jira-work` and
// `read:jira-user` and no write scope exists to misuse. See `docs/jira.md`.
//
// The rotation of a refresh token is not handled here. `jira-tokens.ts` owns
// that because it needs the table and this file needs only the network.

import { DEFAULT_HOURS_FIELDS, NO_HOURS_SOURCE, type CompletedTicket } from '@tracker/core'

/** Where a token is exchanged. Not the site host and not the API host. */
const AUTH = 'https://auth.atlassian.com/oauth/token'

/** The host that answers a 3LO token. The site host refuses one. */
const API = 'https://api.atlassian.com'

/** The most issues one search returns. The API caps this itself. */
const PAGE = 100

/** A guard against a paging loop. A month of one user is one page. */
const MAX_PAGES = 20

/**
 * The most tickets worth one worklog call each.
 *
 * A JQL search returns issues rather than the worklogs under them so a full
 * read costs one call per ticket. The bound exists because a bulk closing month
 * would otherwise make one screen wait on a hundred calls.
 */
const MAX_WORKLOG_READS = 40

/** What Atlassian returns from either grant. */
export interface TokenSet {
  accessToken: string
  /** Seconds. An access token lives an hour. */
  expiresIn: number
  /**
   * Null when the response carried none. The caller must then keep the token it
   * already holds. Writing null over a working token ends the link.
   */
  refreshToken: string | null
}

export interface Jira {
  /** Turns the code the consent screen returned into a token set. */
  exchange(code: string, redirectUri: string): Promise<TokenSet>
  /** Spends a refresh token. The one passed in is disabled by doing so. */
  refresh(refreshToken: string): Promise<TokenSet>
  /** The Atlassian account id of whoever the token belongs to. */
  accountId(accessToken: string): Promise<string>
  /** Every ticket this user completed inside the period. */
  completed(accessToken: string, period: string): Promise<CompletedTicket[]>
}

/** Thrown when Atlassian refuses the credential rather than the request. */
export class JiraUnauthorised extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JiraUnauthorised'
  }
}

/** Thrown when Atlassian asks for the call to be made again later. */
export class JiraThrottled extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JiraThrottled'
  }
}

/** Both Jira time fields are seconds. Every configured field is hours. */
function secondsToHours(value: unknown): number | null {
  return typeof value === 'number' && value > 0 ? value / 3600 : null
}

/** The first day of the period and the first day of the month after it. */
export function monthBounds(period: string): { from: string; to: string } {
  const [year, month] = period.split('-').map(Number) as [number, number]
  const pad = (value: number) => String(value).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { from: `${year}-${pad(month)}-01`, to: `${nextYear}-${pad(nextMonth)}-01` }
}

/**
 * The tickets one user closed inside one month.
 *
 * The bounds are absolute rather than `startOfMonth(-1)`. Because a) six months
 * of history are kept so any of them may be reopened. b) the period key already
 * gives both dates. c) a relative bound answers a different question in the
 * first minute of a new month.
 *
 * `statusCategory = Done` is taken over `status changed to (...)`. Both were run
 * against the live site and returned the same seven issues. Because a) this
 * needs no list of status names. b) migrated 4flow projects carry status names
 * that differ per project. c) the changed form scans the changelog.
 */
export function completedJql(period: string): string {
  const { from, to } = monthBounds(period)
  return (
    'assignee = currentUser() AND statusCategory = Done' +
    ` AND resolutiondate >= "${from}" AND resolutiondate < "${to}"` +
    ' ORDER BY resolutiondate DESC'
  )
}

/** The tickets this user logged time against inside the month. */
export function worklogJql(period: string): string {
  const { from, to } = monthBounds(period)
  return (
    'worklogAuthor = currentUser()' +
    ` AND worklogDate >= "${from}" AND worklogDate < "${to}"`
  )
}

interface SearchIssue {
  key?: string
  fields?: {
    summary?: string
    timespent?: number | null
    project?: { key?: string }
    parent?: { fields?: { summary?: string } }
    resolutiondate?: string
    /** Whatever else `JIRA_HOURS_FIELDS` named. A custom field is one of these. */
    [field: string]: unknown
  }
}

/**
 * Reads one field as a number of hours.
 *
 * `worklog` and `timespent` are handled by the caller because both are seconds
 * and one of them needs a call of its own. Anything else is a field somebody
 * configured and it is read as hours. Because a) a custom field for effort is
 * written in hours by every convention. b) a number field arrives as a number.
 * c) a select field arrives as an object carrying `value`.
 */
function hoursFromField(value: unknown): number | null {
  if (typeof value === 'number') return value > 0 ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return hoursFromField((value as { value: unknown }).value)
  }
  return null
}

export class AtlassianJira implements Jira {
  /**
   * @param secret Reads the client secret. It is fetched once per container
   *   rather than once per call which is what `dynamo.ts` already relies on.
   */
  constructor(
    private readonly clientId: string,
    private readonly secret: () => Promise<string>,
    private readonly cloudId: string,
    private readonly fetching: typeof fetch = fetch,
    /**
     * The fields searched for an hours figure. The first that answers wins.
     * `worklog` and `timespent` are the two Jira holds itself. Anything else is
     * a custom field read as hours.
     */
    private readonly hoursFields: string[] = DEFAULT_HOURS_FIELDS,
  ) {}

  private async token(body: Record<string, string>): Promise<TokenSet> {
    const response = await this.fetching(AUTH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        // Atlassian requires the secret on every grant. There is no PKCE on
        // this flow so a public client cannot exchange anything.
        client_secret: await this.secret(),
        ...body,
      }),
    })
    if (response.status === 401 || response.status === 400) {
      throw new JiraUnauthorised(`the token endpoint refused the credential with ${response.status}`)
    }
    if (response.status === 429) throw new JiraThrottled('the token endpoint is throttling')
    if (!response.ok) throw new Error(`the token endpoint answered ${response.status}`)
    const json = (await response.json()) as {
      access_token?: string
      expires_in?: number
      refresh_token?: string
    }
    if (!json.access_token) throw new Error('the token endpoint returned no access token')
    return {
      accessToken: json.access_token,
      expiresIn: json.expires_in ?? 3600,
      refreshToken: json.refresh_token ?? null,
    }
  }

  async exchange(code: string, redirectUri: string): Promise<TokenSet> {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken })
  }

  private async call<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetching(`${API}/ex/jira/${this.cloudId}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.status === 401 || response.status === 403) {
      throw new JiraUnauthorised(`Jira refused the token with ${response.status}`)
    }
    if (response.status === 429) throw new JiraThrottled('Jira is throttling')
    if (!response.ok) throw new Error(`Jira answered ${response.status} for ${path}`)
    return (await response.json()) as T
  }

  async accountId(accessToken: string): Promise<string> {
    // `/rest/api/3/myself` is used rather than `/me` because the latter needs
    // the `read:me` scope which this app does not ask for.
    const self = await this.call<{ accountId?: string }>(accessToken, '/rest/api/3/myself')
    if (!self.accountId) throw new Error('Jira returned no account id')
    return self.accountId
  }

  private async search(accessToken: string, jql: string): Promise<SearchIssue[]> {
    const out: SearchIssue[] = []
    let token: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.call<{ issues?: SearchIssue[]; nextPageToken?: string }>(
        accessToken,
        '/rest/api/3/search/jql',
        {
          jql,
          // Named rather than defaulted. The default set returns thirteen
          // fields including three blocks of avatar URLs. Whatever
          // `JIRA_HOURS_FIELDS` asked for is added. `worklog` is left out
          // because it is read one issue at a time.
          fields: [
            'summary',
            'project',
            'resolutiondate',
            'parent',
            ...this.hoursFields.filter((field) => field !== 'worklog'),
          ],
          maxResults: PAGE,
          ...(token ? { nextPageToken: token } : {}),
        },
      )
      out.push(...(result.issues ?? []))
      token = result.nextPageToken
      if (!token) break
    }
    return out
  }

  /**
   * The hours this user logged against each of a set of tickets.
   *
   * The worklog search runs first so only a ticket it names costs a second
   * call. That query returns nothing at all on the 4flow site today so the
   * usual cost of this method is one call.
   */
  private async hoursByKey(
    accessToken: string,
    period: string,
    accountId: string,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    const logged = await this.search(accessToken, worklogJql(period))
    const { from, to } = monthBounds(period)
    for (const issue of logged.slice(0, MAX_WORKLOG_READS)) {
      if (!issue.key) continue
      const result = await this.call<{
        worklogs?: { author?: { accountId?: string }; started?: string; timeSpentSeconds?: number }[]
      }>(accessToken, `/rest/api/3/issue/${issue.key}/worklog`)
      let seconds = 0
      for (const log of result.worklogs ?? []) {
        if (log.author?.accountId !== accountId) continue
        const day = (log.started ?? '').slice(0, 10)
        if (day < from || day >= to) continue
        seconds += log.timeSpentSeconds ?? 0
      }
      if (seconds > 0) out.set(issue.key, seconds / 3600)
    }
    return out
  }

  async completed(accessToken: string, period: string): Promise<CompletedTicket[]> {
    const wantsWorklogs = this.hoursFields.includes('worklog')
    const accountId = wantsWorklogs ? await this.accountId(accessToken) : ''
    const [issues, worklogHours] = await Promise.all([
      this.search(accessToken, completedJql(period)),
      wantsWorklogs
        ? this.hoursByKey(accessToken, period, accountId)
        : Promise.resolve(new Map<string, number>()),
    ])
    return issues
      .filter((issue) => issue.key)
      .map((issue) => toTicket(issue, worklogHours, this.hoursFields))
  }
}

/**
 * One search result as the screen receives it.
 *
 * The hours take the first configured field that answers. Nothing is estimated
 * from a resolution date because five of the seven August tickets were closed
 * in one bulk action. Nothing is typed either. Decision 5 of
 * `docs/todo-jira-option-a.md` settled that.
 */
function toTicket(
  issue: SearchIssue,
  worklogHours: Map<string, number>,
  hoursFields: string[],
): CompletedTicket {
  const key = issue.key as string
  let hours = 0
  let hoursSource = NO_HOURS_SOURCE
  for (const field of hoursFields) {
    const found =
      field === 'worklog'
        ? (worklogHours.get(key) ?? null)
        : field === 'timespent'
          ? secondsToHours(issue.fields?.timespent)
          : hoursFromField(issue.fields?.[field])
    if (found !== null && found > 0) {
      hours = found
      hoursSource = field
      break
    }
  }
  return {
    key,
    summary: issue.fields?.summary ?? key,
    projectKey: issue.fields?.project?.key ?? '',
    resolvedAt: issue.fields?.resolutiondate ?? '',
    parentSummary: issue.fields?.parent?.fields?.summary ?? null,
    // Null until the project is mapped. `jira-handlers.ts` fills it from the
    // profile of the caller.
    workdayId: null,
    hours,
    hoursSource,
  }
}
