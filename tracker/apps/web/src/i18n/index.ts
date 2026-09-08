// Translations. The locations span eight languages so all eight ship.
//
// Month names and weekday names come from Intl rather than the catalogue.
// Because a) the browser already holds them for every locale. b) they change
// with the calendar and not with our wording. c) a hand written list drifts.

import { createI18n } from 'vue-i18n'

import { DEFAULT_LOCALE, isLocale, matchLocale, type LocaleCode } from '@tracker/core'

import en from './messages/en'
import de from './messages/de'
import fr from './messages/fr'
import es from './messages/es'
import cs from './messages/cs'
import hu from './messages/hu'
import ptBR from './messages/pt-BR'
import zhCN from './messages/zh-CN'

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

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, de, fr, es, cs, hu, 'pt-BR': ptBR, 'zh-CN': zhCN },
})

export function setLocale(code: LocaleCode): void {
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
