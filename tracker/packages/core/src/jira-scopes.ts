// What the Atlassian app is granted.
//
// Granular scopes rather than classic. The cost is that the Jira REST API
// decides the list per endpoint and it is longer than the name of the endpoint
// suggests. `GET /rest/api/3/field` needs five scopes and only two of them are
// named after a field. So the list below is derived from `ENDPOINT_SCOPES`
// rather than reasoned about. `jira-scopes.test.ts` holds the two together.
//
// It lives in core so the browser builds the authorize URL from the same list a
// test checks. The Jira client itself never reads it. Atlassian answers a call
// whose token is short of a scope with 401 rather than 403 so a gap here reads
// on screen as an expired connection.

/**
 * Every granular scope the app is granted.
 *
 * The order is the order the developer console generates so the two lists can
 * be compared by eye. Atlassian refuses an authorize call that asks for a scope
 * the app was never granted.
 */
export const JIRA_SCOPES = [
  'read:issue-meta:jira',
  'read:issue:jira',
  'read:issue.property:jira',
  'read:issue-details:jira',
  'read:issue.time-tracking:jira',
  'read:field:jira',
  'read:field.default-value:jira',
  'read:field.option:jira',
  'read:user:jira',
  'read:application-role:jira',
  'read:avatar:jira',
  'read:group:jira',
  'read:issue-worklog:jira',
  'read:issue-worklog.property:jira',
  'read:project-role:jira',
  'read:field-configuration:jira',
  'read:project:jira',
  'read:project-category:jira',
]

/**
 * What the authorize URL asks for.
 *
 * `offline_access` is not a Jira scope so the console does not list it and it
 * has no place in `JIRA_SCOPES`. Without it Atlassian returns an access token
 * good for an hour and no refresh token at all.
 */
export const CONSENT_SCOPES = [...JIRA_SCOPES, 'offline_access']

/**
 * The granular scopes the Jira REST API lists against each call the tracker
 * makes. Read from the published OpenAPI document rather than from the prose.
 *
 * A new call goes in here first. The test then says whether the grant covers
 * it. That is cheaper than reading a 401 in production.
 */
export const ENDPOINT_SCOPES: Record<string, string[]> = {
  'GET /rest/api/3/myself': [
    'read:application-role:jira',
    'read:group:jira',
    'read:user:jira',
    'read:avatar:jira',
  ],
  'POST /rest/api/3/search/jql': [
    'read:issue-details:jira',
    'read:field.default-value:jira',
    'read:field.option:jira',
    'read:field:jira',
    'read:group:jira',
  ],
  'GET /rest/api/3/issue/{key}/worklog': [
    'read:group:jira',
    'read:issue-worklog:jira',
    'read:issue-worklog.property:jira',
    'read:project-role:jira',
    'read:user:jira',
    'read:avatar:jira',
  ],
  'GET /rest/api/3/field': [
    'read:field:jira',
    'read:avatar:jira',
    'read:project-category:jira',
    'read:project:jira',
    'read:field-configuration:jira',
  ],
}

/** Every scope in the grant that no call needs. */
export function spareScopes(): string[] {
  const needed = new Set(Object.values(ENDPOINT_SCOPES).flat())
  return JIRA_SCOPES.filter((scope) => !needed.has(scope))
}

/** Every scope a call needs that the grant is short of. */
export function missingScopes(): string[] {
  const granted = new Set(JIRA_SCOPES)
  const needed = new Set(Object.values(ENDPOINT_SCOPES).flat())
  return [...needed].filter((scope) => !granted.has(scope))
}
