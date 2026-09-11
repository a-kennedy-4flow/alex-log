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

describe('the month grid', () => {
  it('caps its height nowhere so the page draws the only scrollbar', () => {
    // A cap here put a second vertical scrollbar beside the one the page draws
    // and a month is 62 rows so both were always showing. jsdom lays nothing
    // out so the rule is read rather than measured.
    const grid = readFileSync(join(ROOT, 'src/components/MonthGrid.vue'), 'utf8')
    const styles = grid.slice(grid.indexOf('<style'))
    expect(styles).not.toMatch(/max-height/)
    // The horizontal axis stays. The nine columns hold more minimum width than
    // the box beside the aside has to give under about 1425px.
    expect(styles).toContain('overflow-x: auto')
  })

  it('takes the fixed layout so no cell can widen its own column', () => {
    // Under the automatic algorithm the cost centre trigger took 309px of a
    // 732px box and pushed the tasks column and the clear button out of sight.
    // A declared width is only a hint to that algorithm.
    const grid = readFileSync(join(ROOT, 'src/components/MonthGrid.vue'), 'utf8')
    const styles = grid.slice(grid.indexOf('<style'))
    expect(styles).toContain('table-layout: fixed')
  })

  it('leaves the four columns that grow at least 110px each when it scrolls', () => {
    // Five columns declare a width. The other four divide what is left so the
    // table `min-width` is what decides how narrow those four ever get. A sixth
    // declared width would take it out of them without this sum.
    const grid = readFileSync(join(ROOT, 'src/components/MonthGrid.vue'), 'utf8')
    const styles = grid.slice(grid.indexOf('<style'))
    const declared = [...styles.matchAll(/\.col-(\w+)\s*\{[^}]*?[^-]width:\s*(\d+)px/g)]
    expect(declared.map((match) => match[1]).sort()).toEqual([
      'act',
      'date',
      'day',
      'days',
      'week',
    ])
    const minWidth = Number(/min-width:\s*(\d+)px/.exec(styles)?.[1])
    const fixed = declared.reduce((sum, match) => sum + Number(match[2]), 0)
    expect((minWidth - fixed) / 4).toBeGreaterThanOrEqual(110)
  })

  it('pins the clear button to the right edge', () => {
    // The column is the first to leave the box on a narrow window. A user who
    // cannot reach it cannot empty a row.
    const grid = readFileSync(join(ROOT, 'src/components/MonthGrid.vue'), 'utf8')
    const styles = grid.slice(grid.indexOf('<style'))
    const rule = styles.slice(styles.indexOf('.col-act {'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/position: sticky[\s\S]*right: 0/)
  })
})

describe('the loading ring', () => {
  const ring = () => readFileSync(join(ROOT, 'src/components/LoadingRing.vue'), 'utf8')

  it('keeps the ring and drops only its turning under reduced motion', () => {
    // The pulse on the month progress goes altogether because motion is a
    // reward there. Here it says the wait is not a dead page so the ring has to
    // survive the rule that stops it turning.
    const styles = ring().slice(ring().indexOf('<style'))
    expect(styles).toMatch(/@keyframes turn/)
    const reduced = styles.slice(styles.indexOf('prefers-reduced-motion'))
    expect(reduced).toContain('.busy')
    expect(reduced).toContain('animation: none')
    expect(reduced).not.toMatch(/display:\s*none/)
  })

  it('is drawn in one file and never copied into a page', () => {
    // A second copy is a second reduced motion rule to keep in step. The pages
    // reach the ring through the component and its colours through
    // `--ring-arc`.
    const copies = filesUnder(join(ROOT, 'src'))
      .filter((path) => /\.(vue|css)$/.test(path))
      .filter((path) => !path.endsWith(join('components', 'LoadingRing.vue')))
      .filter((path) => readFileSync(path, 'utf8').includes('@keyframes turn'))
      .map((path) => relative(ROOT, path))
    expect(copies).toEqual([])
  })
})

describe('the credits roll', () => {
  const page = () => readFileSync(join(ROOT, 'src/pages/CreditsPage.vue'), 'utf8')

  it('drops every animation under reduced motion', () => {
    // Motion is the reward on this page so all of it goes. The loading ring
    // above keeps its element because there the motion is the information.
    const styles = page().slice(page().indexOf('<style'))
    const reduced = styles.slice(styles.indexOf('prefers-reduced-motion: reduce'))
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('.people li')
  })

  it('hides a name in the entrance and never in the rule', () => {
    // A name that were hidden by its own rule would be gone altogether once
    // the animation is dropped. The keyframes are what hold it back.
    const styles = page().slice(page().indexOf('<style'))
    expect(styles).toMatch(/@keyframes enter \{\s*from \{\s*opacity: 0;/)
    const roll = styles.slice(styles.indexOf('.roll {'), styles.indexOf('@keyframes'))
    expect(roll).not.toMatch(/opacity:\s*0\b/)
    expect(roll).not.toMatch(/visibility:\s*hidden/)
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

  it('carry the save state in the row above the month', () => {
    // A write is autosaved from either page so a failure has to be reportable
    // on both. The month page shares the row with the view switch and the quick
    // fill draws no view so it holds the row alone.
    for (const page of pages) {
      expect(page).toContain('<SaveState />')
      expect(page).toContain('<div class="month-bar">')
      expect(page).toContain('<div class="month sheet pad">')
      expect(page.indexOf('<div class="month-bar">')).toBeLessThan(page.indexOf('<aside>'))
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
  const picker = () => readFileSync(join(ROOT, 'src/components/CostCentrePicker.vue'), 'utf8')
  const panelRule = (text: string) =>
    text.slice(text.indexOf('.panel {'), text.indexOf(".panel input[type='search'] {"))

  it('is fixed to the viewport rather than to the cell it opens in', () => {
    // The month grid scrolls under `overflow: auto` and that clips an absolute
    // panel. jsdom lays out nothing so only the file shows this.
    const panel = panelRule(picker())
    expect(panel).toContain('position: fixed')
    expect(panel).toContain('max-height: var(--panel-room)')
  })

  it('opens on the edge the closed box sits on rather than under it', () => {
    // Fixed is how it is drawn. It has to read as that one box growing, so it
    // is anchored on the trigger own top edge and the trigger stops drawing
    // itself. Anchored underneath, a panel wide enough for a result row is
    // wider than a grid cell and leaves a step where the outlines meet.
    const text = picker()
    expect(text).toContain('top: downwards ? box.top : undefined')
    expect(text).toContain('bottom: downwards ? undefined : window.innerHeight - box.bottom')
    expect(text).not.toMatch(/const GAP\b/)

    const trigger = text.slice(text.indexOf('.trigger.open {'), text.indexOf('.placeholder {'))
    expect(trigger).toContain('visibility: hidden')

    // One box means one outline. A second radius or a dropped edge would be the
    // two drawing themselves separately again.
    const panel = panelRule(text)
    expect(panel).toContain('border: 1px solid var(--smart-blue)')
    expect(panel).toContain('border-radius: var(--radius)')
    expect(panel).not.toContain('border-top-width')
  })

  it('keeps the trigger space so the row does not move when it opens', () => {
    // `visibility` and not `display`. A trigger taken out of flow collapses the
    // cell and every row below it jumps.
    const text = picker()
    const trigger = text.slice(text.indexOf('.trigger.open {'), text.indexOf('.placeholder {'))
    expect(trigger).not.toContain('display: none')
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
