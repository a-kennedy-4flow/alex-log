// The specification one Jira ticket books.
//
// Jira holds the specification as a label so it carries no space. The workbook
// holds the same fact with spaces and with a capital in a different place. The
// join between the two is what is tested here and it is tested against the
// shipped list rather than against a fixture of its own.
//
// Every cost centre and every label below was read off `4flow.atlassian.net` on
// 2026-09-10. See `docs/jira.md`.

import { describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'

import {
  allocationsFromGroups,
  catalogue,
  groupByAllocation,
  matchSpecification,
  resolveSpecification,
  setCatalogue,
  specificationsFor,
  type CompletedTicket,
  type TicketHours,
} from '../index'

setCatalogue(await loadCatalogue())

/** `21111` is `4s_PG_iTMS-4s`. Every ticket of that cost centre reads this list. */
const ITMS = '21111'

function ticketOf(over: Partial<CompletedTicket> = {}): CompletedTicket {
  return {
    key: 'PLRS-1141',
    summary: 'Add TO/Load identification',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-26T14:34:46.607+0200',
    parentKey: null,
    parentSummary: null,
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

describe('a Jira label read into the workbook list', () => {
  it('reads an underscore where the workbook writes a space', () => {
    expect(matchSpecification(ITMS, '4s_Overheads_Concept_&_development')).toBe(
      '4s_Overheads_Concept & development',
    )
  })

  it('reads a capital where the workbook writes a space and a small letter', () => {
    // `spec_software_proj` holds `4s_Change request`. Jira labels it in camel.
    expect(matchSpecification('1005031', '4s_changeRequest')).toBe('4s_Change request')
  })

  it('reads a label the two spell the same way', () => {
    expect(matchSpecification(ITMS, '4s_Overheads_Absence')).toBe('4s_Overheads_Absence')
  })

  it('answers nothing for a label this cost centre does not allow', () => {
    // `4s_changeRequest` is a project specification and 21111 is a cost centre.
    expect(matchSpecification(ITMS, '4s_changeRequest')).toBeNull()
  })

  it('answers nothing for a cost centre number typed into the label field', () => {
    // `CUS-2479` carries exactly this. It is a number and not a specification.
    expect(matchSpecification(ITMS, '9963711')).toBeNull()
  })

  it('answers nothing where no cost centre answered', () => {
    expect(matchSpecification(null, '4s_Overheads_Absence')).toBeNull()
  })

  it('holds every specification the workbook knows apart', () => {
    const all = [...new Set(Object.values(catalogue.specifications).flat())]
    const keyed = new Set(all.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')))
    expect(keyed.size).toBe(all.length)
  })
})

// The order the screen resolves in. The cost centre owns the list so it is
// answered first and the label is read into that list rather than the other
// way round.
describe('resolving the specification of one ticket', () => {
  it('takes the label the specification ticket carried', () => {
    const found = resolveSpecification(
      ticketOf({
        costCentreSpecification: '4s_Overheads_Product_operations',
        costCentreSpecificationFrom: 'COMM-23080',
      }),
      ITMS,
    )
    expect(found.specification).toBe('4s_Overheads_Product operations')
    expect(found.source).toBe('jira')
    expect(found.from).toBe('COMM-23080')
    expect(found.unknown).toBe(false)
  })

  it('falls to the first of the list where Jira carried none', () => {
    const found = resolveSpecification(ticketOf(), ITMS)
    expect(found.specification).toBe(specificationsFor(ITMS).options[0])
    expect(found.source).toBe('default')
    expect(found.label).toBeNull()
    expect(found.unknown).toBe(false)
  })

  it('reports a label the cost centre disallows and books the default anyway', () => {
    const found = resolveSpecification(
      ticketOf({
        costCentreSpecification: '9963711',
        costCentreSpecificationFrom: 'CUS-2479',
      }),
      ITMS,
    )
    expect(found.source).toBe('default')
    expect(found.unknown).toBe(true)
    expect(found.label).toBe('9963711')
    expect(found.from).toBe('CUS-2479')
  })

  it('answers nothing at all where no cost centre answered', () => {
    const found = resolveSpecification(ticketOf(), null)
    expect(found.specification).toBeNull()
    expect(found.source).toBe('none')
    expect(found.unknown).toBe(false)
  })

  it('drops the ticket the label came from where there is no label', () => {
    const found = resolveSpecification(ticketOf({ costCentreSpecificationFrom: 'COMM-1' }), ITMS)
    expect(found.from).toBeNull()
  })
})

// One 4flow cost centre runs concept work and product operations and training
// against the same number. A group holding two of them could book only one.
describe('grouping one cost centre by its specifications', () => {
  const worked: TicketHours[] = [
    {
      key: 'PLRS-1',
      summary: 'one',
      workdayId: ITMS,
      specification: '4s_Overheads_Concept & development',
      hours: 8,
    },
    {
      key: 'PLRS-2',
      summary: 'two',
      workdayId: ITMS,
      specification: '4s_Overheads_Product operations',
      hours: 8,
    },
    {
      key: 'PLRS-3',
      summary: 'three',
      workdayId: ITMS,
      specification: '4s_Overheads_Concept & development',
      hours: 8,
    },
  ]

  it('splits one Workday ID into a group per specification', () => {
    const groups = groupByAllocation(worked)
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.specification)).toEqual([
      '4s_Overheads_Concept & development',
      '4s_Overheads_Product operations',
    ])
  })

  it('sums the hours of the tickets sharing a pair', () => {
    const [first] = groupByAllocation(worked)
    expect(first?.hours).toBe(16)
    expect(first?.tickets.map((t) => t.key)).toEqual(['PLRS-1', 'PLRS-3'])
  })

  it('books each group under the specification it resolved', () => {
    const allocations = allocationsFromGroups(groupByAllocation(worked), '01_DE_Berlin')
    expect(allocations.map((a) => a.specification)).toEqual([
      '4s_Overheads_Concept & development',
      '4s_Overheads_Product operations',
    ])
    expect(new Set(allocations.map((a) => a.workdayId))).toEqual(new Set([ITMS]))
  })

  it('falls to the workbook default for a group that resolved none', () => {
    const none: TicketHours[] = [
      { key: 'PLRS-9', summary: 'nine', workdayId: ITMS, specification: null, hours: 8 },
    ]
    const [allocation] = allocationsFromGroups(groupByAllocation(none), null)
    expect(allocation?.specification).toBe(specificationsFor(ITMS).options[0])
  })
})
