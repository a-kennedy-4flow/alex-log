// The cost centre picker ordering. The user business line leads so their own
// cost centres are the first thing they see.

import { describe, expect, it } from 'vitest'
import { loadCatalogue } from '@timesheets/fixtures'

import {
  allSpecifications,
  catalogue,
  defaultSpecificationFor,
  isAbsence,
  searchProjects,
  buildMonth,
  hasErrors,
  setCatalogue,
  specificationIsRequired,
  specificationsFor,
  targetDays,
  validate,
} from '../index'

setCatalogue(await loadCatalogue())
const businessLines = catalogue.businessLines

describe('the business line list', () => {
  it('holds the five lines the project list uses', () => {
    expect([...businessLines.map((b) => b.name)].sort()).toEqual([
      'Corporate Services',
      'consulting',
      'management',
      'research',
      'software',
    ])
  })

  it('lists the busiest line first', () => {
    const counts = businessLines.map((b) => b.count)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('strips the spaces the way the tracker does', () => {
    expect(businessLines.find((b) => b.name === 'Corporate Services')?.key).toBe('CorporateServices')
  })

  it('counts every project row that carries a line', () => {
    // Derived rather than fixed. A newer project list changes the totals and
    // the ordering rule does not.
    const total = businessLines.reduce((sum, b) => sum + b.count, 0)
    const withLine = catalogue.projects.filter((p) => p.businessLine !== null).length
    expect(total).toBe(withLine)
  })
})

describe('ordering by the chosen business line', () => {
  it('puts the chosen line ahead of every other line', () => {
    // research is the smallest line so the boundary falls inside this page.
    const smallest = [...businessLines].sort((a, b) => a.count - b.count)[0]!
    const results = searchProjects('', 200, smallest.name)
    const lines = results.filter((p) => !isAbsence(p.workdayId)).map((p) => p.businessLine)
    const firstOther = lines.findIndex((l) => l !== smallest.name)
    expect(firstOther).toBe(smallest.count)
    expect(lines.slice(0, firstOther).every((l) => l === smallest.name)).toBe(true)
    expect(lines.slice(firstOther).every((l) => l !== smallest.name)).toBe(true)
  })

  it('fills the whole page from the chosen line when that line is large enough', () => {
    // software holds 666 rows so nothing else reaches a page of 200.
    const results = searchProjects('', 200, 'software').filter((p) => !isAbsence(p.workdayId))
    expect(results.every((p) => p.businessLine === 'software')).toBe(true)
  })

  it('keeps the two absences at the very top', () => {
    const results = searchProjects('', 20, 'software')
    expect(isAbsence(results[0]?.workdayId ?? '')).toBe(true)
    expect(isAbsence(results[1]?.workdayId ?? '')).toBe(true)
    expect(isAbsence(results[2]?.workdayId ?? '')).toBe(false)
  })

  it('surfaces a match from the chosen line that sits deep in the list', () => {
    // Without a full scan a research row would never reach the first page.
    const results = searchProjects('', 10, 'research')
    const research = results.filter((p) => p.businessLine === 'research')
    expect(research.length).toBeGreaterThan(0)
  })

  it('leaves the order alone when no line is chosen', () => {
    const withNone = searchProjects('', 50, null).map((p) => p.workdayId)
    const withUnknown = searchProjects('', 50, 'nothing matches this').map((p) => p.workdayId)
    expect(withNone).toEqual(withUnknown)
  })

  it('still filters on the query', () => {
    const results = searchProjects('vista', 50, 'software')
    expect(results.length).toBeGreaterThan(0)
    for (const project of results) {
      const haystack =
        `${project.workdayId} ${project.workdayTitle ?? ''} ${project.customer ?? ''} ` +
        `${project.projectTitle ?? ''} ${project.costCentre ?? ''}`
      expect(haystack.toLowerCase()).toContain('vista')
    }
  })

  it('ranks the chosen line first inside a filtered result', () => {
    const results = searchProjects('4flow', 200, 'management').filter(
      (p) => !isAbsence(p.workdayId),
    )
    const firstOther = results.findIndex((p) => p.businessLine !== 'management')
    if (firstOther > 0) {
      expect(results.slice(0, firstOther).every((p) => p.businessLine === 'management')).toBe(true)
    }
    expect(results.length).toBeGreaterThan(0)
  })

  it('never returns more than the limit', () => {
    expect(searchProjects('', 7, 'consulting')).toHaveLength(7)
  })
})

describe('typing an id', () => {
  it('puts an exact id first', () => {
    expect(searchProjects('24112', 10)[0]?.workdayId).toBe('24112')
  })

  it('reaches the ids that start with what was typed before any other match', () => {
    // `18249` and `20249` both hold 24 somewhere. `24112` starts with it.
    const results = searchProjects('24', 20)
    const prefixed = results.filter((p) => p.workdayId.startsWith('24'))
    expect(prefixed.length).toBeGreaterThan(0)
    const firstOther = results.findIndex((p) => !p.workdayId.startsWith('24'))
    if (firstOther !== -1) expect(firstOther).toBe(prefixed.length)
    expect(results[0]?.workdayId.startsWith('24')).toBe(true)
  })

  it('narrows on every further character', () => {
    const widths = ['2', '24', '241', '2411'].map((q) => searchProjects(q, 5000).length)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!, `"${'2411'.slice(0, i + 1)}"`).toBeLessThanOrEqual(widths[i - 1]!)
    }
  })

  it('still finds a cost centre by its name', () => {
    const results = searchProjects('Alumni', 10)
    expect(results[0]?.workdayTitle).toContain('Alumni')
  })

  it('finds an absence by typing its name', () => {
    expect(searchProjects('vacation', 5)[0]?.workdayId).toBe('Vacation or sickness')
  })

  it('does not lead with an absence once a query rules it out', () => {
    expect(isAbsence(searchProjects('24', 5)[0]?.workdayId ?? '')).toBe(false)
  })

  it('prefers the user own business line only when the rank ties', () => {
    // An exact id wins even when it belongs to another line.
    const exact = searchProjects('24112', 10, 'consulting')[0]
    expect(exact?.workdayId).toBe('24112')
    expect(exact?.businessLine).toBe('software')
  })
})

