// Translations. The locations span eight languages so all eight ship.
//
// Month names and weekday names come from Intl rather than the catalogue.
// Because a) the browser already holds them for every locale. b) they change
// with the calendar and not with our wording. c) a hand written list drifts.

import { createI18n } from 'vue-i18n'

import { DEFAULT_LOCALE, isLocale, matchLocale, type LocaleCode } from '@tracker/core'

import en from './messages/en'

// English stays in the entry because it is the fallback every other locale
// resolves against. The other seven load on their own.
const CATALOGUES: Record<string, () => Promise<{ default: typeof en }>> = {
  de: () => import('./messages/de'),
  fr: () => import('./messages/fr'),
  es: () => import('./messages/es'),
  cs: () => import('./messages/cs'),
  hu: () => import('./messages/hu'),
  'pt-BR': () => import('./messages/pt-BR'),
  'zh-CN': () => import('./messages/zh-CN'),
}

// The list is the domain one. The reminder is written in the same language the
// interface uses so a second copy here would let the two drift apart.
export { LOCALES, type LocaleCode } from '@tracker/core'

const STORAGE_KEY = 'timesheets.locale'

/**
 * What to show before the profile has been read. The saved answer wins over the
 * browser because the profile is what the reminder is written from.
 */
function initialLocale(): LocaleCode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (isLocale(saved)) return saved
  for (const tag of navigator.languages ?? [navigator.language]) {
    const match = matchLocale(tag)
    if (match) return match
  }
  return DEFAULT_LOCALE
}

// English alone at the start. The keys are typed off it so `t` still checks and
// the record is loose in its locale so a catalogue can be added at runtime.
const messages: Record<string, typeof en> = { en }

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages,
})

/** Fetches a catalogue the entry does not carry. Loaded ones are kept. */
export async function loadCatalogueFor(code: string): Promise<void> {
  const loader = CATALOGUES[code]
  if (!loader) return
  if (i18n.global.availableLocales.includes(code)) return
  i18n.global.setLocaleMessage(code, (await loader()).default)
}

export async function setLocale(code: LocaleCode): Promise<void> {
  await loadCatalogueFor(code)
  i18n.global.locale.value = code
  localStorage.setItem(STORAGE_KEY, code)
  document.documentElement.lang = code
}

/** Long month name in the active locale. */
export function monthName(locale: string, month: number): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  )
}

/** Short weekday name for an ISO date in the active locale. */
export function weekdayName(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

/** Day and month for an ISO date in the active locale. */
export function shortDate(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

/**
 * Clock time for an instant in the active locale. Read in the zone the browser
 * sits in because it is what the user just did rather than a date in the month.
 */
export function shortTime(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

/** Day and month and year for an instant in the active locale. */
export function longDate(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}
