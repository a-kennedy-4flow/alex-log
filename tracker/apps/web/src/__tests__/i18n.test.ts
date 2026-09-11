// The seven translated catalogues against the English one.
//
// The `Messages` type already holds every locale to the same keys so nothing
// here repeats that. What it cannot see is a key left in English. A copied
// sentence typechecks and reads as a finished translation until somebody who
// speaks the language opens the page.

import { describe, expect, it } from 'vitest'

import en from '@/i18n/messages/en'
import cs from '@/i18n/messages/cs'
import de from '@/i18n/messages/de'
import es from '@/i18n/messages/es'
import fr from '@/i18n/messages/fr'
import hu from '@/i18n/messages/hu'
import ptBR from '@/i18n/messages/pt-BR'
import zhCN from '@/i18n/messages/zh-CN'

const CATALOGUES = { cs, de, es, fr, hu, 'pt-BR': ptBR, 'zh-CN': zhCN }

/**
 * Keys a locale is allowed to hold the English of.
 *
 * A product name is the same in every language. Anything else added here is a
 * decision and not an oversight.
 */
const SHARED = new Set(['app.title'])

/**
 * Below this many characters a match is a real word rather than a copy. `fr`
 * writes `Validation` exactly as English does and `de` writes `Jira`.
 */
const SHORTEST = 13

function flatten(value: object, prefix = '', into = new Map<string, string>()) {
  for (const [key, held] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof held === 'object' && held !== null) flatten(held as object, path, into)
    else into.set(path, String(held))
  }
  return into
}

const english = flatten(en)

describe.each(Object.entries(CATALOGUES))('%s', (name, catalogue) => {
  const theirs = flatten(catalogue)

  it('carries the same keys as the English catalogue', () => {
    // The type holds this. Asserted anyway because a locale loaded at runtime
    // is read through an index and not through the type.
    expect([...theirs.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('leaves no sentence in English', () => {
    const copied = [...english]
      .filter(([key, text]) => !SHARED.has(key) && text.length >= SHORTEST)
      .filter(([key, text]) => theirs.get(key) === text)
      .map(([key]) => key)
    expect(copied, `${name} repeats the English of these keys`).toEqual([])
  })

  it('keeps every placeholder the English names', () => {
    // A dropped `{count}` reads as a finished sentence and prints nothing.
    const names = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const [key, text] of english) {
      const want = names(text)
      if (want.length === 0) continue
      expect(names(theirs.get(key) ?? ''), `${name} ${key}`).toEqual(want)
    }
  })
})
