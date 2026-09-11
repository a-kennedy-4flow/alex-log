// Who the browser claims to be when no user pool is configured.
//
// The local API trusts these headers. The deployed API ignores them and reads
// the Cognito token instead. The switcher exists so the two roles can be walked
// through without a pool. `useIdentity` decides which source is live.

import { reactive, ref, watch } from 'vue'

import { DEV_JIRA_AS_USER } from '@tracker/core'

export interface DevUser {
  sub: string
  email: string
  firstName: string
  lastName: string
  groups: string[]
}

export const DEV_USERS: DevUser[] = [
  {
    sub: 'alex',
    email: 'a.kennedy@4flow.com',
    firstName: 'Alexander',
    lastName: 'Kennedy',
    groups: [],
  },
  {
    sub: 'dana',
    email: 'd.novak@4flow.com',
    firstName: 'Dana',
    lastName: 'Novak',
    groups: [],
  },
  {
    sub: 'backoffice',
    email: 'projecttracker@4flow.com',
    firstName: 'Backoffice',
    lastName: 'Team',
    groups: ['backoffice'],
  },
]

const STORAGE_KEY = 'timesheets.devUser'

function initial(): DevUser {
  const saved = localStorage.getItem(STORAGE_KEY)
  return DEV_USERS.find((u) => u.sub === saved) ?? (DEV_USERS[0] as DevUser)
}

export const devUser = reactive<DevUser>({ ...initial() })

watch(
  () => devUser.sub,
  (sub) => localStorage.setItem(STORAGE_KEY, sub),
)

export function switchTo(sub: string): void {
  const next = DEV_USERS.find((u) => u.sub === sub)
  if (next) Object.assign(devUser, next)
}

const JIRA_KEY = 'timesheets.devJiraAsUser'

/**
 * The Atlassian account the local server reads the month of.
 *
 * Empty is the account the server was started for. That is whoever consented
 * unless `JIRA_AS_USER` named one. It is kept beside the caller because the two
 * are the same kind of thing. A header the local server trusts and the deployed
 * one ignores.
 *
 * It is not the caller. The tracker user stays whoever the switch above says
 * and only the Jira month changes.
 */
export const jiraAsUser = ref(localStorage.getItem(JIRA_KEY) ?? '')

watch(jiraAsUser, (id) => {
  if (id === '') localStorage.removeItem(JIRA_KEY)
  else localStorage.setItem(JIRA_KEY, id)
})

/** The headers the local API reads in place of a token. */
export function devHeaders(): Record<string, string> {
  return {
    'x-dev-sub': devUser.sub,
    'x-dev-email': devUser.email,
    'x-dev-first-name': devUser.firstName,
    'x-dev-last-name': devUser.lastName,
    'x-dev-groups': devUser.groups.join(','),
    // Absent rather than empty where no account is named. An empty header and a
    // missing one read the same on the server so the shorter one is sent.
    ...(jiraAsUser.value === '' ? {} : { [DEV_JIRA_AS_USER]: jiraAsUser.value }),
  }
}
