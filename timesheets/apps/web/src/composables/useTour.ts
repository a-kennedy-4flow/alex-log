// The guided tour.
//
// Each page names its own steps and each step names the element it points at
// through a `data-tour` attribute. An attribute is used rather than a class
// because a class is there to be restyled and a rename would silently break the
// tour.
//
// A step whose element is not on the page is skipped rather than shown pointing
// at nothing. The download panel is absent for a user with no API so the tour
// has to tolerate that.

import { computed, ref } from 'vue'

export type TourPage = 'month' | 'quick' | 'settings' | 'admin'

export interface TourStep {
  /** Value of the `data-tour` attribute on the element to point at. */
  anchor: string
  /** Key under `tour.steps` in the translation catalogue. */
  key: string
}

const STEPS: Record<TourPage, TourStep[]> = {
  month: [
    { anchor: 'period', key: 'period' },
    { anchor: 'target', key: 'target' },
    { anchor: 'grid', key: 'grid' },
    { anchor: 'costCentre', key: 'costCentre' },
    { anchor: 'days', key: 'days' },
    { anchor: 'specification', key: 'specification' },
    { anchor: 'progress', key: 'progress' },
    { anchor: 'recent', key: 'recent' },
    { anchor: 'checks', key: 'checks' },
    { anchor: 'download', key: 'download' },
  ],
  quick: [
    { anchor: 'quickRows', key: 'quickRows' },
    { anchor: 'quickShare', key: 'quickShare' },
    { anchor: 'quickSpread', key: 'quickSpread' },
    { anchor: 'quickApply', key: 'quickApply' },
    { anchor: 'progress', key: 'progress' },
  ],
  settings: [
    { anchor: 'location', key: 'location' },
    { anchor: 'entity', key: 'entity' },
    { anchor: 'businessLine', key: 'businessLine' },
    { anchor: 'contract', key: 'contract' },
  ],
  admin: [
    { anchor: 'adminDrop', key: 'adminDrop' },
    { anchor: 'adminPreview', key: 'adminPreview' },
    { anchor: 'adminReplace', key: 'adminReplace' },
  ],
}

const SEEN_KEY = 'timesheets.tourSeen'

export const page = ref<TourPage>('month')
export const active = ref(false)
export const index = ref(0)

/**
 * The steps of the current run.
 *
 * Resolved once when the tour opens rather than derived on read. The list
 * depends on which elements are in the document and the document is not
 * reactive, so a computed would go stale without ever saying so.
 */
const resolved = ref<TourStep[]>([])

export const steps = computed<TourStep[]>(() => resolved.value)

export const step = computed<TourStep | null>(() => steps.value[index.value] ?? null)
export const isLast = computed(() => index.value >= steps.value.length - 1)

export function setPage(next: TourPage): void {
  if (page.value === next) return
  page.value = next
  // A tour running on one page has nothing to say about another.
  if (active.value) stop()
}

/** The steps of a page whose element is actually there to point at. */
function onPage(): TourStep[] {
  const all = STEPS[page.value]
  if (typeof document === 'undefined') return all
  return all.filter((step) => document.querySelector(`[data-tour="${step.anchor}"]`) !== null)
}

export function start(): void {
  index.value = 0
  resolved.value = onPage()
  active.value = resolved.value.length > 0
}

export function stop(): void {
  active.value = false
  resolved.value = []
  markSeen()
}

export function next(): void {
  if (isLast.value) {
    stop()
    return
  }
  index.value++
}

export function back(): void {
  if (index.value > 0) index.value--
}

export function goTo(at: number): void {
  if (at >= 0 && at < steps.value.length) index.value = at
}

/* ---------- shown once ---------- */

function seenPages(): TourPage[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as TourPage[]) : []
  } catch {
    return []
  }
}

function markSeen(): void {
  const seen = new Set(seenPages())
  seen.add(page.value)
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
}

export function hasSeen(which: TourPage = page.value): boolean {
  return seenPages().includes(which)
}

/**
 * Opens the tour the first time a page is reached and never again. The button
 * in the header is what brings it back.
 */
export function startUnlessSeen(): void {
  if (!hasSeen()) start()
}

/** Test hook. The record would otherwise leak from one test to the next. */
export function forgetSeen(): void {
  localStorage.removeItem(SEEN_KEY)
  active.value = false
  index.value = 0
  resolved.value = []
}
