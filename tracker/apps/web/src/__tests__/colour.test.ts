// The colour check.
//
// Because a) the palette is the first rule a stylesheet drifts from. b) every
// ratio below was worked out once and nothing else holds it. c) a check runs on
// each commit where a review does not.
//
// Two rules. A hex may only be a value `tokens.css` declares. A pair named in
// the palette comment may not drop below its ratio.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const TOKENS = join(ROOT, 'src/styles/tokens.css')

/**
 * Every colour the theme allows. Six from the deck plus white plus the shades
 * each of which has a job no theme colour can take. Adding one is a decision so
 * it is written here as well as in `tokens.css`.
 */
const THEME = new Set(
  [
    '#00263c', // Smart Blue
    '#eee6e0', // Warm Grey
    '#ff4d06', // Vibrant Orange
    '#007eff', // Bright Blue
    '#ffa0f5', // Bold Pink
    '#757575', // Grey
    '#ffffff', // white
    '#faf7f5', // a non-working day
    '#c9bfb7', // a dashed edge
    '#7e93a1', // a label on the Smart Blue band
    '#b7c6d0', // body on the Smart Blue band
    '#ff6a2e', // the primary button under the pointer
    '#fff6f2', // the cell being edited
    '#edf6ff', // a working day past the target
  ].map((hex) => hex.toLowerCase()),
)

const HEX = /#[0-9a-fA-F]{3,8}\b/g
const SCANNED = /\.(css|vue|ts|html|svg)$/

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return SCANNED.test(name) ? [path] : []
  })
}

/* ---------- contrast ---------- */

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  const [r, g, b] = [0, 2, 4].map((at) => channel(parseInt(full.slice(at, at + 2), 16)))
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number)
}

/** WCAG contrast. 1 is no difference and 21 is black on white. */
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100
}

/** The palette as `tokens.css` declares it. The test reads what ships. */
function tokens(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(TOKENS, 'utf8').split('\n')) {
    const match = line.match(/^\s*(--[a-z-]+):\s*(#[0-9a-fA-F]{3,8});/)
    if (match) out[match[1] as string] = (match[2] as string).toLowerCase()
  }
  return out
}

describe('the palette', () => {
  const palette = tokens()

  it('declares every theme colour and nothing else', () => {
    expect(Object.keys(palette).length).toBeGreaterThan(0)
    for (const [name, hex] of Object.entries(palette)) {
      expect(THEME.has(hex), `${name} is ${hex}`).toBe(true)
    }
  })

  it('is the only place a hex is written', () => {
    const offenders: string[] = []
    for (const path of [...filesUnder(join(ROOT, 'src')), ...filesUnder(join(ROOT, 'public')), join(ROOT, 'index.html')]) {
      for (const hex of readFileSync(path, 'utf8').match(HEX) ?? []) {
        if (!THEME.has(hex.toLowerCase())) offenders.push(`${relative(ROOT, path)} ${hex}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('contrast', () => {
  const p = tokens()
  const smart = p['--smart-blue'] as string
  const white = p['--white'] as string
  const warm = p['--warm-grey'] as string
  const orange = p['--orange'] as string

  /*
   * Body text needs 4.5 to 1. Large text and a line need 3 to 1. Each pair here
   * is one the interface actually draws.
   */
  const BODY: [string, string, string][] = [
    ['the primary button', smart, orange],
    ['Smart Blue on the sheet', smart, white],
    ['Smart Blue on the canvas', smart, warm],
    ['Smart Blue on a non-working day', smart, p['--tint'] as string],
    ['Smart Blue on the open cell', smart, p['--open'] as string],
    ['Smart Blue on a day past the target', smart, p['--past-target'] as string],
    ['Smart Blue on the button under the pointer', smart, p['--orange-hover'] as string],
    ['white on the download band', white, smart],
    ['the label on the download band', p['--on-blue-label'] as string, smart],
    ['the body on the download band', p['--on-blue-body'] as string, smart],
    ['a column header', p['--grey'] as string, white],
  ]

  const LARGE: [string, string, string][] = [
    ['the Bright Blue rule', p['--bright-blue'] as string, white],
    ['the booked figure when it misses', orange, white],
  ]

  it.each(BODY)('holds %s at 4.5 to 1', (_name, a, b) => {
    expect(contrast(a, b)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(LARGE)('holds %s at 3 to 1', (_name, a, b) => {
    expect(contrast(a, b)).toBeGreaterThanOrEqual(3)
  })

  it('keeps Grey off any ground but white', () => {
    // Decision 3. This is why every small heading sits on the sheet itself.
    expect(contrast(p['--grey'] as string, warm)).toBeLessThan(4.5)
  })
})
