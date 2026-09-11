// Converting a Jira cost centre into a Workday ID.
//
// Jira holds the number the business writes. The tracker books against a
// Workday ID. The catalogue is the only thing that joins the two so the join is
// tested against the shipped list rather than against a fixture of its own.

import { afterAll, describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'

import {
  catalogue,
  resolveCostCentre,
  setCatalogue,
  workdayIdForCostCentre,
  type CompletedTicket,
  type RawProject,
} from '../index'

const real = await loadCatalogue()
setCatalogue(real)

describe('a cost centre from the shipped list', () => {
  it('converts a cost centre to the Workday ID beside it', () => {
    expect(workdayIdForCostCentre('99980100')).toBe('10100')
  })

  it('takes a Workday ID that was written into the field unchanged', () => {
    // Nobody has to edit 3149 rows for a site that already writes the answer.
    expect(workdayIdForCostCentre('7713022')).toBe('7713022')
  })

  it('reports nothing for a number this catalogue never heard of', () => {
    expect(workdayIdForCostCentre('12345678')).toBeNull()
  })

  it('reads 0 and blank and null as no cost centre at all', () => {
    // 1276 rows carry a cost centre of 0. It is absence rather than a value.
    expect(workdayIdForCostCentre('0')).toBeNull()
    expect(workdayIdForCostCentre('   ')).toBeNull()
    expect(workdayIdForCostCentre(null)).toBeNull()
  })

  it('ignores the spaces Jira leaves around a typed value', () => {
    expect(workdayIdForCostCentre(' 99980100 ')).toBe('10100')
  })

  it('answers for every cost centre the list holds', () => {
    const withOne = catalogue.projects.filter(
      (project) => project.costCentre && project.costCentre !== '0',
    )
    const missed = withOne.filter((project) => workdayIdForCostCentre(project.costCentre) === null)
    expect(missed).toEqual([])
  })
})

/** One row as the workbook writes it. Only the fields the join reads matter. */
function projectOf(over: Partial<RawProject>): RawProject {
  return {
    costCentre: null,
    customerGroup: null,
    customer: null,
    customerId: null,
    projectNo: null,
    entity: null,
    businessLine: null,
    businessUnit: null,
    projectTitle: null,
    status: null,
    object: null,
    workdayId: '1',
    workdayTitle: null,
    specification: null,
    hgbAllocation: null,
    businessLineKey: '4flow',
    objectKey: 'cc',
    specRange: null,
    ...over,
  } as RawProject
}

describe('a cost centre the deduplication would have dropped', () => {
  afterAll(() => setCatalogue(real))

  it('still converts where its row lost to an earlier one', () => {
    // 350 Workday IDs repeat and the copies differ only in cost centre and
    // project number. Building the index from the kept rows alone would lose
    // exactly the numbers it exists to find.
    setCatalogue({
      projects: [
        projectOf({ workdayId: '10100', costCentre: '99980100' }),
        projectOf({ workdayId: '10100', costCentre: '99980199' }),
      ],
    })
    expect(catalogue.duplicateProjectRows).toBe(1)
    expect(workdayIdForCostCentre('99980100')).toBe('10100')
    expect(workdayIdForCostCentre('99980199')).toBe('10100')
  })

  it('lets the first row win where one number names two Workday IDs', () => {
    setCatalogue({
      projects: [
        projectOf({ workdayId: '10100', costCentre: '4242' }),
        projectOf({ workdayId: '10200', costCentre: '4242' }),
      ],
    })
    expect(workdayIdForCostCentre('4242')).toBe('10100')
  })

  it('prefers a cost centre over a project number carrying the same value', () => {
    setCatalogue({
      projects: [
        projectOf({ workdayId: '10100', projectNo: '4242' }),
        projectOf({ workdayId: '10200', costCentre: '4242' }),
      ],
    })
    expect(workdayIdForCostCentre('4242')).toBe('10200')
  })

  it('falls back to a project number where no cost centre carries the value', () => {
    setCatalogue({ projects: [projectOf({ workdayId: '10100', projectNo: '4242' })] })
    expect(workdayIdForCostCentre('4242')).toBe('10100')
  })
})

// Which cost centre one ticket books against and where that came from.
//
// The order is what a month is booked on so every step of it is fixed here. A
// 4flow ticket rarely carries a cost centre of its own and the epic above it
// carries one for everything beneath. The Jira client walks that chain and this
// reads what the walk found.
describe('resolving the cost centre of one ticket', () => {
  afterAll(() => setCatalogue(real))

  function ticketOf(over: Partial<CompletedTicket> = {}): CompletedTicket {
    return {
      key: 'PLRS-1141',
      summary: 'Add TO/Load identification',
      projectKey: 'PLRS',
      resolvedAt: '2026-08-26T14:34:46.607+0200',
      parentKey: 'PLRS-900',
      parentSummary: 'User group feedback',
      costCentre: null,
      costCentreFrom: null,
      costCentreSpecification: null,
      costCentreSpecificationFrom: null,
      days: {},
      workdayId: null,
      specification: null,
      hours: 0,
      hoursSource: '',
      ...over,
    }
  }

  const nothing = { tickets: {}, projects: {} }

  it('takes the cost centre on the ticket itself', () => {
    setCatalogue(real)
    const found = resolveCostCentre(
      ticketOf({ costCentre: '99980100', costCentreFrom: 'PLRS-1141' }),
      nothing,
    )
    expect(found).toEqual({
      workdayId: '10100',
      source: 'jira',
      costCentre: '99980100',
      from: 'PLRS-1141',
      unknown: false,
    })
  })

  it('names the ancestor a cost centre was inherited from', () => {
    const found = resolveCostCentre(
      ticketOf({ costCentre: '99980100', costCentreFrom: 'PLRS-900' }),
      nothing,
    )
    expect(found.workdayId).toBe('10100')
    expect(found.source).toBe('jira')
    // The screen says which ticket answered. A figure read off an epic reads
    // exactly like one written on the ticket until it does.
    expect(found.from).toBe('PLRS-900')
  })

  it('books nothing where no ticket in the chain carried one', () => {
    const found = resolveCostCentre(ticketOf(), nothing)
    expect(found).toEqual({
      workdayId: null,
      source: 'none',
      costCentre: null,
      from: null,
      unknown: false,
    })
  })

  it('takes the cost centre set on that one ticket', () => {
    const found = resolveCostCentre(ticketOf(), { tickets: { 'PLRS-1141': '10200' }, projects: {} })
    expect(found.workdayId).toBe('10200')
    expect(found.source).toBe('ticket')
  })

  it('lets a ticket answer beat the field Jira carried', () => {
    // The one way to correct an epic carrying the wrong cost centre for a
    // single ticket beneath it.
    const found = resolveCostCentre(
      ticketOf({ costCentre: '99980100', costCentreFrom: 'PLRS-900' }),
      { tickets: { 'PLRS-1141': '10200' }, projects: {} },
    )
    expect(found.workdayId).toBe('10200')
    expect(found.source).toBe('ticket')
  })

  it('lets the field Jira carried beat the project map', () => {
    // One project is not one cost centre so the per ticket field is the finer
    // answer of the two.
    const found = resolveCostCentre(
      ticketOf({ costCentre: '99980100', costCentreFrom: 'PLRS-900' }),
      { tickets: {}, projects: { PLRS: '10200' } },
    )
    expect(found.workdayId).toBe('10100')
    expect(found.source).toBe('jira')
  })

  it('falls to the project map where Jira carried nothing', () => {
    const found = resolveCostCentre(ticketOf(), { tickets: {}, projects: { PLRS: '10200' } })
    expect(found.workdayId).toBe('10200')
    expect(found.source).toBe('project')
  })

  it('reports a number the catalogue does not know and lets the map answer', () => {
    const found = resolveCostCentre(
      ticketOf({ costCentre: '12345678', costCentreFrom: 'PLRS-900' }),
      { tickets: {}, projects: { PLRS: '10200' } },
    )
    expect(found.workdayId).toBe('10200')
    expect(found.source).toBe('project')
    expect(found.unknown).toBe(true)
    expect(found.costCentre).toBe('12345678')
    expect(found.from).toBe('PLRS-900')
  })

  it('reports one it does not know with nothing underneath to answer', () => {
    const found = resolveCostCentre(
      ticketOf({ costCentre: '12345678', costCentreFrom: 'PLRS-900' }),
      nothing,
    )
    expect(found.workdayId).toBeNull()
    expect(found.source).toBe('none')
    expect(found.unknown).toBe(true)
  })
})
