<script setup lang="ts">
// The month view. Every calendar day holds two rows so a day can be split
// between two cost centres. This mirrors tracker rows 5 to 66.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { CalendarDay, HalfDay } from '@timesheets/core'
import {
  catalogue,
  dayTotals,
  dayIsSplit,
  dayOptionsFor,
  dayValueFor,
  defaultSpecificationFor,
  specificationsFor,
  trackerRow,
} from '@timesheets/core'
import { shortDate, weekdayName } from '@/i18n'
import { calendar, clearRow, halfDays, profile, rowsByDate } from '@/composables/useTimesheet'

import CostCentrePicker from './CostCentrePicker.vue'
import SpecPicker from './SpecPicker.vue'

const { t, locale } = useI18n()

const totalsByDate = computed(() => dayTotals(halfDays.value))

/** A row is part filled when some of the three required fields are missing. */
function incomplete(entry: HalfDay): boolean {
  const parts = [entry.workdayId, entry.specification, entry.days].filter(
    (v) => v !== null && v !== '',
  )
  return parts.length > 0 && parts.length < 3
}

function specMismatch(entry: HalfDay): boolean {
  if (!entry.workdayId || !entry.specification) return false
  return !specificationsFor(entry.workdayId).options.includes(entry.specification)
}

/**
 * The upper row taking the whole day again takes the lower row with it. The
 * lower row is then off screen so leaving anything in it would ship a booking
 * the user cannot see.
 */
function clearLower(entry: HalfDay): void {
  if (entry.half !== 0) return
  const lower = rowsOf(entry.date)[1]
  if (lower && !dayIsSplit(rowsOf(entry.date))) clearRow(lower)
}

function onDaysChange(entry: HalfDay, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  entry.days = value === '' ? null : (Number(value) as 0.5 | 1)
  clearLower(entry)
}

/**
 * Clearing the workday id drops the specification because the list changes.
 * Either way the day is shared again between the rows that remain filled.
 */
function onWorkdayChange(entry: HalfDay, value: string | null): void {
  entry.workdayId = value
  if (value === null) {
    entry.specification = null
    entry.specificationIsDefault = false
    entry.days = null
    entry.location = null
    entry.tasks = null
  } else {
    // A cost centre allows its own list so a specification from the last one
    // may no longer be on it. Either way the user is given a starting point.
    const options = specificationsFor(value).options
    if (entry.specification === null || !options.includes(entry.specification)) {
      entry.specification = defaultSpecificationFor(value)
      entry.specificationIsDefault = entry.specification !== null
    }
    if (entry.location === null) entry.location = profile.location
    if (entry.days === null) entry.days = dayValueFor(rowsOf(entry.date), entry)
  }
  if (value === null) clearLower(entry)
}

/** Choosing from the list makes it the user own pick rather than a default. */
function onSpecificationChange(entry: HalfDay, value: string | null): void {
  entry.specification = value
  entry.specificationIsDefault = false
}

/**
 * The nearest filled row above each row of the grid.
 *
 * The row directly above is usually empty because a month is filled in gaps
 * and because a weekend sits between one working day and the next. Copying it
 * would copy nothing. One pass over the grid gives every row its source.
 */
const previousFilled = computed(() => {
  const out: (HalfDay | null)[] = []
  let last: HalfDay | null = null
  for (const row of halfDays.value) {
    out.push(last)
    if (row.workdayId !== null) last = row
  }
  return out
})

/** What the copy button on this row would take. */
function copySource(entry: HalfDay): HalfDay | null {
  const index = indexOf.value.get(`${entry.date}:${entry.half}`)
  return index === undefined ? null : (previousFilled.value[index] ?? null)
}

function copyPrevious(entry: HalfDay): void {
  const source = copySource(entry)
  if (!source) return
  entry.workdayId = source.workdayId
  entry.specification = source.specification
  entry.specificationIsDefault = source.specificationIsDefault
  entry.location = source.location
  entry.tasks = source.tasks
  entry.days = dayValueFor(rowsOf(entry.date), entry)
}

