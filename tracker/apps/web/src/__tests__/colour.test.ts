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
    '#faf7f5', // a day the tracker does not ask for
    '#c9bfb7', // a dashed edge
    '#7e93a1', // a label on the Smart Blue band
    '#b7c6d0', // body on the Smart Blue band
    '#ff6a2e', // the primary button under the pointer
    '#fff6f2', // the cell being edited
    '#eef2f5', // the weekend
    '#daecff', // Monday
    '#ffdccd', // Tuesday
    '#ffebfd', // Thursday
    '#dee3e6', // Friday
  ].map((hex) => hex.toLowerCase()),
)

/** The weekdays that declare a wash. Wednesday is the sheet so it declares none. */
const WASHED = [1, 2, 4, 5] as const

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

function lab(hex: string): [number, number, number] {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  const [r, g, b] = [0, 2, 4].map((at) => channel(parseInt(full.slice(at, at + 2), 16))) as [
    number,
    number,
    number,
  ]
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/**
 * Distance in CIE Lab. `tokens.css` defines the measure for the project.
 *
 * Contrast answers whether text on a ground can be read. It does not answer
 * whether two grounds can be told apart. Two greys a pixel apart both reach 13
 * to 1 under Smart Blue and are one colour to the eye.
 */
export function deltaE(a: string, b: string): number {
  const [la, aa, ba] = lab(a)
  const [lb, ab, bb] = lab(b)
  return Math.round(Math.hypot(la - lb, aa - ab, ba - bb) * 100) / 100
}

/**
 * Distance from grey in Lab. A ground under about 3 is a shade of the sheet and
 * not a colour on it.
 */
export function chroma(hex: string): number {
  const [, a, b] = lab(hex)
  return Math.round(Math.hypot(a as number, b as number) * 100) / 100
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
    const match = line.match(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/)
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
    ['Smart Blue on a day the tracker does not ask for', smart, p['--tint'] as string],
    ['Smart Blue on the open cell', smart, p['--open'] as string],
    ['Smart Blue on the weekend', smart, p['--weekend'] as string],
    ['Smart Blue on the button under the pointer', smart, p['--orange-hover'] as string],
    ['white on the download band', white, smart],
    ['the label on the download band', p['--on-blue-label'] as string, smart],
    ['the body on the download band', p['--on-blue-body'] as string, smart],
    ['a column header', p['--grey'] as string, white],
    ['Smart Blue on Monday', smart, p['--dow-1'] as string],
    ['Smart Blue on Tuesday', smart, p['--dow-2'] as string],
    ['Smart Blue on Thursday', smart, p['--dow-4'] as string],
    ['Smart Blue on Friday', smart, p['--dow-5'] as string],
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
    // The weekday wash is the newest ground Grey cannot sit on. A day cell
    // that still wrote Grey would read at about 4.05 to 1. Wednesday is absent
    // because Wednesday is the sheet and Grey holds on the sheet.
    for (const day of WASHED) {
      expect(contrast(p['--grey'] as string, p[`--dow-${day}`] as string)).toBeLessThan(4.5)
    }
  })
})

/*
 * The week has to be read as five days. The guided day picker is the one screen
 * that reads it that way.
 *
 * Contrast is the wrong measure here and it is the one that let two greys a
 * pixel apart through. Both cleared 13 to 1 under Smart Blue and neither could
 * be told from the other. Distance in Lab is what says two grounds differ.
 */
describe('the weekday wash', () => {
  const p = tokens()
  /* Wednesday is the sheet so it declares no wash of its own. */
  const WASH = WASHED.map((day) => [`dow-${day}`, p[`--dow-${day}`] as string] as const)
  const WEEK = [
    ['mon', p['--dow-1'] as string],
    ['tue', p['--dow-2'] as string],
    ['wed', p['--white'] as string],
    ['thu', p['--dow-4'] as string],
    ['fri', p['--dow-5'] as string],
  ] as const

  const PAIRS = WEEK.flatMap((a, at) =>
    WEEK.slice(at + 1).map((b) => [`${a[0]} and ${b[0]}`, a[1], b[1]] as const),
  )

  it.each(PAIRS)('tells %s apart', (_name, a, b) => {
    expect(deltaE(a, b)).toBeGreaterThanOrEqual(9)
  })

  it.each([0, 1, 2, 3])('tells day %i from the one beside it', (at) => {
    // Neighbours are what a reader compares so they are held further apart.
    expect(deltaE(WEEK[at]![1], WEEK[at + 1]![1])).toBeGreaterThanOrEqual(12)
  })

  /*
   * A wash has to clear every other ground the same button can take.
   *
   * The weekend of the picker takes the tint and Warm Grey is what every
   * control on that page sits on. Wednesday is left out because Wednesday is
   * white and white is one of them.
   */
  const GROUNDS = ['--warm-grey', '--tint', '--white'] as const

  it.each(WASH)('holds %s clear of every other ground', (_name, wash) => {
    for (const ground of GROUNDS) {
      expect(deltaE(wash, p[ground] as string), ground).toBeGreaterThanOrEqual(6)
    }
  })

  it('keeps the weekend on the tint it already had', () => {
    // Friday sits beside it so the two still have to differ.
    expect(deltaE(p['--dow-5'] as string, p['--tint'] as string)).toBeGreaterThanOrEqual(6)
  })
})

/*
 * The shading of a day in the month view.
 *
 * A day carries no colour of its own. The sheet is a day the tracker asks for.
 * The tint is a day it does not ask for and the weekend holds the shade above
 * that. Every figure below was worked out once and nothing else holds it.
 */
describe('the shading of a day', () => {
  const p = tokens()
  const white = p['--white'] as string
  const tint = p['--tint'] as string
  const weekend = p['--weekend'] as string

  it('shades the day rather than colouring it', () => {
    expect(chroma(tint)).toBeLessThanOrEqual(3)
    expect(chroma(weekend)).toBeLessThanOrEqual(3)
  })

  it('reads the weekend against the sheet', () => {
    expect(deltaE(weekend, white)).toBeGreaterThanOrEqual(5)
  })

  it('holds a day nobody has to fill at the slighter shade', () => {
    // Slight on purpose. Two grounds under about 3 read as one so this sits on
    // the boundary rather than competing with the weekend.
    expect(deltaE(tint, white)).toBeGreaterThanOrEqual(2.9)
    expect(deltaE(tint, white)).toBeLessThan(deltaE(weekend, white))
  })

  it('tells the two shades apart', () => {
    expect(deltaE(tint, weekend)).toBeGreaterThanOrEqual(3)
  })

  it('leaves Warm Grey reading on both', () => {
    // A select in the grid and a chip in the board are Warm Grey and both sit
    // on a shaded day.
    for (const shade of [tint, weekend]) {
      expect(deltaE(shade, p['--warm-grey'] as string), shade).toBeGreaterThanOrEqual(6)
    }
  })
})
