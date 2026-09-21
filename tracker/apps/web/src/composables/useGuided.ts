// The guided build. Four answers and a month.
//
// It exists because the two parts of a month are not alike. An absence has to
// be recorded on the day it was taken. Work does not, because the tracker asks
// what was worked in the month and never on which day. The month view treats
// both the same and so the user places every day of both by hand.
//
// Nothing here writes the month. `build` hands the grid to the store and the
// store owns the save the way it does for every other view.

import { computed, reactive, ref } from 'vue'

import {
  buildMonth,
  catalogue,
  guidedMonth,
  type Allocation,
  type GuidedAbsence,
  type GuidedMonth,
} from '@tracker/core'

import {
  calendar,
  halfDays,
  month,
  profile,
  saveSheet,
  target,
  year,
} from '@/composables/useTimesheet'

/** One row of step three. A cost centre and the share of the month it took. */
export interface GuidedRow {
  workdayId: string
  specification: string | null
  percent: number
  tasks: string | null
}

/** The absence types the catalogue offers. Step one asks for a count of each. */
export const absenceOptions = computed(() => catalogue.absenceTypes.map((a) => a.label))

/**
 * How many days the user was away. Step one. Keyed by the absence label.
 *
 * A count for each label rather than one count under one label. Because a) the
 * workbook totals `Vacation or sickness` apart from `Other absence`. b) a month
 * holding both is ordinary rather than the exception. c) a single label made
 * the user build the month twice or correct the second kind by hand afterwards.
 */
export const daysOffBy = reactive<Record<string, number>>({})

/** What step one asks for altogether. */
export const daysOff = computed(() =>
  absenceOptions.value.reduce((sum, label) => sum + (daysOffBy[label] ?? 0), 0),
)

/** Which absence each placed day holds. Step two. Keyed by the date. */
export const placed = reactive<Record<string, string>>({})

/** The dates step two has placed. In date order. */
export const chosen = computed(() => Object.keys(placed).sort())

/** The rows of step three. */
export const rows = reactive<GuidedRow[]>([])

/** The month the build produced. Null until the button is pressed. */
export const built = ref<GuidedMonth | null>(null)

/** The working days of the open month. Only these may hold an absence. */
export const workingDates = computed(() => calendar.value.filter((day) => !day.nonWorking))

/** How many days of one absence are on the calendar already. */
export function placedCount(label: string): number {
  return Object.values(placed).filter((held) => held === label).length
}

/** How many days of one absence step two still owes. */
export function leftToPlace(label: string): number {
  return Math.max(0, (daysOffBy[label] ?? 0) - placedCount(label))
}

/** How many days step two still owes altogether. */
export const stillToPlace = computed(() =>
  absenceOptions.value.reduce((sum, label) => sum + leftToPlace(label), 0),
)

/** The absence types step one asked for days of. */
export const kindsInPlay = computed(() =>
  absenceOptions.value.filter((label) => (daysOffBy[label] ?? 0) > 0),
)

/** The absence the user picked to place. Null until one is picked. */
export const kind = ref<string | null>(null)

/**
 * The absence the next placed day takes.
 *
 * The picked one holds while it still has days left. The first kind with days
 * left takes over after that so the calendar never refuses a click step one
 * still owes a day for.
 */
export const placing = computed<string | null>(() => {
  const picked = kind.value
  if (picked !== null && leftToPlace(picked) > 0) return picked
  return absenceOptions.value.find((label) => leftToPlace(label) > 0) ?? null
})

/**
 * The most days one absence may still ask for.
 *
 * A month holds no more absence than it has working days. What the other kinds
 * have asked for is taken off first so two counts cannot together ask for a
 * month that could never be placed.
 */
export function maxFor(label: string): number {
  return Math.max(0, workingDates.value.length - (daysOff.value - (daysOffBy[label] ?? 0)))
}

export function setCount(label: string, days: number): void {
  const asked = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0
  daysOffBy[label] = Math.min(asked, maxFor(label))
  trimToCount()
}

export function toggleDate(date: string): void {
  if (placed[date] !== undefined) {
    delete placed[date]
    return
  }
  // The counts are what step one asked for so the calendar refuses the day past
  // them. Raising a count is the way to place another.
  const label = placing.value
  if (label === null) return
  placed[date] = label
}

/** Drops any placed day the counts no longer cover. The latest date goes first. */
export function trimToCount(): void {
  for (const label of absenceOptions.value) {
    const held = chosen.value.filter((date) => placed[date] === label)
    for (const date of held.slice(daysOffBy[label] ?? 0)) delete placed[date]
  }
}

export function addRow(): void {
  rows.push({ workdayId: '', specification: null, percent: 0, tasks: null })
  spreadEvenly()
}

export function removeRow(index: number): void {
  rows.splice(index, 1)
  spreadEvenly()
}

/** The rows that name a cost centre. A blank row is not an allocation. */
export const filled = computed(() => rows.filter((row) => row.workdayId !== ''))

/** Divides a hundred between the filled rows. The remainder goes to the first. */
export function spreadEvenly(): void {
  const list = filled.value
  if (list.length === 0) return
  const each = Math.floor(100 / list.length)
  list.forEach((row) => (row.percent = each))
  const first = list[0]
  if (first) first.percent += 100 - each * list.length
}

export const shareTotal = computed(() => filled.value.reduce((sum, row) => sum + row.percent, 0))

/** What step three still owes. A month is built from a hundred and nothing else. */
export const balanced = computed(() => filled.value.length === 0 || shareTotal.value === 100)

/** The days of the month work has to cover once the absence is taken out. */
export const workTarget = computed(() => Math.max(0, target.value - chosen.value.length))

/** True once every step has been answered. What the build button reads. */
export const ready = computed(
  () => stillToPlace.value === 0 && filled.value.length > 0 && balanced.value,
)

function allocations(): Allocation[] {
  return filled.value.map((row) => ({
    workdayId: row.workdayId,
    specification: row.specification,
    percent: row.percent,
    location: profile.location,
    tasks: row.tasks,
  }))
}

function absences(): GuidedAbsence[] {
  return chosen.value.map((date) => ({
    date,
    workdayId: placed[date] as string,
    days: 1 as const,
  }))
}

/**
 * Writes the month.
 *
 * It replaces whatever the month held. Because a) a user on this screen has
 * asked for the month to be built. b) the answer is on the screen underneath
 * before anything is submitted. c) the month view is one click away and every
 * row of the result is editable there.
 */
export async function build(): Promise<void> {
  if (!ready.value) return
  const result = guidedMonth({
    days: buildMonth(year.value, month.value, profile.location ?? ''),
    absences: absences(),
    allocations: allocations(),
    target: target.value,
  })
  built.value = result
  halfDays.value = result.halfDays
  await saveSheet()
}

/** Clears the answers. The month they wrote is left where it is. */
export function reset(): void {
  for (const label of Object.keys(daysOffBy)) delete daysOffBy[label]
  for (const date of Object.keys(placed)) delete placed[date]
  kind.value = null
  rows.splice(0, rows.length)
  built.value = null
}