/** Flat index of a half day. Needed to copy the row above. */
const indexOf = computed(() => {
  const map = new Map<string, number>()
  halfDays.value.forEach((h, i) => map.set(`${h.date}:${h.half}`, i))
  return map
})

function rowsOf(date: string): HalfDay[] {
  return rowsByDate.value.get(date) ?? []
}

/**
 * The rows a day actually shows. The lower one appears only once the upper one
 * holds a cost centre. A day is split only after it is taken so an empty upper
 * row above a filled lower one cannot happen and the month reads as one row a
 * day until something is split.
 */
function shownRows(date: string): HalfDay[] {
  const rows = rowsOf(date)
  const first = rows[0]
  if (!first) return []
  return dayIsSplit(rows) ? rows : [first]
}

/** How many rows a day contributes. Both the date cell and the week cell span them. */
function rowsShown(date: string): number {
  return shownRows(date).length
}

/** The rows a whole week contributes. The week cell spans all of them. */
function weekSpan(group: { days: CalendarDay[] }): number {
  return group.days.reduce((sum, day) => sum + rowsShown(day.date), 0)
}

/**
 * The month split into calendar weeks. The CW cell spans a whole week so the
 * number is written once rather than on all fourteen rows under it.
 */
const weeks = computed(() => {
  const out: { week: number; days: CalendarDay[] }[] = []
  for (const day of calendar.value) {
    const last = out.at(-1)
    if (last && last.week === day.week) last.days.push(day)
    else out.push({ week: day.week, days: [day] })
  }
  return out
})
</script>

<template>
  <div class="grid-wrap card" data-tour="grid">
    <table>
      <thead>
        <tr>
          <th class="col-week">{{ t('grid.week') }}</th>
          <th class="col-date">{{ t('grid.date') }}</th>
          <th class="col-day">{{ t('grid.day') }}</th>
          <th class="col-cc">{{ t('grid.workdayId') }}</th>
          <th class="col-spec">{{ t('grid.specification') }}</th>
          <th class="col-days">{{ t('grid.days') }}</th>
          <th class="col-loc">{{ t('grid.location') }}</th>
          <th class="col-tasks">{{ t('grid.tasks') }}</th>
          <th class="col-act"><span class="visually-hidden">{{ t('grid.clearRow') }}</span></th>
        </tr>
      </thead>

      <tbody v-for="(group, groupIndex) in weeks" :key="group.week" class="week">
        <template v-for="(day, dayIndex) in group.days" :key="day.date">
          <tr
            v-for="(entry, half) in shownRows(day.date)"
            :key="entry.half"
            :class="{
              'non-working': day.nonWorking,
              'day-start': half === 0 && dayIndex > 0,
              'row-error': incomplete(entry) || specMismatch(entry),
              overbooked: (totalsByDate.get(day.date) ?? 0) > 1,
            }"
          >
            <td
              v-if="dayIndex === 0 && half === 0"
              :rowspan="weekSpan(group)"
              class="col-week"
              :class="{ alternate: groupIndex % 2 === 1 }"
            >
              <span class="week-label">{{ t('grid.week') }}</span>
              <span class="week-number num">{{ group.week }}</span>
            </td>
            <td v-if="half === 0" :rowspan="rowsShown(day.date)" class="col-date">
              <span class="num">{{ shortDate(locale, day.date) }}</span>
              <span v-if="day.nonWorking" class="flag">{{ t('grid.nonWorking') }}</span>
              <span v-else-if="day.workingWeekend" class="flag ok">
                {{ t('grid.workingWeekend') }}
              </span>
            </td>
            <td v-if="half === 0" :rowspan="rowsShown(day.date)" class="col-day muted">
              {{ weekdayName(locale, day.date) }}
            </td>

            <td class="col-cc" :data-tour="half === 0 && dayIndex === 0 ? 'costCentre' : undefined">
              <CostCentrePicker
                :model-value="entry.workdayId"
                :invalid="incomplete(entry)"
                @update:model-value="onWorkdayChange(entry, $event)"
              />
            </td>
            <td class="col-spec" :data-tour="half === 0 && dayIndex === 0 ? 'specification' : undefined">
              <SpecPicker
                :model-value="entry.specification"
                :workday-id="entry.workdayId"
                :is-default="entry.specificationIsDefault"
                :invalid="specMismatch(entry) || (incomplete(entry) && !entry.specification)"
                @update:model-value="onSpecificationChange(entry, $event)"
              />
            </td>
            <td class="col-days" :data-tour="half === 0 && dayIndex === 0 ? 'days' : undefined">
              <select
                :value="entry.days ?? ''"
                :disabled="!entry.workdayId"
                @change="onDaysChange(entry, $event)"
              >
                <option value=""></option>
                <option
                  v-for="value in dayOptionsFor(rowsOf(entry.date), entry)"
                  :key="value"
                  :value="value"
                >
                  {{ value }}
                </option>
              </select>
            </td>
            <td class="col-loc">
              <select v-model="entry.location" :disabled="!entry.workdayId">
                <option :value="null"></option>
                <option v-for="place in catalogue.locations" :key="place.code" :value="place.code">
                  {{ place.code }}
                </option>
              </select>
            </td>
            <td class="col-tasks">
              <input v-model="entry.tasks" type="text" :disabled="!entry.workdayId" />
            </td>
            <td class="col-act">
              <button
                v-if="entry.workdayId"
                type="button"
                class="icon"
                :title="t('grid.clearRow')"
                @click="clearRow(entry)"
              >
                ×
              </button>
              <button
                v-else-if="copySource(entry)"
                type="button"
                class="icon"
                :data-copy-from="copySource(entry)?.workdayId"
                :title="t('grid.copyLastFilled', { id: copySource(entry)?.workdayId ?? '' })"
                @click="copyPrevious(entry)"
              >
                ↑
              </button>
              <span class="visually-hidden num">{{ trackerRow(day.dayOfMonth, entry.half) }}</span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.grid-wrap {
  padding: 0;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--navy);
  color: var(--white);
  text-align: left;
  font-weight: 600;
  padding: 8px;
  white-space: nowrap;
}

