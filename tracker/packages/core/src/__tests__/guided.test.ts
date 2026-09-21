// The guided build. Absence is fixed to its date and work takes what is left.
//
// The split is the whole reason the builder exists so every test here states
// one side of it. A day off has to be on the day it was taken. A day of work
// may be anywhere the month still has room for.

import { describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'

import type { Allocation, GuidedAbsence } from '../index'
import {
  buildMonth,
  dayTotals,
  guidedMonth,
  setCatalogue,
  totalDays,
  workingDayCount,
} from '../index'

setCatalogue(await loadCatalogue())

const LOCATION = '01_DE_Berlin'
const days = buildMonth(2026, 4, LOCATION)
const workingDays = workingDayCount(days)

/** The two working days this month opens with. April 2026 opens on Wednesday. */
const FIRST = '2026-04-01'
const SECOND = '2026-04-02'

function allocation(workdayId: string, percent: number): Allocation {
  return { workdayId, specification: '4s_Overheads_Other', percent, location: LOCATION, tasks: null }
}

function away(date: string, days: 0.5 | 1 = 1): GuidedAbsence {
  return { date, workdayId: 'Vacation or sickness', days }
}

/** The rows of one date that hold anything. */
function rowsOn(halfDays: { date: string; workdayId: string | null }[], date: string) {
  return halfDays.filter((row) => row.date === date && row.workdayId !== null)
}

describe('a month with no absence', () => {
  it('spreads the whole target over the work', () => {
    const built = guidedMonth({
      days,
      absences: [],
      allocations: [allocation('24112', 100)],
      target: workingDays,
    })
    expect(built.absenceDays).toBe(0)
    expect(built.workDays).toBe(workingDays)
    expect(built.shortBy).toBe(0)
    expect(totalDays(built.halfDays)).toBe(workingDays)
  })

  it('divides the month between the shares it was given', () => {
    const built = guidedMonth({
      days,
      absences: [],
      allocations: [allocation('24112', 50), allocation('21111', 50)],
      target: 20,
    })
    const booked = new Map<string, number>()
    for (const row of built.halfDays) {
      if (row.workdayId === null || row.days === null) continue
      booked.set(row.workdayId, (booked.get(row.workdayId) ?? 0) + row.days)
    }
    expect(booked.get('24112')).toBe(10)
    expect(booked.get('21111')).toBe(10)
  })
})

describe('a day off', () => {
  it('lands on the day it was taken and nowhere else', () => {
    const built = guidedMonth({
      days,
      absences: [away(FIRST), away(SECOND)],
      allocations: [allocation('24112', 100)],
      target: workingDays,
    })
    expect(rowsOn(built.halfDays, FIRST).map((row) => row.workdayId)).toEqual([
      'Vacation or sickness',
    ])
    expect(rowsOn(built.halfDays, SECOND).map((row) => row.workdayId)).toEqual([
      'Vacation or sickness',
    ])
    expect(built.absenceDays).toBe(2)
  })

  it('keeps work off the day it holds', () => {
    const built = guidedMonth({
      days,
      absences: [away(FIRST)],
      allocations: [allocation('24112', 100)],
      target: workingDays,
    })
    const onFirst = built.halfDays.filter((row) => row.date === FIRST && row.workdayId !== null)
    expect(onFirst.every((row) => row.workdayId === 'Vacation or sickness')).toBe(true)
  })

  it('takes its days out of what the work has to cover', () => {
    const built = guidedMonth({
      days,
      absences: [away(FIRST), away(SECOND)],
      allocations: [allocation('24112', 100)],
      target: 20,
    })
    expect(built.workDays).toBe(18)
    expect(totalDays(built.halfDays)).toBe(20)
  })

  it('holds a whole calendar day and never more', () => {
    const built = guidedMonth({
      days,
      absences: [away(FIRST)],
      allocations: [allocation('24112', 100)],
      target: 20,
    })
    expect([...dayTotals(built.halfDays).values()].every((total) => total <= 1)).toBe(true)
  })
})

describe('an absence the month cannot take', () => {
  it('drops a day that is not a working day and says which', () => {
    // 2026-04-04 is a Saturday. The tracker books no non working day so a row
    // written there would be an error rather than a booking.
    const built = guidedMonth({
      days,
      absences: [away('2026-04-04')],
      allocations: [allocation('24112', 100)],
      target: 20,
    })
    expect(built.ignored).toEqual(['2026-04-04'])
    expect(built.absenceDays).toBe(0)
    expect(rowsOn(built.halfDays, '2026-04-04')).toEqual([])
  })

  it('drops a date named twice', () => {
    const built = guidedMonth({
      days,
      absences: [away(FIRST), away(FIRST)],
      allocations: [allocation('24112', 100)],
      target: 20,
    })
    expect(built.absenceDays).toBe(1)
    expect(built.ignored).toEqual([FIRST])
  })

  it('reports the days the work could not reach', () => {
    // Every working day is a day off so the target has nowhere to put work.
    const built = guidedMonth({
      days,
      absences: days.filter((day) => !day.nonWorking).map((day) => away(day.date)),
      allocations: [allocation('24112', 100)],
      target: workingDays,
    })
    expect(built.absenceDays).toBe(workingDays)
    expect(built.workDays).toBe(0)
    expect(built.shortBy).toBe(0)
  })

  it('is short by what the free days could not hold', () => {
    // The target is every working day and one of them is spent away. The work
    // then asks for more days than the month has left.
    const built = guidedMonth({
      days,
      absences: [away(FIRST, 0.5)],
      allocations: [allocation('24112', 100)],
      target: workingDays,
    })
    expect(built.absenceDays).toBe(0.5)
    expect(built.workDays).toBe(workingDays - 0.5)
    expect(built.shortBy).toBe(0.5)
  })
})
