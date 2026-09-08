// What tells the local double apart from the real thing.
//
// The local API hands the browser a client id no Atlassian app owns. So the
// browser must never carry it to a consent screen. Both sides need the same two
// strings which is why they sit here rather than in either one.

/** The client id `apps/api/src/local.ts` answers with. */
export const DEV_JIRA_CLIENT_ID = 'dev-client-id'

/** The code the browser hands back when it skips the consent screen. */
export const DEV_JIRA_CODE = 'dev-code'
