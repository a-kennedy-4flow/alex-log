// The open month laid out as a board. Seven columns and one cell a day.
//
// Two screens draw it. The month view edits what a day was booked against and
// the guided build asks which days were taken off. Neither computes its own
// weeks. Two boards that disagreed on where a month starts would be a fault
// nobody thinks to look for.

import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { CalendarDay } from '@tracker/core'

import { weekdayName } from '@/i18n'

import { calendar } from './useTimesheet'

/** Monday first. Any Monday will do because only the name is wanted. */
const WEEK_START = '2024-01-01'

export interface CalendarBoard {
  /** The seven column names. Monday first. */
  weekdays: ComputedRef<string[]>
  /** The open month week by week. A cell outside the month is null. */
  weeks: ComputedRef<(CalendarDay | null)[][]>
  /** The date written out in full. What a cell is announced as. */
  longDate: (date: string) => string
}

export function useCalendarBoard(): CalendarBoard {
  const { locale } = useI18n()

  const weekdays = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${WEEK_START}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + i)
      return weekdayName(locale.value, date.toISOString().slice(0, 10))
    }),
  )

  /**
   * Day one lands in its own weekday column so the month leads with blank
   * cells. The tail is padded for the same reason.
   */
  const weeks = computed<(CalendarDay | null)[][]>(() => {
    const first = calendar.value[0]
    if (!first) return []
    const lead: null[] = Array.from({ length: first.weekday - 1 }, () => null)
    const flat: (CalendarDay | null)[] = [...lead, ...calendar.value]
    while (flat.length % 7 !== 0) flat.push(null)
    const rows: (CalendarDay | null)[][] = []
    for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7))
    return rows
  })

  function longDate(date: string): string {
    return new Intl.DateTimeFormat(locale.value, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  }

  return { weekdays, weeks, longDate }
}
