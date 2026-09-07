<script setup lang="ts">
// The month drawn as a calendar board.
//
// Seven columns and one cell a day. The board holds no timesheet state of its
// own. It reads the same grid the detailed view writes and it computes a day
// with the same core helpers, so the two views cannot disagree on a total.
//
// A cell opens a popover carrying every field a grid row carries. The month
// stays whole behind it.

import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { CalendarDay, HalfDay } from '@tracker/core'
import { catalogue, dayOptionsFor, isAbsence, rowToDay } from '@tracker/core'
import { weekdayName } from '@/i18n'
import { calendar, halfDays, issues, pastTarget, rowsByDate } from '@/composables/useTimesheet'
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

/** Monday first. Any Monday will do because only the name is wanted. */
const WEEK_START = '2024-01-01'

const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${WEEK_START}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + i)
    return weekdayName(locale.value, date.toISOString().slice(0, 10))
  }),
)

/**
 * The board laid out week by week. Day one lands in its own weekday column so
 * the month leads with blank cells. The tail is padded for the same reason.
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

/* ---------- chips ---------- */

/**
 * A theme line down the edge of a Warm Grey chip tells one cost centre from
 * another. No shade is invented so no brand owner has to approve anything. A
 * line may be Bright Blue where text may not.
 *
 * Five lines separate. A sixth cost centre falls back to the plain chip and the
 * number does the work. The one cost is Vibrant Orange. It is reserved for the
 * primary action so the fifth line spends that reservation. Dropping it leaves
 * four.
 */
const LINES = 5

/** Order of first appearance in the month. */
const lineOf = computed(() => {
  const order = new Map<string, number>()
  for (const half of halfDays.value) {
    if (half.workdayId === null) continue
    if (!order.has(half.workdayId)) order.set(half.workdayId, order.size)
  }
  return order
})

function lineClass(workdayId: string | null): string {
  const at = workdayId === null ? undefined : lineOf.value.get(workdayId)
  return at !== undefined && at < LINES ? `line-${at}` : ''
}

/** The cost centres the month books. The legend names the lines. */
const legend = computed(() =>
  [...lineOf.value.keys()].map((id) => ({ id, line: lineClass(id) })),
)

function chipsOf(date: string): HalfDay[] {
  return (rowsByDate.value.get(date) ?? []).filter((row) => row.workdayId !== null)
}

function bookedOn(date: string): number {
  return chipsOf(date).reduce((sum, row) => sum + (row.days ?? 0), 0)
}

/** A working day with nothing on it. That is where the missing day is found. */
function isFree(date: string, nonWorking: boolean): boolean {
  return !nonWorking && bookedOn(date) < 1
}

/* ---------- what the checks point at ---------- */

/**
 * The dates a validation issue names. An issue carries tracker rows so each one
 * is turned back into a day of the month.
 */
const flagged = computed(() => {
  const dates = new Set<string>()
  for (const issue of issues.value) {
    for (const row of issue.rows ?? []) {
      const at = rowToDay(Number(row))
      const day = at ? calendar.value[at.dayOfMonth - 1] : undefined
      if (day) dates.add(day.date)
    }
  }
  return dates
})

/* ---------- the popover ---------- */

const open = ref<string | null>(null)
const board = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)

/**
 * One cell of the board. It is read from the document rather than collected
 * into an array, because a ref callback inside a nested `v-for` appends on
 * every render and the array then holds the same cell many times over.
 */
function cellAt(dayOfMonth: number): HTMLButtonElement | null {
  return board.value?.querySelector<HTMLButtonElement>(`[data-day="${dayOfMonth}"]`) ?? null
}

function openCell(date: string): void {
  open.value = open.value === date ? null : date
}

