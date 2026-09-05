// The editor state. One month at a time for one user.
//
// The store is a module singleton so the month view and the quick fill and the
// summary all read the same grid. Persistence is localStorage until the API
// exists. Six months are kept.

import { computed, reactive, ref, watch } from 'vue'

import { ApiError, api, usingApi } from '@/lib/api'

import type { HalfDay, Timesheet, UserProfile } from '@timesheets/core'
import { absenceTotal, aggregateByProject, aggregateByWeek, buildMonth, dayValueFor, defaultSpecificationFor, emptyGrid, hasErrors, spareOfDay, targetDays, totalDays, validate, workingDayCount } from '@timesheets/core'

const HISTORY_MONTHS = 6
const PROFILE_KEY = 'timesheets.profile'
const SHEET_KEY = 'timesheets.sheet'

/* ---------- profile ---------- */

// Cognito supplies the email and the name. The user sets the rest on first
// login. The sample values stand in until auth is wired.
const DEFAULT_PROFILE: UserProfile = {
  email: 'name.firstname@4flow.com',
  firstName: 'Firstname',
  lastName: 'Name',
  location: null,
  entity: null,
  businessLine: null,
  workPercent: null,
}

/**
 * A saved profile predates any field added later so the defaults fill the gaps.
 * Without the merge a new field would read as undefined where the type promises
 * null.
 */
function loadProfile(): UserProfile {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (raw) {
    try {
      return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<UserProfile>) }
    } catch {
      // A corrupt entry is replaced rather than repaired.
    }
  }
  return { ...DEFAULT_PROFILE }
}

export const profile = reactive<UserProfile>(loadProfile())

watch(
  () => ({ ...profile }),
  (value) => localStorage.setItem(PROFILE_KEY, JSON.stringify(value)),
  { deep: true },
)

export const profileComplete = computed(() => profile.location !== null && profile.entity !== null)

/* ---------- period ---------- */

const now = new Date()
export const year = ref(now.getUTCFullYear())
export const month = ref(now.getUTCMonth() + 1)

export const calendar = computed(() =>
  buildMonth(year.value, month.value, profile.location),
)

export const workingDays = computed(() => workingDayCount(calendar.value))

/** The `yyyy-mm` key the API stores a month under. */
export const period = computed(() => `${year.value}-${String(month.value).padStart(2, '0')}`)

/**
 * Tracker cell B8 for the open month. Null means the contract decides. Held
 * with the sheet rather than the profile because it is a fact about one month.
 */
export const monthOverride = ref<number | null>(null)

/** Tracker cell K102. */
export const target = computed(() =>
  targetDays(workingDays.value, profile.workPercent, monthOverride.value),
)

/** What the contract alone would expect. Shown so an override is legible. */
export const contractDays = computed(() =>
  targetDays(workingDays.value, profile.workPercent, null),
)

/* ---------- grid ---------- */

export const halfDays = ref<HalfDay[]>(emptyGrid(calendar.value))

function sheetKey(y: number, m: number): string {
  return `${SHEET_KEY}.${y}-${String(m).padStart(2, '0')}`
}

/** Writes the month. The API owns it once configured. */
export async function saveSheet(): Promise<void> {
  const sheet: Timesheet = {
    year: year.value,
    month: month.value,
    location: profile.location ?? '',
    halfDays: halfDays.value,
    adjustedWorkDays: monthOverride.value,
  }
  if (usingApi) {
    await api.putSheet(period.value, {
      location: sheet.location,
      halfDays: sheet.halfDays,
      adjustedWorkDays: sheet.adjustedWorkDays,
    })
    await loadHistory()
    return
  }
  localStorage.setItem(sheetKey(year.value, month.value), JSON.stringify(sheet))
  pruneHistory()
  await loadHistory()
}

export function loadSheet(y: number, m: number): Timesheet | null {
  const raw = localStorage.getItem(sheetKey(y, m))
  if (!raw) return null
  try {
    return JSON.parse(raw) as Timesheet
  } catch {
    return null
  }
}

