// Converting a Jira cost centre into a Workday ID.
//
// Jira holds the number the business writes. The tracker books against a
// Workday ID. The catalogue is the only thing that joins the two so the join is
// tested against the shipped list rather than against a fixture of its own.

import { afterAll, describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'

import { catalogue, setCatalogue, workdayIdForCostCentre, type RawProject } from '../index'

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