/** Closing hands focus back to the cell that opened it. */
function close(): void {
  const date = open.value
  open.value = null
  if (!date) return
  const day = calendar.value.find((d) => d.date === date)
  if (day) void nextTick(() => cellAt(day.dayOfMonth)?.focus())
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function focusablesInPopover(): HTMLElement[] {
  const root = popover.value
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'))
}

// The popover sits above the board so focus has to be held inside it. Otherwise
// Tab walks the rest of the month behind an open day.
function onPopoverKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const items = focusablesInPopover()
  const first = items[0]
  const last = items.at(-1)
  if (!first || !last) return
  const target = event.target as HTMLElement
  if (event.shiftKey && target === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && target === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(open, async (date) => {
  if (!date) return
  await nextTick()
  focusablesInPopover()[0]?.focus()
})

/**
 * A popover near the right edge of the sheet would run off it. The last two
 * columns open to the left instead. The weekday decides so nothing is measured.
 */
function flipped(weekday: number): boolean {
  return weekday >= 6
}

/* ---------- keyboard ---------- */

/**
 * Arrow movement across the cells. A board of buttons gives none of this while
 * the detailed view gets it free from the table with its form controls.
 */
function onCellKeydown(event: KeyboardEvent, dayOfMonth: number): void {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
  if (step === undefined) return
  const target = cellAt(dayOfMonth + step)
  if (!target) return
  event.preventDefault()
  target.focus()
}

/* ---------- the fields ---------- */

function onDaysChange(entry: HalfDay, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  setDays(entry, value === '' ? null : (Number(value) as 0.5 | 1))
}

function clearHalf(entry: HalfDay): void {
  setWorkday(entry, null)
}

function halfLabel(entry: HalfDay): string {
  return entry.half === 0 ? t('board.upperHalf') : t('board.lowerHalf')
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}
</script>

<template>
  <div ref="board" class="wrap sheet pad" data-tour="board">
    <div v-if="legend.length" class="legend">
      <span class="lab">{{ t('board.legend') }}</span>
      <span class="chips">
        <span v-for="entry in legend" :key="entry.id" class="chip" :class="entry.line">
          <b class="num">{{ isAbsence(entry.id) ? t('picker.absence') : entry.id }}</b>
        </span>
      </span>
    </div>

    <table class="board">
      <caption class="visually-hidden">{{ t('board.caption') }}</caption>
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
            :class="{
              blank: !day,
              off: day?.nonWorking,
              'past-target': day ? pastTarget.has(day.date) : false,
              flagged: day ? flagged.has(day.date) : false,
              opened: day ? open === day.date : false,
            }"
          >
            <template v-if="day">
              <button
                type="button"
                class="cell"
                :data-day="day.dayOfMonth"
                :data-tour="day.dayOfMonth === 1 ? 'boardCell' : undefined"
                :aria-expanded="open === day.date"
                :aria-label="longDate(day.date)"
                @click="openCell(day.date)"
                @keydown="onCellKeydown($event, day.dayOfMonth)"
              >
                <span class="top">
                  <span class="d num">{{ day.dayOfMonth }}</span>
                  <span v-if="day.holiday" class="lab">{{ t('grid.holiday') }}</span>
                  <span v-else-if="day.workingWeekend" class="lab">
                    {{ t('grid.workingWeekend') }}
                  </span>
                  <span v-else-if="pastTarget.has(day.date)" class="lab">
                    {{ t('grid.notRequired') }}
                  </span>
                </span>

                <span class="chips">
                  <span
                    v-for="row in chipsOf(day.date)"
                    :key="row.half"
                    class="chip"
                    :class="[lineClass(row.workdayId), { bad: incomplete(row) || specMismatch(row) }]"
                  >
                    <b class="num">{{ isAbsence(row.workdayId) ? t('picker.absence') : row.workdayId }}</b>
                    <i class="num">{{ row.days ?? '—' }}</i>
                  </span>
                </span>

                <span v-if="isFree(day.date, day.nonWorking)" class="add" aria-hidden="true">+</span>
              </button>

              <div
                v-if="open === day.date"
                :ref="(el) => { popover = el as HTMLElement | null }"
                class="pop"
                :class="{ flip: flipped(day.weekday) }"
                role="dialog"
                :aria-label="longDate(day.date)"
                @keydown="onPopoverKeydown"
              >
                <h3>{{ longDate(day.date) }}</h3>

                <section v-for="entry in shownRows(day.date)" :key="entry.half" class="half">
                  <p v-if="shownRows(day.date).length > 1" class="which">{{ halfLabel(entry) }}</p>

                  <label class="ed">
                    <span>{{ t('grid.workdayId') }}</span>
                    <CostCentrePicker
                      :model-value="entry.workdayId"
                      :invalid="incomplete(entry)"
                      @update:model-value="setWorkday(entry, $event)"
                    />
                  </label>

                  <label class="ed">
                    <span>{{ t('grid.specification') }}</span>
                    <SpecPicker
                      :model-value="entry.specification"
                      :workday-id="entry.workdayId"
                      :is-default="entry.specificationIsDefault"
                      :invalid="specMismatch(entry) || (incomplete(entry) && !entry.specification)"
                      @update:model-value="setSpecification(entry, $event)"
                    />
                  </label>

                  <div class="two">
                    <label class="ed">
                      <span>{{ t('grid.days') }}</span>
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
                    </label>
                    <label class="ed">
                      <span>{{ t('grid.location') }}</span>
                      <select v-model="entry.location" :disabled="!entry.workdayId">
                        <option :value="null"></option>
                        <option
                          v-for="place in catalogue.locations"
                          :key="place.code"
                          :value="place.code"
                        >
                          {{ place.code }}
                        </option>
                      </select>
                    </label>
                  </div>

                  <label class="ed">
                    <span>{{ t('grid.tasks') }}</span>
                    <input v-model="entry.tasks" type="text" :disabled="!entry.workdayId" />
                  </label>

                  <button
                    v-if="entry.workdayId"
                    type="button"
                    class="btn clear"
                    @click="clearHalf(entry)"
                  >
                    {{ t('grid.clearRow') }}
                  </button>
                </section>

                <button type="button" class="btn btn-primary done" @click="close">
                  {{ t('board.close') }}
                </button>
              </div>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  align-items: center;
  padding: 0 0 14px;
}

