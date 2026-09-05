// Translations. The locations span eight languages so all eight ship.
//
// Month names and weekday names come from Intl rather than the catalogue.
// Because a) the browser already holds them for every locale. b) they change
// with the calendar and not with our wording. c) a hand written list drifts.

import { createI18n } from 'vue-i18n'

import en from './messages/en'
import de from './messages/de'
import fr from './messages/fr'
import es from './messages/es'
import cs from './messages/cs'
import hu from './messages/hu'
import ptBR from './messages/pt-BR'
import zhCN from './messages/zh-CN'

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'cs', label: 'Čeština' },
  { code: 'hu', label: 'Magyar' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'zh-CN', label: '中文' },
] as const

export type LocaleCode = (typeof LOCALES)[number]['code']

const STORAGE_KEY = 'timesheets.locale'

function initialLocale(): LocaleCode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && LOCALES.some((l) => l.code === saved)) return saved as LocaleCode
  const preferred = navigator.languages ?? [navigator.language]
  for (const tag of preferred) {
    const exact = LOCALES.find((l) => l.code.toLowerCase() === tag.toLowerCase())
    if (exact) return exact.code
    const base = tag.split('-')[0]?.toLowerCase()
    const partial = LOCALES.find((l) => l.code.split('-')[0]?.toLowerCase() === base)
    if (partial) return partial.code
  }
  return 'en'
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
