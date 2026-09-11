// The editor state. One month at a time for one user.
//
// The store is a module singleton so the month view and the quick fill and the
// summary all read the same grid.
//
// The month is written as it is edited. There is no Save button. Every edit is
// debounced then stored. The download stays the one deliberate act. The mirror
// in localStorage is written on every save even when the API is there so a
// dropped connection costs nothing.

import { computed, nextTick, reactive, ref, watch } from 'vue'

import { ApiError, api, usingApi, type StoredSheet } from '@/lib/api'
import { setLocale } from '@/i18n'

import type { HalfDay, LocaleCode, Timesheet, UserProfile } from '@tracker/core'
import { absenceTotal, aggregateByProject, catalogue, aggregateByWeek, buildMonth, dayValueFor, daysPastTarget, defaultSpecificationFor, emptyGrid, hasErrors, rowIsEmpty, spareOfDay, targetDays, totalDays, validate, workingDayCount } from '@tracker/core'

const HISTORY_MONTHS = 6
const PROFILE_KEY = 'timesheets.profile'
const SHEET_KEY = 'timesheets.sheet'

/**
 * How long an edit waits before it is written. Because a) a month is filled in
 * runs of several rows so a wide window collapses a run into one write. b) the
 * two flush points below cover a tab that closes inside the window. c) the
 * interval is one constant to change.
 */
/**
 * How long an edit waits before it is written.
 *
 * Exported so a test states the boundary rather than repeating the number. A
 * test that repeated it passed at exactly one interval and proved the opposite
 * of what it claimed.
 */
export const AUTOSAVE_MS = 1000

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
  locale: null,
  remindByEmail: true,
  hoursPerDay: null,
  jiraProjects: {},
  jiraTickets: {},
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

/**
 * The entity the chosen location implies. The location code opens with the
 * entity number so the two already carry the link. It is offered rather than
 * enforced because a secondment leaves them apart.
 */
export const suggestedEntity = computed<string | null>(() => {
  const code = profile.location
  if (!code) return null
  const number = code.split('_')[0]
  return catalogue.entities.find((e) => e.entity.startsWith(`${number}_`))?.entity ?? null
})

/* ---------- period ---------- */

const now = new Date()
export const year = ref(now.getUTCFullYear())
export const month = ref(now.getUTCMonth() + 1)

export const calendar = computed(() =>
  buildMonth(year.value, month.value, profile.location),
)

export const workingDays = computed(() => workingDayCount(calendar.value))

