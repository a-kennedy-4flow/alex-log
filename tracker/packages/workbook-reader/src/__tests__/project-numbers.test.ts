// Reads the shipped 4s project numbers list and lays it over the tracker.
//
// The list names 462 projects the tracker leaves blank so the join it is read
// on is the whole value of the upload. A fault there would show as a picker
// full of bare numbers rather than as a crash.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  NotAnUpload,
  mergeProjectNumbers,
  readCatalogueFrom,
  readProjectNumbersFrom,
  readUploadFrom,
  toCatalogueInput,
} from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const files = readdirSync(root)
const listName = files.find((f) => /Projectnumbers/i.test(f))
const trackerName = files.find((f) => f.endsWith('.xlsm'))

const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(join(root, name)))

it('found both workbooks to read', () => {
  expect(listName).toBeDefined()
  expect(trackerName).toBeDefined()
})

describe('the 4s project numbers list', () => {
  const parsed = readProjectNumbersFrom(bytesOf(listName as string))

  it('reads a number once however many specifications it allows', () => {
    expect(parsed.rows).toBeGreaterThan(parsed.numbers.length)
    expect(new Set(parsed.numbers.map((n) => n.workdayId)).size).toBe(parsed.numbers.length)
    expect(parsed.numbers.length).toBeGreaterThan(700)
  })

  it('records the date the list was cut', () => {
    expect(parsed.source.listUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('names a customer for every customer project', () => {
    const projects = parsed.numbers.filter((n) => n.object === 'Project')
    expect(projects.length).toBeGreaterThan(700)
    for (const number of projects) {
      expect(number.workdayId, JSON.stringify(number)).toMatch(/^\d+$/)
      expect(number.customer, JSON.stringify(number)).not.toBeNull()
    }
  })

  // 270 of them carry a customer and no title. The picker falls back to the
  // customer so the row is still something a person recognises.
  it('leaves a title blank on some of them', () => {
    const projects = parsed.numbers.filter((n) => n.object === 'Project')
    const titled = projects.filter((n) => n.projectTitle !== null)
    expect(titled.length).toBeGreaterThan(400)
    expect(titled.length).toBeLessThan(projects.length)
  })

  it('offers only the three specifications of the software project range', () => {
    const offered = new Set(parsed.numbers.flatMap((n) => n.specifications))
    expect([...offered].sort()).toEqual([
      '4s_Change request',
      '4s_Customer project',
      '4s_Running fees',
    ])
  })

  it('reads the product sheet and the general sheet as cost centres', () => {
    const centres = parsed.numbers.filter((n) => n.object === 'Cost center')
    expect(centres.length).toBeGreaterThan(20)
    // Nothing on either sheet carries a specification column.
    for (const centre of centres) expect(centre.specifications).toEqual([])
  })
})

describe('laid over a tracker catalogue', () => {
  const tracker = readCatalogueFrom(bytesOf(trackerName as string))
  const current = toCatalogueInput(tracker, trackerName as string)
  const parsed = readProjectNumbersFrom(bytesOf(listName as string))

  it('names the projects the tracker leaves blank', () => {
    const { data, report } = mergeProjectNumbers(current, parsed, listName as string, false)
    expect(report.named).toBeGreaterThan(400)
    // The cost centres of the product sheet and the general sheet. The tracker
    // already titles those so the list changes nothing on them.
    expect(report.known).toBeGreaterThan(20)
    expect(report.absent).toBeGreaterThan(300)
    expect(report.named + report.known + report.absent).toBe(parsed.numbers.length)
    expect(report.added).toBe(0)
    expect(data.projects).toHaveLength(current.projects?.length ?? 0)

    const named = parsed.numbers.find((n) => n.customer !== null && n.projectTitle !== null)
    expect(named).toBeDefined()
    const before = current.projects?.find((p) => p.workdayId === named?.workdayId)
    if (before) {
      const after = data.projects?.find((p) => p.workdayId === named?.workdayId)
      expect(after?.customer).toBe(named?.customer)
      expect(after?.projectTitle).toBe(named?.projectTitle)
    }
  })

  // The point of the upload. 462 of the numbers the list carries were nameless
  // in the tracker and the picker showed each as its own number.
  it('leaves no number it carries without a name', () => {
    const { data } = mergeProjectNumbers(current, parsed, listName as string, true)
    const carried = new Set(parsed.numbers.map((number) => number.workdayId))
    const rows = (data.projects ?? []).filter((project) => carried.has(project.workdayId))
    expect(rows.length).toBeGreaterThanOrEqual(parsed.numbers.length)

    // What `labelOf` reads in that order. A row with none of the three is a row
    // the picker can only call by its own number.
    const bare = rows.filter(
      (project) =>
        project.workdayTitle === null &&
        project.projectTitle === null &&
        project.customer === null,
    )
    expect(bare.map((project) => project.workdayId)).toEqual([])

    // 270 of them state a customer and no title so the customer is the name.
    const byTitle = rows.filter((project) => project.projectTitle !== null)
    expect(byTitle.length).toBeGreaterThan(500)
    expect(byTitle.length).toBeLessThan(rows.length)
  })

  it('names nothing it does not carry', () => {
    const before = current.projects ?? []
    const { data } = mergeProjectNumbers(current, parsed, listName as string, true)
    const carried = new Set(parsed.numbers.map((number) => number.workdayId))
    // The 4s list covers one business line so most of the tracker is untouched
    // by it. A row it never named must come back byte for byte.
    for (const [at, project] of before.entries()) {
      if (carried.has(project.workdayId)) continue
      expect(data.projects?.[at], project.workdayId).toBe(project)
    }
  })

  it('replaces no list the tracker owns', () => {
    const { data } = mergeProjectNumbers(current, parsed, listName as string, true)
    expect(data.locations).toBe(current.locations)
    expect(data.holidays).toBe(current.holidays)
    expect(data.specifications).toBe(current.specifications)
    expect(data.timeValues).toBe(current.timeValues)
    expect(data.absenceTypes).toBe(current.absenceTypes)
    expect(data.source?.workbook).toBe(trackerName)
    expect(data.source?.projectNumbers?.workbook).toBe(listName)
  })

  it('adds the numbers the tracker has not got when asked', () => {
    const off = mergeProjectNumbers(current, parsed, listName as string, false)
    const on = mergeProjectNumbers(current, parsed, listName as string, true)
    expect(on.report.added).toBe(on.report.absent)
    expect(on.data.projects).toHaveLength((off.data.projects?.length ?? 0) + on.report.absent)
    const added = on.data.projects?.slice(off.data.projects?.length ?? 0) ?? []
    for (const project of added) {
      expect(project.businessLine).toBe('software')
      expect(project.specRange, project.workdayId).toMatch(/^spec_software_(proj|cc)$/)
      expect(project.costCentre).toBeNull()
    }
  })

  it('leaves a second pass with nothing to do', () => {
    const once = mergeProjectNumbers(current, parsed, listName as string, true)
    const twice = mergeProjectNumbers(once.data, parsed, listName as string, true)
    expect(twice.report.named).toBe(0)
    expect(twice.report.absent).toBe(0)
    expect(twice.report.known).toBe(parsed.numbers.length)
    expect(twice.data.projects).toHaveLength(once.data.projects?.length ?? 0)
  })
})

describe('telling the two workbooks apart', () => {
  it('reads the tracker as a catalogue', () => {
    const upload = readUploadFrom(bytesOf(trackerName as string))
    expect(upload.kind).toBe('tracker')
    if (upload.kind === 'tracker') expect(upload.catalogue.locations).toHaveLength(22)
  })

  it('reads the list as project numbers', () => {
    const upload = readUploadFrom(bytesOf(listName as string))
    expect(upload.kind).toBe('projectNumbers')
    if (upload.kind === 'projectNumbers') {
      expect(upload.projectNumbers.numbers.length).toBeGreaterThan(700)
    }
  })

  it('refuses anything else', () => {
    expect(() => readUploadFrom(new TextEncoder().encode('hello'))).toThrow(NotAnUpload)
  })
})
