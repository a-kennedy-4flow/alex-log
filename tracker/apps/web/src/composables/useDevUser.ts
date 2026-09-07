// Who the browser claims to be when no user pool is configured.
//
// The local API trusts these headers. The deployed API ignores them and reads
// the Cognito token instead. The switcher exists so the two roles can be walked
// through without a pool. `useIdentity` decides which source is live.

import { reactive, watch } from 'vue'

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

/** The headers the local API reads in place of a token. */
export function devHeaders(): Record<string, string> {
  return {
    'x-dev-sub': devUser.sub,
    'x-dev-email': devUser.email,
    'x-dev-first-name': devUser.firstName,
    'x-dev-last-name': devUser.lastName,
    'x-dev-groups': devUser.groups.join(','),
  }
}