/** The `yyyy-mm` key the API stores a month under. */
export function periodOf(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

export const period = computed(() => periodOf(year.value, month.value))

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

/**
 * The working days the target does not reach. The grid shades them and
 * `bookNextFree` refuses them so a click cannot land on a day nobody asked for.
 */
export const pastTarget = computed(() => daysPastTarget(calendar.value, target.value))

/* ---------- grid ---------- */

export const halfDays = ref<HalfDay[]>(emptyGrid(calendar.value))

function sheetKey(y: number, m: number): string {
  return `${SHEET_KEY}.${periodOf(y, m)}`
}

/**
 * A month as it comes back off a store. The two times are what the API owns and
 * the domain type does not name. Both are optional because a mirror written
 * before they existed still has to read.
 */
export interface StoredMonth extends Timesheet {
  updatedAt?: string
  /** When the workbook was last downloaded. Null while the month is a draft. */
  exportedAt?: string | null
}

/* ---------- the save state ---------- */

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** What the period bar shows where the Save button stood. */
export const saveState = ref<SaveState>('idle')

/** When the last write landed. Null until one does. */
export const savedAt = ref<string | null>(null)

/** When the open month was last written. */
export const updatedAt = ref<string | null>(null)

/**
 * When the open month was last downloaded. It survives every write so the
 * monthly reminder stays muted once a month has been sent.
 */
export const exportedAt = ref<string | null>(null)

/**
 * The location the open month was stored against. Null for a month never saved.
 *
 * Held rather than dropped because the export is named for the month rather
 * than for the profile. A move to another office leaves every earlier month
 * named for the country it was worked in. `exportLocation` in core states the
 * rule and the API applies the same one.
 */
export const openLocation = ref<string | null>(null)

/**
 * How the open month stands against its download. A month edited after its
 * download reads as changed. Because a) the reminder is muted for that month so
 * it chases nothing. b) the download is the only act that files the month. c)
 * no third field is needed to see it.
 */
export const sentState = computed<'draft' | 'sent' | 'changed'>(() => {
  if (!exportedAt.value) return 'draft'
  return updatedAt.value !== null && updatedAt.value > exportedAt.value ? 'changed' : 'sent'
})

/* ---------- writing ---------- */

/** The open grid as one value. Copied so a later edit cannot alter a queued write. */
function currentSheet(): Timesheet {
  return {
    year: year.value,
    month: month.value,
    location: profile.location ?? '',
    halfDays: halfDays.value.map((half) => ({ ...half })),
    adjustedWorkDays: monthOverride.value,
  }
}

function isOpen(sheet: Timesheet): boolean {
  return sheet.year === year.value && sheet.month === month.value
}

function writeMirror(sheet: StoredMonth): void {
  localStorage.setItem(sheetKey(sheet.year, sheet.month), JSON.stringify(sheet))
  pruneHistory()
}

/**
 * Writes one month. The mirror goes first and it goes whether or not the API is
 * there. Because a) the month is filled over weeks so one dropped connection
 * must not cost a day of entry. b) a tab closing during the PUT keeps the edit.
 * c) the fallback path is the one `loadSheet` reads today.
 */
async function writeSheet(sheet: Timesheet): Promise<void> {
  const at = new Date().toISOString()
  writeMirror({ ...sheet, updatedAt: at, exportedAt: exportedAt.value })
  if (!usingApi) {
    if (isOpen(sheet)) updatedAt.value = at
    return
  }
  if (isOpen(sheet)) openLocation.value = sheet.location || null
  const stored = await api.putSheet(periodOf(sheet.year, sheet.month), {
    location: sheet.location,
    halfDays: sheet.halfDays,
    adjustedWorkDays: sheet.adjustedWorkDays,
  })
  // The API owns both times and the sent marker survives the write. So the
  // answer is read back rather than guessed from the browser clock.
  writeMirror({ ...sheet, updatedAt: stored.updatedAt, exportedAt: stored.exportedAt ?? null })
  if (isOpen(sheet)) {
    updatedAt.value = stored.updatedAt
    exportedAt.value = stored.exportedAt ?? null
  }
}

/** The write in flight. Null when nothing is being written. */
let inFlight: Promise<void> | null = null
/** One save queued behind it. A third edit replaces this rather than queueing. */
let trailing: Timesheet | null = null
/** The write that failed. What the retry button sends again. */
let lastFailure: Timesheet | null = null

/**
 * Runs the queued writes one after another. Two PUTs in flight can otherwise
 * land in the wrong order and the older one would win.
 */
async function drain(first: Timesheet): Promise<void> {
  try {
    let next: Timesheet | null = first
    while (next) {
      const sheet: Timesheet = next
      trailing = null
      saveState.value = 'saving'
      try {
        await writeSheet(sheet)
        lastFailure = null
        savedAt.value = new Date().toISOString()
        saveState.value = 'saved'
      } catch (error) {
        // The mirror already holds the edit so nothing is lost. The next edit
        // sends the whole month again which is the retry.
        lastFailure = sheet
        saveState.value = 'failed'
        console.error(error)
      }
      next = trailing
    }
  } finally {
    inFlight = null
  }
}

function queueWrite(sheet: Timesheet): Promise<void> {
  if (inFlight) {
    trailing = sheet
    return inFlight
  }
  inFlight = drain(sheet)
  return inFlight
}

/* ---------- the autosave ---------- */

/** The edit waiting out the interval. It carries the month it belongs to. */
let pendingWrite: Timesheet | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * How many loads are in flight. `openMonth` sets an empty grid then fills it
 * from the API and the deep watcher fires on both writes. Without this the
 * first would store an empty month over real data.
 */
let loads = 0

async function endLoad(): Promise<void> {
  // The watcher is queued rather than immediate so the tick is what lets the
  // writes of this load pass it before the guard is dropped.
  await nextTick()
  loads = Math.max(0, loads - 1)
}

/** Writes the pending edit at once rather than waiting out the interval. */
export async function flushSheet(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  const sheet = pendingWrite
  pendingWrite = null
  if (!sheet) return
  await queueWrite(sheet)
}

/** Sends the failed write again. A user who stops editing has no other way. */
export async function retrySave(): Promise<void> {
  if (pendingWrite) return flushSheet()
  if (!lastFailure) return
  await queueWrite(lastFailure)
}

// Every edit is stored. The snapshot is taken here rather than when the timer
// fires so a flush after the period moved still writes the month that was
// edited rather than the one now open.
watch(
  [halfDays, monthOverride],
  () => {
    if (loads > 0) return
    pendingWrite = currentSheet()
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => void flushSheet(), AUTOSAVE_MS)
  },
  { deep: true },
)

