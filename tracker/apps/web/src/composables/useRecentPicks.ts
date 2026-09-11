// What this user picked last in the cost centre list.
//
// The list is held here rather than derived from the timesheet. Because a) a
// pick counts the moment it is made and a booking may never follow it. b) the
// usage ranking beside the grid weighs whole months and cannot say which of two
// was typed last. c) it has to survive a reload or the first pick of every
// session falls back to an alphabet nobody thinks in.

import { ref } from 'vue'

import { withRecentPick } from '@tracker/core'

const STORAGE_KEY = 'timesheets.recentPicks'

function load(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((id): id is string => typeof id === 'string')
  } catch {
    // A hand edited or half written entry is not worth a broken picker.
    return []
  }
}

/** Newest first. An id the catalogue no longer offers is skipped on read. */
export const recentPicks = ref<string[]>(load())

export function rememberPick(workdayId: string): void {
  recentPicks.value = withRecentPick(recentPicks.value, workdayId)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentPicks.value))
  } catch {
    // A full or blocked store costs the order after a reload and nothing else.
  }
}

/** Test hook. The store outlives a component so a case has to clear it. */
export function forgetPicks(): void {
  recentPicks.value = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to undo.
  }
}
