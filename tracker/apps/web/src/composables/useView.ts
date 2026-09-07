// Which view the month is drawn in.
//
// The grid and the board edit one month so they share the `/` route. The choice
// is remembered the way the profile is remembered in `useTimesheet.ts`. A `view`
// search parameter can follow later if a linkable view is wanted.

import { ref, watch } from 'vue'

export type MonthView = 'grid' | 'board'

const VIEW_KEY = 'timesheets.view'

function loadView(): MonthView {
  return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'grid'
}

export const view = ref<MonthView>(loadView())

watch(view, (value) => localStorage.setItem(VIEW_KEY, value))

export function setView(value: MonthView): void {
  view.value = value
}