td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--navy-tint);
  vertical-align: middle;
}

/* One tbody per calendar week so the week reads as a block. */
tbody.week + tbody.week td {
  border-top: 2px solid var(--navy-line);
}

tr.day-start td {
  border-top: 1px solid var(--navy-line);
}

tr.non-working td {
  background: var(--navy-tint);
}

tr.row-error td {
  background: var(--orange-tint);
}

tr.overbooked .col-days select {
  border-color: var(--error);
  background: var(--error-tint);
}

.col-date {
  white-space: nowrap;
  font-weight: 600;
  width: 92px;
  padding-left: 8px;
}

.col-day {
  width: 44px;
}

/*
 * The week number is written once for the whole week. The cell is rotated so a
 * narrow column still carries a readable label.
 */
.col-week {
  width: 34px;
  text-align: center;
  vertical-align: middle;
  background: var(--white);
  border-right: 2px solid var(--navy-line);
  padding: 0;
}

.col-week.alternate {
  background: var(--paper);
}

.week-label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--navy-soft);
}

.week-number {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--navy-mid);
  line-height: 1.1;
}

.col-cc {
  min-width: 230px;
}

.col-spec {
  min-width: 210px;
}

.col-days {
  width: 74px;
}

.col-loc {
  width: 150px;
}

.col-tasks {
  min-width: 160px;
}

.col-act {
  width: 34px;
}

.flag {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--navy-soft);
}

.flag.ok {
  color: var(--ok);
}

.icon {
  background: none;
  border: 0;
  border-radius: var(--radius);
  color: var(--navy-soft);
  font-size: 15px;
  line-height: 1;
  padding: 4px 6px;
}

.icon:hover {
  background: var(--navy-tint);
  color: var(--navy);
}
</style>
