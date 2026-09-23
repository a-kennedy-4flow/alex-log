<script setup lang="ts">
// Step two drawn as a calendar board.
//
// A day off is remembered as a date on a month rather than as an item in a
// list. The board asks the question on the shape the answer is held in, so the
// user reads a week across and counts a run of days off the way they took them.
//
// It is the board `MonthCalendar.vue` draws and both take their weeks from
// `useCalendarBoard.ts`. Only a working day is a button. The weekend and the
// bank holiday are drawn because a month with its gaps left out is not a month
// and they hold no absence so they are inert.

import { useI18n } from 'vue-i18n'

import type { CalendarDay } from '@tracker/core'

import { useCalendarBoard } from '@/composables/useCalendarBoard'
import { placed, placing, toggleDate } from '@/composables/useGuided'

const { t } = useI18n()

const { weekdays, weeks, longDate } = useCalendarBoard()

/** What a cell is announced as. The absence it holds is part of the name. */
function dayLabel(day: CalendarDay): string {
  const held = placed[day.date]
  return held === undefined ? longDate(day.date) : `${longDate(day.date)} ${held}`
}
</script>

<template>
  <table class="days">
    <caption class="visually-hidden">{{ t('guided.step2') }}</caption>
    <thead>
      <tr>
        <th v-for="name in weekdays" :key="name" scope="col">{{ name }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(week, at) in weeks" :key="at">
        <td
          v-for="(day, column) in week"
          :key="day ? day.date : `blank-${column}`"
          :class="[`dow-${column + 1}`, { blank: !day, off: day?.nonWorking }]"
        >
          <template v-if="day">
            <button
              v-if="!day.nonWorking"
              type="button"
              class="day"
              :class="{ on: placed[day.date] !== undefined }"
              :aria-pressed="placed[day.date] !== undefined"
              :aria-label="dayLabel(day)"
              :disabled="placed[day.date] === undefined && placing === null"
              @click="toggleDate(day.date)"
            >
              <span class="d num">{{ day.dayOfMonth }}</span>
              <span v-if="day.workingWeekend" class="lab">{{ t('grid.workingWeekend') }}</span>
              <span v-if="placed[day.date]" class="held">{{ placed[day.date] }}</span>
            </button>
            <span v-else class="shut">
              <span class="d num">{{ day.dayOfMonth }}</span>
              <span v-if="day.holiday" class="lab">{{ t('grid.holiday') }}</span>
            </span>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* Line weight divides the cells. `MonthCalendar.vue` is ruled the same way. */
.days {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border-top: 1px solid var(--warm-grey);
  border-left: 1px solid var(--warm-grey);
  margin-top: 12px;
}

th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--grey);
  font-weight: 700;
  text-align: left;
  padding: 7px 9px;
  border-right: 1px solid var(--warm-grey);
  border-bottom: 2px solid var(--bright-blue);
}

td {
  border-right: 1px solid var(--warm-grey);
  border-bottom: 1px solid var(--warm-grey);
  vertical-align: top;
  padding: 0;
}

/*
 * The wash of the weekday. `tokens.css` holds the five. The list washed a
 * button and the board washes the column it stands in, so the week reads as
 * five days without the name of one being written on every cell.
 */
td.dow-1 {
  background: var(--dow-1);
}

td.dow-2 {
  background: var(--dow-2);
}

td.dow-3 {
  background: var(--dow-3);
}

td.dow-4 {
  background: var(--dow-4);
}

td.dow-5 {
  background: var(--dow-5);
}

/*
 * A day step two may not take. The weekend and the bank holiday and the pad
 * either side of the month all read as one. It is written after the five
 * because a holiday falls on a weekday and the later rule is the one that
 * paints. A working Saturday keeps the tint because the tracker books no
 * weekend by default and the cell says which one it is.
 */
td.dow-6,
td.dow-7,
td.blank,
td.off {
  background: var(--tint);
}

.day,
.shut {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  min-height: 66px;
  padding: 8px;
}

.day {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

/* An inset edge rather than a border. The cell is ruled by the table so a
   border of its own would shift the day beside it. */
.day:hover:not(:disabled) {
  box-shadow: inset 0 0 0 2px var(--bright-blue);
}

.day.on {
  background: var(--smart-blue);
  color: var(--white);
}

.day:disabled {
  opacity: 0.45;
}

.d {
  font-weight: 700;
  font-size: 15px;
}

/* Weight recedes a day the tracker asks nothing of. Colour cannot because Grey
   fails on the washes. */
.shut .d {
  font-weight: 400;
}

.lab {
  font-size: 10px;
  line-height: 1.25;
  overflow-wrap: break-word;
}

/*
 * Which absence the day holds. The label runs to 20 characters so it wraps
 * rather than being cut. The board grows downwards the way the month board
 * does and a name half written says nothing.
 */
.held {
  margin-top: auto;
  font-size: 11px;
  line-height: 1.25;
  overflow-wrap: break-word;
}

.day.on .lab,
.day.on .held {
  color: var(--on-blue-label);
}
</style>
