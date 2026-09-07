// The languages the application ships.
//
// The list lives in the domain rather than in the frontend. Because a) the
// browser renders the interface in one of them. b) the monthly reminder is
// written in one of them by the Lambda. c) two copies of the list would drift
// and a reminder would then be sent in a language the interface cannot show.

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

export const DEFAULT_LOCALE: LocaleCode = 'en'

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && LOCALES.some((entry) => entry.code === value)
}

/**
 * The shipped locale closest to a language tag. `de-AT` resolves to `de`.
 * Returns null so a caller can tell a miss from a deliberate English.
 */
export function matchLocale(tag: string): LocaleCode | null {
  const wanted = tag.toLowerCase()
  const exact = LOCALES.find((entry) => entry.code.toLowerCase() === wanted)
  if (exact) return exact.code
  const base = wanted.split('-')[0]
  const partial = LOCALES.find((entry) => entry.code.toLowerCase().split('-')[0] === base)
  return partial?.code ?? null
}