// A closed tab must not cost the last edit. The mirror is written before the
// PUT so the edit survives even when the tab goes before the answer.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSheet()
  })
}

/** Writes the month now and reloads the reference list. The manual flush. */
export async function saveSheet(): Promise<void> {
  pendingWrite = currentSheet()
  await flushSheet()
  await loadHistory()
}

export function loadSheet(y: number, m: number): StoredMonth | null {
  const raw = localStorage.getItem(sheetKey(y, m))
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredMonth
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

/** Puts a month on the screen. Null empties the grid. */
function applySheet(sheet: StoredMonth | null): void {
  halfDays.value = sheet ? sheet.halfDays : emptyGrid(calendar.value)
  monthOverride.value = sheet?.adjustedWorkDays ?? null
  updatedAt.value = sheet?.updatedAt ?? null
  exportedAt.value = sheet?.exportedAt ?? null
  openLocation.value = sheet?.location || null
}

/**
 * The API copy wins unless the mirror was written after it. A newer mirror
 * means a write never landed so it holds an edit the API never saw.
 */
function newer(mirror: StoredMonth | null, sheet: StoredSheet): StoredMonth {
  if (!mirror?.updatedAt) return sheet
  return mirror.updatedAt > sheet.updatedAt ? mirror : sheet
}

/** Rebuilds the grid for the current month keeping anything already saved. */
export function openMonth(y: number, m: number): void {
  loads++
  year.value = y
  month.value = m
  const mirror = loadSheet(y, m)
  if (!usingApi) {
    applySheet(mirror)
    void endLoad()
    return
  }
  applySheet(null)
  void api
    .getSheet(periodOf(y, m))
    .then((sheet) => {
      // A slow answer for a month the user has already left is dropped.
      if (period.value === periodOf(sheet.year, sheet.month)) applySheet(newer(mirror, sheet))
    })
    .catch((error: unknown) => {
      // A month that was never saved is not a fault. A mirror for one the API
      // does not hold is an edit whose write never landed.
      if (error instanceof ApiError && error.status === 404) {
        if (mirror && period.value === periodOf(y, m)) applySheet(mirror)
        return
      }
      console.error(error)
    })
    .finally(() => void endLoad())
}

/**
 * Reads the sent marker back after a download. The export writes it on the
 * server so the browser has no other way to see it.
 */
export async function refreshSentState(): Promise<void> {
  if (!usingApi) return
  try {
    const sheet = await api.getSheet(period.value)
    if (period.value !== periodOf(sheet.year, sheet.month)) return
    updatedAt.value = sheet.updatedAt
    exportedAt.value = sheet.exportedAt ?? null
  } catch (error) {
    // The download already succeeded. A failed read only leaves the marker
    // stale until the month is opened again.
    console.error(error)
  }
}

/** Reads the profile the API holds. Cognito owns the name and the email. */
export async function loadProfileFromApi(): Promise<void> {
  if (!usingApi) return
  Object.assign(profile, await api.getProfile())
  // The stored answer wins over whatever the browser was guessed to prefer. It
  // is the same answer the monthly reminder is written in.
  if (profile.locale) await setLocale(profile.locale)
}

/**
 * Switches the language and remembers the choice. The reminder is written by
 * the API so the answer has to reach the profile rather than the browser alone.
 */
export async function chooseLocale(code: LocaleCode): Promise<void> {
  profile.locale = code
  await setLocale(code)
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

// A change of month or location rebuilds the calendar so the grid follows. The
// pending edit is written first because the rebuild would otherwise lose it.
// The snapshot carries its own month so writing it after the period moved is
// still the month that was edited.
watch([year, month], ([y, m]) => {
  void flushSheet()
  openMonth(y, m)
})
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

/** How many cost centres the reference list beside the grid holds. */
const LIST_LENGTH = 12

/** Months over which a booked day gives up half its weight in the order. */
const HALF_LIFE_MONTHS = 2

export interface CostCentreUse {
  workdayId: string
  specification: string | null
  /** Days booked against it across everything read. */
  days: number
  /** How many months it appears in. */
  months: number
  lastUsed: string
  /** The days discounted by the age of the month each was booked in. */
  score: number
}

/**
 * What one day booked in the `YYYY-MM` period `key` is worth against the open
 * period. A month ahead of the open one is held at the full day because a user
 * reading back through the year still wants the codes they are on now.
 */
function weightOf(key: string, open: string): number {
  const index = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7))
  const age = Math.max(0, index(open) - index(key))
  return 0.5 ** (age / HALF_LIFE_MONTHS)
}