describe('duplicate rows', () => {
  it('offers a workday id once', () => {
    const ids = catalogue.projects.map((p) => p.workdayId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reports how many repeats were dropped', () => {
    expect(catalogue.duplicateProjectRows).toBeGreaterThan(0)
  })

  it('keeps the first row the way the tracker lookup does', () => {
    // 12000 appears twice and differs only in the cost centre number.
    expect(catalogue.projects.find((p) => p.workdayId === '12000')?.costCentre).toBe('99982000')
  })
})

/** The workbook leaves the list of this one empty. 44 rows are like it. */
const noList = catalogue.projects.find(
  (p) => p.businessLine === 'Corporate Services' && p.objectKey === 'cc',
)

describe('the default specification', () => {
  it('is the first the cost centre allows', () => {
    const options = specificationsFor('24112').options
    expect(defaultSpecificationFor('24112')).toBe(options[0])
  })

  it('is a value the validation accepts', () => {
    const value = defaultSpecificationFor('24112')
    expect(specificationsFor('24112').options).toContain(value)
  })

  it('forces the absence specification for an absence', () => {
    expect(defaultSpecificationFor('Vacation or sickness')).toBe('4s_Overheads_Absence')
  })

  it('is nothing when no cost centre is chosen', () => {
    expect(defaultSpecificationFor(null)).toBeNull()
  })

  it('fills in nothing for a cost centre with no list of its own', () => {
    // Offering the first of every specification there is would be a guess.
    expect(defaultSpecificationFor(noList!.workdayId)).toBeNull()
  })
})

describe('a cost centre with no list of its own', () => {
  it('is found in the shipped project list', () => {
    expect(noList, 'no cost centre with a missing list to test against').toBeDefined()
    expect(specificationsFor(noList!.workdayId).hasOwnList).toBe(false)
  })

  it('still offers every specification there is', () => {
    const spec = specificationsFor(noList!.workdayId)
    expect(spec.options).toEqual(allSpecifications())
    expect(spec.options.length).toBeGreaterThan(10)
  })

  it('does not demand one', () => {
    expect(specificationIsRequired(noList!.workdayId)).toBe(false)
  })

  it('leaves a blank row complete', () => {
    const days = buildMonth(2026, 4, '01_DE_Berlin')
    const issues = validate({
      halfDays: [
        {
          date: days[0]!.date,
          half: 0,
          workdayId: noList!.workdayId,
          specification: null,
          specificationIsDefault: false,
          days: 1,
          location: null,
          tasks: null,
        },
      ],
      days,
      target: 1,
      location: '01_DE_Berlin',
      entity: '02_GmbH',
    })
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('says so once a value is chosen off the full list', () => {
    const days = buildMonth(2026, 4, '01_DE_Berlin')
    const issues = validate({
      halfDays: [
        {
          date: days[0]!.date,
          half: 0,
          workdayId: noList!.workdayId,
          specification: allSpecifications()[0] ?? null,
          specificationIsDefault: false,
          days: 1,
          location: null,
          tasks: null,
        },
      ],
      days,
      target: 1,
      location: '01_DE_Berlin',
      entity: '02_GmbH',
    })
    expect(issues.map((i) => i.code)).toContain('specificationUnverified')
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('a cost centre that names its own list', () => {
  it('demands one and starts on the first', () => {
    expect(specificationIsRequired('24112')).toBe(true)
    expect(defaultSpecificationFor('24112')).toBe(specificationsFor('24112').options[0])
  })

  it('calls a blank row incomplete', () => {
    const days = buildMonth(2026, 4, '01_DE_Berlin')
    const issues = validate({
      halfDays: [
        {
          date: days[0]!.date,
          half: 0,
          workdayId: '24112',
          specification: null,
          specificationIsDefault: false,
          days: 1,
          location: null,
          tasks: null,
        },
      ],
      days,
      target: 1,
      location: '01_DE_Berlin',
      entity: '02_GmbH',
    })
    expect(issues.map((i) => i.code)).toContain('incompleteEntries')
  })
})

describe('the monthly target', () => {
  it('is the full month when nothing is set', () => {
    expect(targetDays(21, null, null)).toBe(21)
  })

  it('takes the contract share of the working days', () => {
    expect(targetDays(20, 80, null)).toBe(16)
    expect(targetDays(21, 50, null)).toBe(10.5)
  })

  it('rounds a share onto a half day because column K allows nothing finer', () => {
    expect(targetDays(21, 80, null)).toBe(17)
    expect(targetDays(23, 30, null)).toBe(7)
  })

  it('lets one month override the contract', () => {
    expect(targetDays(21, 80, 12)).toBe(12)
  })

  it('lets a month override reach zero', () => {
    expect(targetDays(21, 80, 0)).toBe(0)
  })

  it('reproduces the August sheet', () => {
    // 21 working days and cell B8 holding 17.
    expect(targetDays(21, null, 17)).toBe(17)
  })
})

describe('the settings a month needs', () => {
  const days = buildMonth(2026, 4, '01_DE_Berlin')

  function check(extra: object) {
    return validate({ halfDays: [], days, target: 0, ...extra })
  }

  it('reports a missing office as an error', () => {
    const issue = check({ location: null }).find((i) => i.code === 'locationMissing')
    expect(issue?.severity).toBe('error')
  })

  it('reports an empty office as an error too', () => {
    expect(check({ location: '' }).some((i) => i.code === 'locationMissing')).toBe(true)
  })

  it('says nothing once the office is set', () => {
    expect(check({ location: '01_DE_Berlin' }).some((i) => i.code === 'locationMissing')).toBe(
      false,
    )
  })

  it('reports a missing entity as a warning rather than an error', () => {
    const issue = check({ location: '01_DE_Berlin', entity: null }).find(
      (i) => i.code === 'entityMissing',
    )
    expect(issue?.severity).toBe('warning')
  })

  it('says nothing when neither is passed', () => {
    // The export path passes them. A caller that does not is not accused.
    const codes = check({}).map((i) => i.code)
    expect(codes).not.toContain('locationMissing')
    expect(codes).not.toContain('entityMissing')
  })

  it('blocks a month that is otherwise complete', () => {
    const complete = buildMonth(2026, 4, '01_DE_Berlin')
    const issues = validate({ halfDays: [], days: complete, target: 0, location: null })
    expect(hasErrors(issues)).toBe(true)
  })
})
