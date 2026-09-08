<script setup lang="ts">
// The detailed view. Every calendar day holds two rows so a day can be split
// between two cost centres. This mirrors tracker rows 5 to 66.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { CalendarDay, HalfDay } from '@tracker/core'
import { catalogue, dayTotals, dayOptionsFor, dayValueFor, trackerRow } from '@tracker/core'
import { shortDate, weekdayName } from '@/i18n'
import { calendar, clearRow, halfDays, pastTarget } from '@/composables/useTimesheet'
import {
  incomplete,
  rowsOf,
  setDays,
  setSpecification,
  setWorkday,
  shownRows,
  specMismatch,
} from '@/composables/useRowEdit'

import CostCentrePicker from './CostCentrePicker.vue'
import SpecPicker from './SpecPicker.vue'

const { t, locale } = useI18n()

const totalsByDate = computed(() => dayTotals(halfDays.value))

function onDaysChange(entry: HalfDay, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  setDays(entry, value === '' ? null : (Number(value) as 0.5 | 1))
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
  <div class="grid-wrap" data-tour="grid">
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
              'past-target': pastTarget.has(day.date),
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
              <span v-else-if="day.workingWeekend" class="flag">
                {{ t('grid.workingWeekend') }}
              </span>
              <span v-else-if="pastTarget.has(day.date)" class="flag">
                {{ t('grid.notRequired') }}
              </span>
            </td>
            <td v-if="half === 0" :rowspan="rowsShown(day.date)" class="col-day muted">
              {{ weekdayName(locale, day.date) }}
            </td>

            <td class="col-cc" :data-tour="half === 0 && dayIndex === 0 ? 'costCentre' : undefined">
              <CostCentrePicker
                :model-value="entry.workdayId"
                :invalid="incomplete(entry)"
                @update:model-value="setWorkday(entry, $event)"
              />
            </td>
            <td class="col-spec" :data-tour="half === 0 && dayIndex === 0 ? 'specification' : undefined">
              <SpecPicker
                :model-value="entry.specification"
                :workday-id="entry.workdayId"
                :is-default="entry.specificationIsDefault"
                :invalid="specMismatch(entry) || (incomplete(entry) && !entry.specification)"
                @update:model-value="setSpecification(entry, $event)"
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
  overflow: auto;
  max-height: 720px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

/* Grey over the Bright Blue rule. Bright Blue never carries the text itself. */
thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--white);
  color: var(--grey);
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 9px 10px;
  border-bottom: 2px solid var(--bright-blue);
  white-space: nowrap;
}

td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

/* One tbody per calendar week so the week reads as a block. */
tbody.week + tbody.week td {
  border-top: 2px solid var(--warm-grey);
}

tr.day-start td {
  border-top: 1px solid var(--line);
}

tr.non-working td {
  background: var(--tint);
}

/*
 * A working day the target does not ask for. The wash says it without taking a
 * row out of the grid because a user may still book it by hand.
 */
tr.past-target td {
  background: var(--past-target);
}

tr.row-error td {
  background: var(--open);
}

tr.overbooked .col-days select {
  border-color: var(--orange);
  background: var(--open);
}

.col-date {
  white-space: nowrap;
  font-weight: 700;
  width: 92px;
  padding-left: 8px;
}

.col-day {
  width: 44px;
}

/*
 * The week number is written once for the whole week. A narrow column still
 * carries a readable label because the number sits under it.
 */
.col-week {
  width: 34px;
  text-align: center;
  vertical-align: middle;
  background: var(--white);
  border-right: 2px solid var(--warm-grey);
  padding: 0;
}

.col-week.alternate {
  background: var(--tint);
}

.week-label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--grey);
}

.week-number {
  display: block;
  font-size: 15px;
  font-weight: 700;
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

/* Grey holds to white so a flag on the non-working tint takes Smart Blue. */
.flag {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--grey);
}

tr.non-working .flag,
tr.non-working .col-day,
tr.past-target .flag,
tr.past-target .col-day {
  color: var(--smart-blue);
}

.icon {
  background: none;
  border: 0;
  border-radius: var(--radius);
  color: var(--grey);
  font-size: 15px;
  line-height: 1;
  padding: 4px 6px;
}

.icon:hover {
  background: var(--warm-grey);
  color: var(--smart-blue);
}
</style>
