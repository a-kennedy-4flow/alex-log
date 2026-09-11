// The Jira hours rule. Four hours is half a day and it rounds up. The site the
// tickets come from holds no hours at all so every figure here is one a user
// typed. See `docs/jira.md`.

import { describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'

import type { TicketHours } from '../index'
import {
  allocationsFromGroups,
  buildMonth,
  daysFromHours,
  distribute,
  fitsMonth,
  groupByAllocation,
  hoursPerHalfDay,
  hoursPerMonth,
  hoursTotals,
  setCatalogue,
  tasksFor,
  totalDays,
  workingDayCount,
} from '../index'

setCatalogue(await loadCatalogue())

const LOCATION = '01_DE_Berlin'
const august = buildMonth(2026, 8, LOCATION)

/** The seven real tickets closed in August 2026. The hours are not real. */
const AUGUST: TicketHours[] = [
  { key: 'PLRS-1141', summary: 'Add TO/Load identification', workdayId: '4100782', specification: null, hours: 14 },
  { key: 'PLRS-1115', summary: 'Set up roles', workdayId: '4100782', specification: null, hours: 11 },
  { key: 'PLRS-995', summary: 'Bring frontend in line', workdayId: '4100782', specification: null, hours: 9 },
  { key: 'PLRS-1099', summary: 'Customize reopen status', workdayId: '4100782', specification: null, hours: 6 },
  { key: 'PLRS-1117', summary: 'Email templates preview', workdayId: '4100782', specification: null, hours: 5 },
  { key: 'PLRS-1116', summary: 'Role requirements in openapi', workdayId: '4100782', specification: null, hours: 3 },
  { key: 'DEVH-4887', summary: 'Create WebProxy', workdayId: '4100915', specification: null, hours: 2 },
]

describe('daysFromHours', () => {
  it('gives nothing for nothing', () => {
    expect(daysFromHours(0)).toBe(0)
  })

  it('holds the boundaries', () => {
    expect(daysFromHours(4)).toBe(0.5)
    expect(daysFromHours(8)).toBe(1)
  })

  it('rounds a part hour up to the next half day', () => {
    expect(daysFromHours(0.25)).toBe(0.5)
    expect(daysFromHours(4.1)).toBe(1)
    expect(daysFromHours(8.5)).toBe(1.5)
  })

  it('never returns a value column K cannot hold', () => {
    for (let hours = 0; hours <= 80; hours += 0.25) {
      expect((daysFromHours(hours) * 2) % 1).toBe(0)
    }
  })

  it('refuses a negative and a number that is not one', () => {
    expect(daysFromHours(-5)).toBe(0)
    expect(daysFromHours(Number.NaN)).toBe(0)
  })
})

describe('grouping the month', () => {
  const groups = groupByAllocation(AUGUST)
  const totals = hoursTotals(AUGUST, groups)

  it('gathers the seven tickets under two Workday IDs', () => {
    expect(groups.map((g) => g.workdayId)).toEqual(['4100782', '4100915'])
    expect(groups[0]?.tickets).toHaveLength(6)
  })

  it('sums the hours then rounds the sum once', () => {
    expect(groups[0]?.hours).toBe(48)
    expect(groups[0]?.days).toBe(6)
    expect(groups[1]?.hours).toBe(2)
    expect(groups[1]?.days).toBe(0.5)
  })

  it('reports what the rounding added', () => {
    expect(totals.hours).toBe(50)
    expect(totals.trueDays).toBe(6.25)
    expect(totals.roundedDays).toBe(6.5)
    expect(totals.inflation).toBeCloseTo(0.25)
  })

  it('inflates by half a day for every group holding under half a day', () => {
    const thin: TicketHours[] = [
      { key: 'A-1', summary: 'one', workdayId: '4100782', specification: null, hours: 1 },
      { key: 'B-1', summary: 'two', workdayId: '4100915', specification: null, hours: 1 },
    ]
    const groups = groupByAllocation(thin)
    const totals = hoursTotals(thin, groups)
    expect(totals.trueDays).toBe(0.25)
    expect(totals.roundedDays).toBe(1)
  })

  it('holds an unmapped ticket apart and books nothing for it', () => {
    const mixed = [...AUGUST, { key: 'X-1', summary: 'no project', workdayId: null, specification: null, hours: 8 }]
    const groups = groupByAllocation(mixed)
    const totals = hoursTotals(mixed, groups)
    expect(groups).toHaveLength(2)
    expect(totals.unmapped.map((t) => t.key)).toEqual(['X-1'])
    expect(totals.hours).toBe(50)
  })

  it('names every ticket of a group in column M', () => {
    expect(tasksFor(groups[1]!)).toBe('DEVH-4887 Create WebProxy')
    expect(tasksFor(groups[0]!)).toContain('PLRS-1141')
    expect(tasksFor(groups[0]!)).toContain('PLRS-1116')
  })
})

describe('fitsMonth', () => {
  it('accepts a total the month has room for', () => {
    expect(workingDayCount(august)).toBe(21)
    expect(fitsMonth(6.5, august)).toBe(true)
    expect(fitsMonth(21, august)).toBe(true)
  })

  it('refuses a total the month cannot hold', () => {
    expect(fitsMonth(21.5, august)).toBe(false)
  })
})

describe('the fill', () => {
  const groups = groupByAllocation(AUGUST)
  const totals = hoursTotals(AUGUST, groups)
  const grid = distribute(allocationsFromGroups(groups, LOCATION), august, totals.roundedDays)

  it('books exactly what the rounding asked for', () => {
    expect(totalDays(grid)).toBe(totals.roundedDays)
  })

  it('skips every non-working day', () => {
    const nonWorking = new Set(august.filter((d) => d.nonWorking).map((d) => d.date))
    const booked = grid.filter((h) => h.workdayId !== null)
    expect(booked.every((h) => !nonWorking.has(h.date))).toBe(true)
  })

  it('carries the ticket text and the location onto every booked row', () => {
    const booked = grid.filter((h) => h.workdayId !== null)
    expect(booked.length).toBeGreaterThan(0)
    expect(booked.every((h) => h.location === LOCATION)).toBe(true)
    expect(booked.every((h) => (h.tasks ?? '').length > 0)).toBe(true)
  })

  it('books nothing when there is nothing to book', () => {
    expect(allocationsFromGroups([], LOCATION)).toEqual([])
  })
})

describe('the working day', () => {
  it('halves whatever the day is', () => {
    expect(hoursPerHalfDay(null)).toBe(4)
    expect(hoursPerHalfDay(8)).toBe(4)
    expect(hoursPerHalfDay(6)).toBe(3)
    expect(hoursPerHalfDay(7.5)).toBe(3.75)
  })

  it('falls back rather than dividing by nothing', () => {
    expect(hoursPerHalfDay(0)).toBe(4)
    expect(hoursPerHalfDay(-8)).toBe(4)
  })

  it('rounds up against the day the user keeps', () => {
    // Three hours is a half day for somebody working six.
    expect(daysFromHours(3, 6)).toBe(0.5)
    expect(daysFromHours(3.5, 6)).toBe(1)
    expect(daysFromHours(6, 6)).toBe(1)
    // The same three hours is still a half day on an eight hour one.
    expect(daysFromHours(3, 8)).toBe(0.5)
  })

  it('states the month in the unit the tickets carry', () => {
    expect(hoursPerMonth(null, 21)).toBe(168)
    expect(hoursPerMonth(6, 21)).toBe(126)
    expect(hoursPerMonth(8, 16.8)).toBeCloseTo(134.4)
  })

  it('books a six hour day user more days for the same hours', () => {
    const worked: TicketHours[] = [
      { key: 'A-1', summary: 'one', workdayId: '4100782', specification: null, hours: 24 },
    ]
    expect(groupByAllocation(worked, 8)[0]?.days).toBe(3)
    expect(groupByAllocation(worked, 6)[0]?.days).toBe(4)
  })

  it('carries the day length through the totals', () => {
    const worked: TicketHours[] = [
      { key: 'A-1', summary: 'one', workdayId: '4100782', specification: null, hours: 12 },
    ]
    const groups = groupByAllocation(worked, 6)
    expect(hoursTotals(worked, groups, 6).trueDays).toBe(2)
    expect(hoursTotals(worked, groupByAllocation(worked, 8), 8).trueDays).toBe(1.5)
  })
})