/** Six months are kept so anything older is dropped on save. */
function pruneHistory(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(`${SHEET_KEY}.`)) keys.push(key)
  }
  keys.sort()
  for (const key of keys.slice(0, Math.max(0, keys.length - HISTORY_MONTHS))) {
    localStorage.removeItem(key)
  }
}

/** The months already saved. Newest first. */
export function savedMonths(): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const match = key?.match(/\.(\d{4})-(\d{2})$/)
    if (key?.startsWith(`${SHEET_KEY}.`) && match) {
      out.push({ year: Number(match[1]), month: Number(match[2]) })
    }
  }
  return out.sort((a, b) => b.year - a.year || b.month - a.month)
}

/** Rebuilds the grid for the current month keeping anything already saved. */
export function openMonth(y: number, m: number): void {
  year.value = y
  month.value = m
  if (!usingApi) {
    const saved = loadSheet(y, m)
    halfDays.value = saved ? saved.halfDays : emptyGrid(calendar.value)
    monthOverride.value = saved?.adjustedWorkDays ?? null
    return
  }
  halfDays.value = emptyGrid(calendar.value)
  monthOverride.value = null
  void api
    .getSheet(period.value)
    .then((sheet) => {
      // A slow answer for a month the user has already left is dropped.
      if (period.value === `${sheet.year}-${String(sheet.month).padStart(2, '0')}`) {
        halfDays.value = sheet.halfDays
        monthOverride.value = sheet.adjustedWorkDays ?? null
      }
    })
    .catch((error: unknown) => {
      // A month that was never saved is not a fault.
      if (!(error instanceof ApiError) || error.status !== 404) console.error(error)
    })
}

/** Reads the profile the API holds. Cognito owns the name and the email. */
export async function loadProfileFromApi(): Promise<void> {
  if (!usingApi) return
  Object.assign(profile, await api.getProfile())
}

export async function saveProfile(): Promise<void> {
  if (!usingApi) return
  Object.assign(profile, await api.putProfile({ ...profile }))
}

/**
 * The default timesheet. Line 7 of the spec calls for the previous month to
 * prepopulate so the cost centre mix carries over. The day values are dropped
 * because the calendar differs between months.
 */
