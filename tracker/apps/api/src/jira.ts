// Atlassian.
//
// One interface in front of the Jira REST API so no handler holds a client.
// That is the arrangement `cognito.ts` and `mail.ts` already take.
//
// Nothing here writes to Jira. Every granted scope is a read so no write scope
// exists to misuse. The grant is granular and `docs/jira.md` maps each scope to
// the endpoint below that needs it.
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
 * The most tickets worth a worklog call of their own.
 *
 * A search carries the first twenty worklogs of every issue it returns so
 * almost every ticket is answered without a second call. Only a ticket holding
 * more than that needs one. The bound exists because a heavily logged month
 * would otherwise make one screen wait on a hundred calls.
 */
const MAX_WORKLOG_READS = 40

/**
 * The two cost centre fields matched by name.
 *
 * By name rather than by id. Because a) a custom field id differs per Atlassian
 * site so an id written here would serve one deployment only. b)
 * `/rest/api/3/field` names them. c) the names are business terms that outlive
 * any one field.
 *
 * That call needs five granular scopes and only two of them are named after a
 * field. `packages/core/src/jira-scopes.ts` holds the list and a test holds it
 * against the grant.
 */
const COST_CENTRE_FIELD = 'internal cost center'
const COST_CENTRE_SPEC_FIELD = 'cost center specification'

/**
 * How far up a parent chain a cost centre is looked for.
 *
 * A 4flow ticket usually carries none and the epic above it carries one for
 * everything beneath. Five matches the bookmarklet and no chain seen so far is
 * deeper than two.
 */
const MAX_PARENT_DEPTH = 5

/** The most keys one `key in (...)` search carries. */
const PARENT_BATCH = 50

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

/**
 * What Atlassian said when it refused.
 *
 * Carried on the error rather than parsed back out of its message. Because a)
 * the handler answers one status for a refused exchange and another for a
 * consent that lapsed. b) the grant is the only thing telling those apart. c) a
 * message is for a person to read and not for code to take apart.
 */
export interface Refusal {
  /** 400 or 401 from the token endpoint. 401 or 403 from the API. */
  status: number
  /** The `error` and the `error_description` Atlassian returned. */
  reason: string
  /** The grant refused. Empty when the API refused a call instead. */
  grant: string
}

/**
 * True when a refusal blamed the tracker rather than the stored token.
 *
 * `invalid_grant` is what Atlassian answers for a refresh token that has been
 * spent or revoked. Every other reason on that grant is the client id and the
 * client secret being rejected. The two must be told apart. Because a) a dead
 * token is ended by deleting the link. b) deleting a link over a wrong secret
 * sends the user through a consent that fails the same way. c) one container
 * holding a stale secret would otherwise wipe a working link every hour.
 *
 * A refusal with no reason at all counts as the token. Because the only way to
 * learn otherwise is to have read a reason.
 */
export function refusedTheTracker(refusal: Refusal | null | undefined): boolean {
  if (refusal?.grant !== 'refresh_token') return false
  return refusal.reason !== '' && !refusal.reason.toLowerCase().includes('invalid_grant')
}

