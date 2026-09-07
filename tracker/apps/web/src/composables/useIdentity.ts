// Who the app acts for.
//
// One reading with two sources. The deployed build takes the person from the
// Cognito token. A local build with no pool configured takes them from the dev
// switch. Every screen asks here rather than choosing between the two.

import { computed } from 'vue'

import { authEnabled, currentClaims, signOut as endSession, type Claims } from '@/lib/auth'
import { devUser } from '@/composables/useDevUser'

const NOBODY: Claims = { sub: '', email: '', firstName: '', lastName: '', groups: [] }

/**
 * The token is settled before the app mounts and does not change while the page
 * lives so the federated reading is computed once. The dev switch does change so
 * that reading tracks it.
 */
export const identity = computed<Claims>(() =>
  authEnabled ? (currentClaims() ?? NOBODY) : devUser,
)

/** Backoffice may replace the project list. */
export function isBackoffice(): boolean {
  return identity.value.groups.includes('backoffice')
}

/** There is nothing to sign out of when the dev switch is the source. */
export const canSignOut = authEnabled

export function signOut(): void {
  endSession()
}