.legend .lab {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.legend .chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.legend .chip {
  font-size: 11px;
  padding: 3px 9px;
}

/* Line weight divides the cells because the sheet carries no card. */
.board {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border-top: 1px solid var(--warm-grey);
  border-left: 1px solid var(--warm-grey);
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
  position: relative;
}

td.blank,
td.off {
  background: var(--tint);
}

/* A working day the target does not ask for. It is still open to a hand entry. */
td.past-target {
  background: var(--past-target);
}

td.opened {
  background: var(--open);
}

/* A day the checks point at. Vibrant Orange marks it without carrying text. */
td.flagged {
  box-shadow: inset 3px 0 0 var(--orange);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-height: 108px;
  padding: 9px 10px;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  font: inherit;
}

.top {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.d {
  font-weight: 700;
  font-size: 16px;
}

/* Weight recedes a non-working day. Colour cannot because Grey fails on a tint. */
td.off .d {
  font-weight: 400;
}

.lab {
  font-size: 11px;
  line-height: 1.25;
}

.cell .chips {
  display: grid;
  gap: 5px;
}

/* Decision 2 option B. A Warm Grey chip with a theme line down its edge. */
.chip {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--warm-grey);
  color: var(--smart-blue);
  border-left: 4px solid transparent;
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 4px 9px;
  font-size: 12px;
}

.chip b {
  font-weight: 700;
}

.chip i {
  margin-left: auto;
  font-style: normal;
  font-weight: 700;
}

/* Smart Blue then Bright Blue then Grey then Vibrant Orange then Bold Pink. */
.chip.line-0 {
  border-left-color: var(--smart-blue);
}

.chip.line-1 {
  border-left-color: var(--bright-blue);
}

.chip.line-2 {
  border-left-color: var(--grey);
}

.chip.line-3 {
  border-left-color: var(--orange);
}

.chip.line-4 {
  border-left-color: var(--pink);
}

.chip.bad {
  background: var(--open);
  box-shadow: inset 0 0 0 1px var(--orange);
}

.add {
  margin-top: auto;
  border: 1px dashed var(--dash);
  border-radius: var(--radius);
  color: var(--grey);
  text-align: center;
  padding: 5px 0;
  font-size: 15px;
}

.cell:hover .add {
  border-color: var(--orange);
}

/* Grey falls to 4.22 on the wash so the affordance takes Smart Blue there. */
td.past-target .add {
  color: var(--smart-blue);
}

/* A 1px Smart Blue edge stands in for the shadow F does not use. */
.pop {
  position: absolute;
  top: calc(100% - 6px);
  left: -1px;
  width: 300px;
  z-index: 5;
  background: var(--white);
  border: 1px solid var(--smart-blue);
  border-radius: var(--radius);
  padding: 16px 18px;
  text-align: left;
}

.pop.flip {
  left: auto;
  right: -1px;
}

.pop h3 {
  margin: 0 0 12px;
  font-size: 14px;
}

.half + .half {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--warm-grey);
}

.which {
  margin: 0 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.ed {
  display: grid;
  gap: 3px;
  margin-bottom: 10px;
}

.ed > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.clear {
  width: 100%;
}

.done {
  width: 100%;
  margin-top: 14px;
}

@media (max-width: 900px) {
  .pop {
    width: 260px;
  }
}
</style>