/** Thrown when Atlassian refuses the credential rather than the request. */
export class JiraUnauthorised extends Error {
  constructor(
    message: string,
    /** Null when nothing on the network refused it. */
    readonly refusal: Refusal | null = null,
  ) {
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

/**
 * The reason inside a refusal.
 *
 * Atlassian answers `{"error":"invalid_grant","error_description":"..."}` and
 * the status alone cannot tell a spent code from a wrong secret from a redirect
 * the console never registered. So the body is read rather than dropped.
 */
async function reasonOf(response: Response): Promise<string> {
  let body: { error?: unknown; error_description?: unknown }
  try {
    body = (await response.json()) as typeof body
  } catch {
    return 'the body carried no reason'
  }
  const code = typeof body.error === 'string' ? body.error : ''
  const detail = typeof body.error_description === 'string' ? body.error_description : ''
  if (code && detail) return `${code}: ${detail}`
  return code || detail || 'the body carried no reason'
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

/** One worklog as a search carries it or as the worklog endpoint returns it. */
interface Worklog {
  author?: { accountId?: string }
  started?: string
  timeSpentSeconds?: number
}

interface SearchIssue {
  key?: string
  fields?: {
    summary?: string
    timespent?: number | null
    project?: { key?: string }
    parent?: { key?: string; fields?: { summary?: string } }
    resolutiondate?: string
    /** The first twenty worklogs and the count of all of them. */
    worklog?: { total?: number; worklogs?: Worklog[] }
    /** Whatever else `JIRA_HOURS_FIELDS` named. A custom field is one of these. */
    [field: string]: unknown
  }
}

/** The ids the two cost centre fields carry on this site. Empty where neither exists. */
interface CostFields {
  centre: string[]
  specification: string[]
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
   * The cost centre field ids once they have been looked up. One site answers
   * one list so it is read once per container rather than once per month read.
   */
  private costFields: CostFields | null = null

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
      const grant = body.grant_type ?? ''
      const reason = await reasonOf(response)
      throw new JiraUnauthorised(
        `the token endpoint refused the ${grant} grant with ${response.status}. ${reason}`,
        { status: response.status, reason, grant },
      )
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
      throw new JiraUnauthorised(`Jira refused the token with ${response.status} for ${path}`, {
        status: response.status,
        reason: `Jira refused the token for ${path}`,
        grant: '',
      })
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

  private async search(accessToken: string, jql: string, fields: string[]): Promise<SearchIssue[]> {
    const out: SearchIssue[] = []
    let token: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.call<{ issues?: SearchIssue[]; nextPageToken?: string }>(
        accessToken,
        '/rest/api/3/search/jql',
        { jql, fields, maxResults: PAGE, ...(token ? { nextPageToken: token } : {}) },
      )
      out.push(...(result.issues ?? []))
      token = result.nextPageToken
      if (!token) break
    }
    return out
  }

  /**
   * The fields one search asks for.
   *
   * Named rather than defaulted. The default set returns thirteen fields
   * including three blocks of avatar URLs. `worklog` is asked for here rather
   * than read one issue at a time. Because a) a search carries the first twenty
   * worklogs of every issue it returns. b) that answers almost every ticket of
   * a month outright. c) the per issue call then costs nothing except on the
   * few that hold more.
   */
  private searchFields(cost: CostFields): string[] {
    return [
      'summary',
      'project',
      'resolutiondate',
      'parent',
      'worklog',
      ...cost.centre,
      ...cost.specification,
      ...this.hoursFields.filter((field) => field !== 'worklog'),
    ]
  }

  /**
   * The ids of the two cost centre fields on this site.
   *
   * Any failure here leaves both lists empty rather than ending the month. A
   * cost centre sits beside a ticket as context so losing it is not losing the
   * month.
   *
   * A refusal is included in that. Because a) this call needs five scopes and
   * Atlassian answers a token short of one with 401 rather than 403. b) the
   * caller turns a 401 into an expired connection and no relink can fix a
   * scope. c) a token that really is dead is refused by the search as well and
   * that refusal does travel.
   *
   * A throttle still travels. The caller answers that with a retry.
   */
  private async costCentreFields(accessToken: string): Promise<CostFields> {
    if (this.costFields) return this.costFields
    let all: { id?: string; name?: string }[]
    try {
      all = await this.call<{ id?: string; name?: string }[]>(accessToken, '/rest/api/3/field')
    } catch (error) {
      if (error instanceof JiraThrottled) throw error
      return { centre: [], specification: [] }
    }
    // A site that answered something other than a list leaves both empty. The
    // month is still worth returning without a cost centre on it.
    if (!Array.isArray(all)) return { centre: [], specification: [] }
    const named = (name: string) =>
      all
        .filter((field) => (field.name ?? '').trim().toLowerCase() === name)
        .map((field) => field.id)
        .filter((id): id is string => typeof id === 'string' && id !== '')
    this.costFields = {
      centre: named(COST_CENTRE_FIELD),
      specification: named(COST_CENTRE_SPEC_FIELD),
    }
    return this.costFields
  }

  /**
   * The hours this user logged against each ticket day by day.
   *
   * The worklogs a search carried inline answer most tickets outright. Only a
   * ticket holding more than came inline needs a call of its own and that count
   * is bounded by `MAX_WORKLOG_READS`.
   *
   * A worklog somebody else wrote is dropped and so is one outside the month. A
   * shared ticket would otherwise report the whole team hours as this user own.
   */
  private async daysByKey(
    accessToken: string,
    period: string,
    accountId: string,
    issues: Map<string, SearchIssue>,
  ): Promise<Map<string, Record<string, number>>> {
    const { from, to } = monthBounds(period)
    const out = new Map<string, Record<string, number>>()
    const add = (key: string, log: Worklog) => {
      if (log.author?.accountId !== accountId) return
      const day = (log.started ?? '').slice(0, 10)
      if (day < from || day >= to) return
      const seconds = log.timeSpentSeconds ?? 0
      if (seconds <= 0) return
      const days = out.get(key) ?? {}
      days[day] = (days[day] ?? 0) + seconds / 3600
      out.set(key, days)
    }

    const overflowing: string[] = []
    for (const [key, issue] of issues) {
      const field = issue.fields?.worklog
      const inline = field?.worklogs ?? []
      const total = typeof field?.total === 'number' ? field.total : inline.length
      // Jira inlines the oldest worklogs first. So a ticket holding more than
      // came inline would report the wrong days if the inline set were read.
      if (total > inline.length) {
        overflowing.push(key)
        continue
      }
      for (const log of inline) add(key, log)
    }

    // Bounded by the millisecond the month starts on so a ticket open for years
    // does not return every worklog it ever held.
    const after = Date.parse(`${from}T00:00:00Z`) - 1
    for (const key of overflowing.slice(0, MAX_WORKLOG_READS)) {
      let startAt = 0
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await this.call<{ worklogs?: Worklog[]; total?: number }>(
          accessToken,
          `/rest/api/3/issue/${key}/worklog?startedAfter=${after}&maxResults=1000&startAt=${startAt}`,
        )
        const worklogs = result.worklogs ?? []
        for (const log of worklogs) add(key, log)
        startAt += worklogs.length
        if (worklogs.length === 0 || startAt >= (result.total ?? 0)) break
      }
    }
    return out
  }

  /**
   * Every ticket the month named plus every ancestor of one.
   *
   * A parent is fetched by `key in (...)` one depth at a time rather than one
   * call per ticket. Because a) forty tickets under three epics cost one call
   * rather than forty. b) a 4flow chain is one deep or two. c) the search
   * already returns the fields a cost centre is read from.
   *
   * A key the search never answered is recorded as read so the walk ends rather
   * than asking for it again at the next depth.
   */
  private async withAncestors(
    accessToken: string,
    issues: Map<string, SearchIssue>,
    fields: string[],
  ): Promise<Map<string, SearchIssue>> {
    const known = new Map(issues)
    for (let depth = 0; depth < MAX_PARENT_DEPTH; depth++) {
      const missing: string[] = []
      for (const issue of known.values()) {
        const parent = issue.fields?.parent?.key
        if (parent && !known.has(parent) && !missing.includes(parent)) missing.push(parent)
      }
      if (missing.length === 0) break
      for (let at = 0; at < missing.length; at += PARENT_BATCH) {
        const batch = missing.slice(at, at + PARENT_BATCH)
        const found = await this.search(accessToken, `key in (${batch.join(',')})`, fields)
        for (const issue of found) if (issue.key) known.set(issue.key, issue)
      }
      for (const key of missing) if (!known.has(key)) known.set(key, {})
    }
    return known
  }

  /**
   * Every ticket of the month.
   *
   * Two searches rather than one. A ticket closed in the month is what the
   * export is about and a ticket logged against is where the hours are. Neither
   * set contains the other so both are read and the union is returned.
   */
  async completed(accessToken: string, period: string): Promise<CompletedTicket[]> {
    const cost = await this.costCentreFields(accessToken)
    const fields = this.searchFields(cost)
    const [accountId, closed, logged] = await Promise.all([
      this.accountId(accessToken),
      this.search(accessToken, completedJql(period), fields),
      this.search(accessToken, worklogJql(period), fields),
    ])

    // Closed first so a ticket both closed and logged against keeps the record
    // carrying its resolution date.
    const issues = new Map<string, SearchIssue>()
    for (const issue of [...closed, ...logged]) {
      if (issue.key && !issues.has(issue.key)) issues.set(issue.key, issue)
    }

    const days = await this.daysByKey(accessToken, period, accountId, issues)
    // An ancestor is read for its cost centre and for nothing else. So a site
    // holding neither field is not walked at all. The parent key and the parent
    // summary both arrive on the ticket itself either way.
    //
    // The walk asks for no worklog. Nobody logs time against an epic.
    const inherits = cost.centre.length + cost.specification.length > 0
    const known = inherits
      ? await this.withAncestors(
          accessToken,
          issues,
          fields.filter((field) => field !== 'worklog'),
        )
      : issues
    return [...issues.keys()].map((key) =>
      toTicket(key, known, days.get(key) ?? {}, cost, this.hoursFields),
    )
  }
}

/**
 * A custom field read as one string.
 *
 * A cost centre arrives as a number on one site and as a select option on
 * another and as a list of options on a third. All three state the same fact so
 * all three are read to one string. Blank is nothing rather than an answer.
 */
function textOfField(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (Array.isArray(value)) {
    const parts = value.map(textOfField).filter((part): part is string => part !== null)
    return parts.length === 0 ? null : parts.join(', ')
  }
  if (typeof value === 'object') {
    const option = value as { value?: unknown; name?: unknown }
    return textOfField(option.value ?? option.name ?? null)
  }
  return null
}

/**
 * A field read from the ticket or from the nearest ancestor carrying one.
 *
 * A 4flow ticket rarely carries a cost centre of its own. The epic above it
 * carries one for everything beneath. So the chain is walked rather than the
 * ticket alone read. Which ticket answered is returned alongside because a user
 * has to know a figure is inherited before booking against it.
 */
function inheritedField(
  key: string,
  known: Map<string, SearchIssue>,
  ids: string[],
): { value: string | null; from: string | null } {
  let at: string | undefined = key
  for (let depth = 0; depth <= MAX_PARENT_DEPTH && at; depth++) {
    const issue = known.get(at)
    if (!issue) break
    for (const id of ids) {
      const text = textOfField(issue.fields?.[id])
      if (text !== null) return { value: text, from: at }
    }
    at = issue.fields?.parent?.key
  }
  return { value: null, from: null }
}

/**
 * One search result as the screen receives it.
 *
 * The hours take the first configured field that answers. `worklog` reads the
 * day breakdown this user wrote rather than the ticket own total so a shared
 * ticket reports one person share of it. Nothing is estimated from a resolution
 * date because five of the seven August tickets were closed in one bulk action.
 * Nothing is typed either. Decision 5 of `docs/todo-jira-option-a.md` settled
 * that.
 */
function toTicket(
  key: string,
  known: Map<string, SearchIssue>,
  days: Record<string, number>,
  cost: CostFields,
  hoursFields: string[],
): CompletedTicket {
  const issue = known.get(key) ?? {}
  const logged = Object.values(days).reduce((sum, hours) => sum + hours, 0)
  let hours = 0
  let hoursSource = NO_HOURS_SOURCE
  for (const field of hoursFields) {
    const found =
      field === 'worklog'
        ? logged > 0
          ? logged
          : null
        : field === 'timespent'
          ? secondsToHours(issue.fields?.timespent)
          : hoursFromField(issue.fields?.[field])
    if (found !== null && found > 0) {
      hours = found
      hoursSource = field
      break
    }
  }
  const centre = inheritedField(key, known, cost.centre)
  const specification = inheritedField(key, known, cost.specification)
  return {
    key,
    summary: issue.fields?.summary ?? key,
    projectKey: issue.fields?.project?.key ?? '',
    resolvedAt: issue.fields?.resolutiondate ?? '',
    parentKey: issue.fields?.parent?.key ?? null,
    parentSummary: issue.fields?.parent?.fields?.summary ?? null,
    costCentre: centre.value,
    costCentreFrom: centre.from,
    costCentreSpecification: specification.value,
    days,
    // Null until the project is mapped. `jira-handlers.ts` fills it from the
    // profile of the caller.
    workdayId: null,
    hours,
    hoursSource,
  }
}
