// The first run wizard.
//
// It opens itself for a user whose profile is not complete yet. Complete means
// a location and an entity because every other field has a working default.
//
// Skipping is allowed. Because a) somebody may want to look at the month view
// before answering anything. b) the settings link already turns orange while
// the profile is short. c) a screen with no way past it is the thing people
// close the tab on.
//
// The open reading is latched by armWizard rather than derived from the profile.
// Because a) the questions write to the shared profile as they are answered.
// b) a derived reading turns false on the location step and drops the user out
// of the dialog. c) the steps after the location would never be seen.

import { computed, ref } from 'vue'

import { profileComplete } from './useTimesheet'

const SEEN_KEY = 'tracker.wizardSeen'

const seen = ref(localStorage.getItem(SEEN_KEY) !== null)
const reopened = ref(false)
const running = ref(false)

export const wizardOpen = computed(() => reopened.value || running.value)

/**
 * Decides whether the questions are needed. Called once the profile has landed
 * because that is what the decision reads. A later call is ignored so an open
 * wizard stays open until it is finished or skipped.
 */
export function armWizard(): void {
  if (seen.value || running.value) return
  running.value = !profileComplete.value
}

/** Reached from the settings page so the questions can be walked again. */
export function openWizard(): void {
  reopened.value = true
}

/** Finishing and skipping close it the same way. Neither is asked again. */
export function closeWizard(): void {
  localStorage.setItem(SEEN_KEY, new Date().toISOString())
  seen.value = true
  running.value = false
  reopened.value = false
}

/** Test hook. The record would otherwise leak from one test to the next. */
export function forgetWizard(): void {
  localStorage.removeItem(SEEN_KEY)
  seen.value = false
  running.value = false
  reopened.value = false
}