export function projectMixOfPreviousSheet(): { workdayId: string; specification: string | null }[] {
  const previous = savedMonths().find((s) => s.year !== year.value || s.month !== month.value)
  if (!previous) return []
  const sheet = loadSheet(previous.year, previous.month)
  if (!sheet) return []
  const seen = new Set<string>()
  const out: { workdayId: string; specification: string | null }[] = []
  for (const entry of sheet.halfDays) {
    if (!entry.workdayId) continue
    const key = `${entry.workdayId} ${entry.specification ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ workdayId: entry.workdayId, specification: entry.specification })
  }
  return out
}

// A change of month or location rebuilds the calendar so the grid follows.
watch([year, month], ([y, m]) => openMonth(y, m))
watch(
  () => profile.location,
  () => {
    if (halfDays.value.length !== calendar.value.length * 2) {
      halfDays.value = emptyGrid(calendar.value)
    }
  },
)

/* ---------- history ---------- */

/**
 * The months already saved. Read once so the reference list beside the grid
 * costs nothing to render. Six months are kept so the walk is short.
 */
export const history = ref<Timesheet[]>([])

export async function loadHistory(): Promise<void> {
  if (!usingApi) {
    history.value = savedMonths().flatMap((m) => {
      const sheet = loadSheet(m.year, m.month)
      return sheet ? [sheet] : []
    })
    return
  }
  try {
    const { sheets } = await api.listSheets()
    const loaded = await Promise.all(
      sheets.map((s) => api.getSheet(s.period).catch(() => null)),
    )
    // A sheet carries an `updatedAt` the domain type does not name. Widening
    // it here keeps that detail out of the reference list.
    history.value = loaded.flatMap((sheet) => (sheet ? [sheet] : []))
  } catch {
    history.value = []
  }
}

export interface CostCentreUse {
  workdayId: string
  specification: string | null
  /** Days booked against it across everything read. */
  days: number
  /** How many months it appears in. */
  months: number
  lastUsed: string
}

/**
 * The cost centres this user reaches for. Ordered by days booked so the one
 * they live on comes first. The open month counts too so a code picked a moment
 * ago is already on the list.
 */
export const topCostCentres = computed<CostCentreUse[]>(() => {
  const seen = new Map<string, CostCentreUse>()
  const months: { halfDays: HalfDay[]; key: string }[] = [
    ...history.value
      .filter((sheet) => `${sheet.year}-${sheet.month}` !== `${year.value}-${month.value}`)
      .map((sheet) => ({
        halfDays: sheet.halfDays,
        key: `${sheet.year}-${String(sheet.month).padStart(2, '0')}`,
      })),
    { halfDays: halfDays.value, key: period.value },
  ]

  for (const { halfDays: rows, key } of months) {
    const inThisMonth = new Set<string>()
    for (const row of rows) {
      if (row.workdayId === null || row.days === null) continue
      const existing = seen.get(row.workdayId)
      if (existing) {
        existing.days += row.days
        if (key > existing.lastUsed) existing.lastUsed = key
      } else {
        seen.set(row.workdayId, {
          workdayId: row.workdayId,
          specification: row.specification,
          days: row.days,
          months: 0,
          lastUsed: key,
        })
      }
      inThisMonth.add(row.workdayId)
    }
    for (const id of inThisMonth) {
      const use = seen.get(id)
      if (use) use.months++
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.days - a.days || b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, 5)
})

/* ---------- derived ---------- */

export const issues = computed(() =>
  validate({
    halfDays: halfDays.value,
    days: calendar.value,
    target: target.value,
    location: profile.location,
    entity: profile.entity,
  }),
)

export const blocked = computed(() => hasErrors(issues.value))
export const booked = computed(() => totalDays(halfDays.value))
export const byProject = computed(() => aggregateByProject(halfDays.value))
export const byWeek = computed(() => aggregateByWeek(halfDays.value, calendar.value))
export const vacationDays = computed(() => absenceTotal(halfDays.value, 'Vacation or sickness'))
export const otherAbsenceDays = computed(() => absenceTotal(halfDays.value, 'Other absence'))

/** Half days grouped by date in grid order. */
export const rowsByDate = computed(() => {
  const map = new Map<string, HalfDay[]>()
  for (const half of halfDays.value) {
    const list = map.get(half.date) ?? []
    list.push(half)
    map.set(half.date, list)
  }
  return map
})

/**
 * Empties one row. Emptying the upper row of a day takes the lower one with it
 * because the lower row is not reachable without it.
 */
export function clearRow(entry: HalfDay): void {
  entry.workdayId = null
  entry.specification = null
  entry.specificationIsDefault = false
  entry.days = null
  entry.location = null
  entry.tasks = null
  if (entry.half !== 0) return
  const lower = (rowsByDate.value.get(entry.date) ?? [])[1]
  if (lower && lower.workdayId !== null) clearRow(lower)
}

/**
 * Books a cost centre on the first row that can take it.
 *
 * Working days come first and a non-working day is only reached once they are
 * all taken. The upper row of a day is filled before its lower one because the
 * lower one is not on show until then.
 */
export function bookNextFree(workdayId: string, specification: string | null): string | null {
  const rows = rowsByDate.value
  for (const pass of [0, 1]) {
    for (const day of calendar.value) {
      if (pass === 0 && day.nonWorking) continue
      if (pass === 1 && !day.nonWorking) continue
      const pair = rows.get(day.date) ?? []
      // A day holds one day of work so a full day is passed over even when its
      // lower row is empty. Splitting it would take half of what is booked.
      if (spareOfDay(pair) <= 0) continue
      const free = pair.find((row) => row.workdayId === null)
      if (!free) continue
      free.workdayId = workdayId
      free.specification = specification ?? defaultSpecificationFor(workdayId)
      free.specificationIsDefault = specification === null
      free.location = profile.location
      free.days = dayValueFor(pair, free)
      return day.date
    }
  }
  return null
}

export function clearMonth(): void {
  halfDays.value = emptyGrid(calendar.value)
}
