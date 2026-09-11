// What tells the local double apart from the real thing.
//
// The local API hands the browser a client id no Atlassian app owns. So the
// browser must never carry it to a consent screen. Both sides need the same two
// strings which is why they sit here rather than in either one.

/** The client id `apps/api/src/local.ts` answers with. */
export const DEV_JIRA_CLIENT_ID = 'dev-client-id'

/** The code the browser hands back when it skips the consent screen. */
export const DEV_JIRA_CODE = 'dev-code'

/**
 * The header the browser names an Atlassian account in.
 *
 * The local server reads the month of that account rather than of the one whose
 * token it holds. The deployed API ignores it. Both sides need the same string
 * which is why it sits here beside the other two.
 */
export const DEV_JIRA_AS_USER = 'x-dev-jira-as-user'

/**
 * What an Atlassian account id may contain.
 *
 * An account id reaches JQL inside quotes so it is held to this first. Because
 * a) a quote in it would close the term and whatever followed would be read as
 * query. b) the two shapes Atlassian issues are `712020:<uuid>` and a twenty
 * four character hex string so neither needs another character. c) the only
 * values that are not `currentUser()` arrive from an environment variable and
 * from the header above so nothing else checks either.
 *
 * It sits here rather than in `apps/api/src/jira.ts` because the browser holds
 * the field the id is typed into. A second copy of the rule would drift.
 */
export const ATLASSIAN_ACCOUNT_ID = /^[A-Za-z0-9:_-]+$/
