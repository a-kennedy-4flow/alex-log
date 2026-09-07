// Reads the shipped workbooks. The parser feeds both the admin upload and the
// fixture tool so a fault here would reach the product twice.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { NotATracker, readCatalogueFrom, toCatalogueInput } from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const workbooks = readdirSync(root).filter((f) => f.endsWith('.xlsm'))

it('found the workbooks to read', () => {
  expect(workbooks.length).toBeGreaterThan(0)
})

describe.each(workbooks)('%s', (name) => {
  const parsed = readCatalogueFrom(new Uint8Array(readFileSync(join(root, name))))

  it('reads every location', () => {
    expect(parsed.locations).toHaveLength(22)
    expect(parsed.locations[0]).toMatchObject({ code: '01_DE_Berlin', countryCode: 'DE' })
  })

  it('reads a holiday list for every location', () => {
    expect(Object.keys(parsed.holidays)).toHaveLength(22)
    for (const [location, dates] of Object.entries(parsed.holidays)) {
      expect(dates.length, location).toBeGreaterThan(0)
      expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('reads the project list', () => {
    expect(parsed.projects.length).toBeGreaterThan(2000)
    for (const project of parsed.projects.slice(0, 50)) {
      expect(typeof project.workdayId).toBe('string')
      expect(project.specRange).toMatch(/^spec_/)
    }
  })

  it('reports the ranges the workbook leaves broken', () => {
    expect(parsed.brokenSpecRanges.map((r) => r.name)).toContain('spec_CorporateServices_cc')
  })

  it('reads the two absence types and the two time values', () => {
    expect(parsed.absenceTypes.map((a) => a.label)).toEqual([
      'Vacation or sickness',
      'Other absence',
    ])
    expect(parsed.timeValues).toEqual([0.5, 1])
  })

  it('counts the business lines it found', () => {
    const total = parsed.businessLines.reduce((sum, b) => sum + b.count, 0)
    const withLine = parsed.projects.filter((p) => p.businessLine !== null).length
    expect(total).toBe(withLine)
  })

  it('records when the project list was cut', () => {
    expect(parsed.source.projectListUpdated).toMatch(/last update/)
  })

  // The admin page sent the parser output untouched until this converter
  // existed so a deployed catalogue held a shape its own type forbids.
  it('converts to the shape the API stores', () => {
    const input = toCatalogueInput(parsed, name)
    expect(input.source?.workbook).toBe(name)
    expect(input.source?.projectListUpdated).toBe(parsed.source.projectListUpdated)
    expect(input.brokenSpecRanges).toContain('spec_CorporateServices_cc')
    for (const range of input.brokenSpecRanges ?? []) {
      expect(typeof range, JSON.stringify(range)).toBe('string')
    }
    expect(input.projects).toHaveLength(parsed.projects.length)
    expect(input.absenceTypes).toHaveLength(parsed.absenceTypes.length)
  })
})

describe('refusing something that is not a tracker', () => {
  it('rejects bytes that are not a spreadsheet', () => {
    expect(() => readCatalogueFrom(new TextEncoder().encode('hello'))).toThrow(NotATracker)
  })

  it('rejects an empty file', () => {
    expect(() => readCatalogueFrom(new Uint8Array())).toThrow(NotATracker)
  })
})