/**
 * The cost centres this user reaches for. A day booked in the open month counts
 * for a whole day and every HALF_LIFE_MONTHS back halves what a day is worth.
 * Because a) the code wanted next is usually the code booked last. b) a code
 * left months ago keeps its place while its days outweigh the newer ones. c) a
 * cut off by date would drop a code that comes round once a quarter.
 *
 * The open month counts too so a code picked a moment ago is already on the
 * list.
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
    const weight = weightOf(key, period.value)
    const inThisMonth = new Set<string>()
    for (const row of rows) {
      if (row.workdayId === null || row.days === null) continue
      const existing = seen.get(row.workdayId)
      if (existing) {
        existing.days += row.days
        existing.score += row.days * weight
        if (key > existing.lastUsed) existing.lastUsed = key
      } else {
        seen.set(row.workdayId, {
          workdayId: row.workdayId,
          specification: row.specification,
          days: row.days,
          months: 0,
          lastUsed: key,
          score: row.days * weight,
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
    .sort((a, b) => b.score - a.score || b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, LIST_LENGTH)
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
 * Empties one row and nothing else. What emptying a row on screen means to the
 * other half of the day is a rule of the editor rather than of the store.
 */
export function clearRow(entry: HalfDay): void {
  entry.workdayId = null
  entry.specification = null
  entry.specificationIsDefault = false
  entry.days = null
  entry.location = null
  entry.tasks = null
}

/**
 * Books a cost centre on the first row that can take it.
 *
 * Working days come first and a non-working day is only reached once they are
 * all taken. The upper row of a day is filled before its lower one because the
 * lower one is not on show until then.
 *
 * The target is the limit. Nothing is booked once the month has reached it.
 * Because a) the target is all the month asks for. b) a day booked past it is
 * one the user then has to find and delete.
 */
export function bookNextFree(workdayId: string, specification: string | null): string | null {
  const wanted = Math.round((target.value - booked.value) * 2) / 2
  if (wanted <= 0) return null
  const surplus = pastTarget.value
  const rows = rowsByDate.value
  for (const pass of [0, 1]) {
    for (const day of calendar.value) {
      if (pass === 0 && day.nonWorking) continue
      if (pass === 1 && !day.nonWorking) continue
      if (surplus.has(day.date)) continue
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
      // Half a day of the target left books half a day rather than a whole one.
      free.days = Math.min(dayValueFor(pair, free), wanted) as 0.5 | 1
      return day.date
    }
  }
  return null
}

/**
 * Empties every row of the open month.
 *
 * The target override is left where it is. Because a) it is a property of the
 * month and not an entry in it. b) a user who set 12 days for a part month
 * still wants 12 after emptying the rows. c) the period bar carries its own
 * reset beside the figure.
 */
export function clearMonth(): void {
  halfDays.value = emptyGrid(calendar.value)
}

/** True while the month holds nothing to clear. */
export const monthIsEmpty = computed(() => halfDays.value.every(rowIsEmpty))
