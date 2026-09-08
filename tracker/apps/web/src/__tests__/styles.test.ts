// Stylesheet invariants.
//
// A rule that only shows itself on screen cannot be caught by a mount test.
// jsdom applies no imported stylesheet so the file itself is read instead.
// `colour.test.ts` guards the palette the same way.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const TOKENS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

describe('a settings field', () => {
  it('takes its height from the row and from nowhere else', () => {
    // One number holds every control on the settings form to one box. A leaf
    // that set its own would be the field that reads a pixel taller.
    const row = readFileSync(join(ROOT, 'src/components/SettingRow.vue'), 'utf8')
    expect(row).toContain('--field-height')

    const offenders = filesUnder(join(ROOT, 'src/components'))
      .filter((path) => /Setting(?!Row)\w*\.vue$/.test(path))
      .filter((path) => /height:\s*\d+px/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path))
    expect(offenders).toEqual([])
  })
})

describe('a number field', () => {
  it('carries no spinner', () => {
    // The arrows a browser draws sit inside the right edge of the box. Every
    // number field here is right aligned so they land on top of the value.
    expect(TOKENS).toContain("input[type='number'] {\n  appearance: textfield;\n}")
    expect(TOKENS).toContain('::-webkit-inner-spin-button')
    expect(TOKENS).toContain('::-webkit-outer-spin-button')
  })

  it('is governed by that one rule and never by a component', () => {
    // The rule is on the element type so no component has to repeat it. One
    // that did would be a second place for it to drift.
    const offenders = filesUnder(join(ROOT, 'src'))
      .filter((path) => path.endsWith('.vue'))
      .filter((path) => readFileSync(path, 'utf8').includes('spin-button'))
      .map((path) => relative(ROOT, path))
    expect(offenders).toEqual([])
  })

  it('exists on the fields that need it', () => {
    const fields = filesUnder(join(ROOT, 'src'))
      .filter((path) => path.endsWith('.vue'))
      .filter((path) => readFileSync(path, 'utf8').includes('type="number"'))
      .map((path) => relative(ROOT, path).replace(/\\/g, '/'))
    // Named so a new number field is a deliberate addition to this list.
    expect(fields.sort()).toEqual([
      'src/components/PeriodBar.vue',
      'src/components/SettingNumber.vue',
      'src/components/SetupWizard.vue',
      'src/components/SimpleView.vue',
      'src/pages/JiraPage.vue',
    ])
  })
})

describe('the two editing pages', () => {
  const pages = ['src/pages/MonthPage.vue', 'src/pages/SimplePage.vue'].map((path) =>
    readFileSync(join(ROOT, path), 'utf8'),
  )

  it('declare no layout of their own', () => {
    // `.stack` and `.split` live in `tokens.css`. A page that redeclared one
    // is how the two drifted apart in the first place.
    for (const page of pages) {
      expect(page).not.toContain('<style')
    }
  })

  it('take the same shell in the same order', () => {
    for (const page of pages) {
      expect(page).toContain('<PageTitle />')
      expect(page).toContain('<div class="stack">')
      expect(page).toContain('<div class="split">')
      expect(page.indexOf('<PageTitle />')).toBeLessThan(page.indexOf('<div class="stack">'))
    }
  })

  it('put the same three sections in the aside', () => {
    for (const page of pages) {
      const aside = page.slice(page.indexOf('<aside>'), page.indexOf('</aside>'))
      expect(aside).toContain('<MonthProgress />')
      expect(aside).toContain('<RecentCostCentres />')
      expect(aside).toContain('<ValidationPanel />')
    }
  })

  it('close with the summary then the export', () => {
    for (const page of pages) {
      expect(page.indexOf('<SummaryPanel />')).toBeLessThan(page.indexOf('<ExportPanel />'))
    }
  })
})

describe('the cost centre panel', () => {
  it('is fixed to the viewport rather than to the cell it opens in', () => {
    // The month grid scrolls under `overflow: auto` and that clips an absolute
    // panel. jsdom lays out nothing so only the file shows this.
    const picker = readFileSync(join(ROOT, 'src/components/CostCentrePicker.vue'), 'utf8')
    const panel = picker.slice(picker.indexOf('.panel {'), picker.indexOf('.results {'))
    expect(panel).toContain('position: fixed')
    expect(panel).toContain('max-height: var(--panel-room)')
  })
})

describe('a section that stands alone', () => {
  it('carries the surface and its padding together', () => {
    // `.sheet` is the surface and `.pad` is what puts space inside it. One
    // without the other is a section whose text touches its own edge.
    const offenders = filesUnder(join(ROOT, 'src/components'))
      .filter((path) => path.endsWith('.vue'))
      .filter((path) => {
        const text = readFileSync(path, 'utf8')
        const root = text.slice(text.indexOf('<template>'), text.indexOf('\n', text.indexOf('<template>') + 20))
        return root.includes('sheet') && !root.includes('pad')
      })
      .map((path) => relative(ROOT, path))
    expect(offenders).toEqual([])
  })
})
