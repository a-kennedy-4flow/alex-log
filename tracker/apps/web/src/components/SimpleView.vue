<script setup lang="ts">
// Quick fill. The user gives each cost centre a share of the month and the grid
// fills from the first day onwards. Non-working days are skipped.
//
// A share is dragged rather than typed and the month is always whole. What one
// row takes the others give up in the proportion they already held. Because
// a) the arithmetic of making four figures reach a hundred is the complaint the
// `100 / n` button was added for. b) a total that cannot leave a hundred is the
// only answer that removes it rather than checking it afterwards. c) the shares
// are a split of one month and a control that cannot express anything else says
// so. It costs predictability, because one drag rewrites figures the user did
// not touch. `Hold` is what pays that: a settled row is held out of the
// balancing. See `mockups/s2-balance.html` and the five it beat.

import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Allocation } from '@tracker/core'
import { balanceShares, distribute, halvesPerAllocation, percentTotal } from '@tracker/core'
import {
  calendar,
  halfDays,
  profile,
  projectMixOfPreviousSheet,
  target,
  workingDays,
} from '@/composables/useTimesheet'

import CostCentrePicker from './CostCentrePicker.vue'
import SpecPicker from './SpecPicker.vue'

const { t } = useI18n()

function blankRow(): Allocation {
  return {
    workdayId: '',
    specification: null,
    percent: 0,
    location: profile.location,
    tasks: null,
  }
}

// The previous month seeds the mix. The spec calls the saved sheets the default.
function seed(): Allocation[] {
  const mix = projectMixOfPreviousSheet()
  if (mix.length === 0) return [blankRow()]
  const share = Math.floor(100 / mix.length)
  return mix.map((entry, index) => ({
    workdayId: entry.workdayId,
    specification: entry.specification,
    percent: index === 0 ? 100 - share * (mix.length - 1) : share,
    location: profile.location,
    tasks: null,
  }))
}

const rows = ref<Allocation[]>(seed())
const applied = ref(false)

/**
 * True once the user has moved a share. Until then the shares are kept even so
 * a cost centre added to the list is usable straight away. After it the shares
 * are theirs and only a drag on one of them moves the rest.
 */
const sharesAreTheirs = ref(false)

/**
 * The rows the user has settled. A held row is not touched by the balancing.
 *
 * The row itself is held rather than its position, because removing a cost
 * centre shifts every index below it and the hold would then move to a row
 * nobody pinned.
 */
const held = reactive(new Set<Allocation>())

const ready = computed(() => rows.value.filter((r) => r.workdayId !== ''))
const total = computed(() => percentTotal(ready.value))
const balanced = computed(() => Math.round(total.value) === 100)

/** Days each share works out to once rounded onto a half day boundary. */
const daysPerRow = computed(() => {
  const halves = halvesPerAllocation(ready.value, target.value)
  return halves.map((h) => h / 2)
})

function daysOf(row: Allocation): number | null {
  const index = ready.value.indexOf(row)
  return index === -1 ? null : (daysPerRow.value[index] ?? null)
}

function add(): void {
  rows.value.push(blankRow())
  applied.value = false
}

function remove(index: number): void {
  const row = rows.value[index]
  if (row) held.delete(row)
  rows.value.splice(index, 1)
  if (rows.value.length === 0) rows.value.push(blankRow())
  rebalance()
  applied.value = false
}

function toggleHold(row: Allocation): void {
  if (held.has(row)) held.delete(row)
  else held.add(row)
}

/** The held rows by their place in the filled list. What the balancing skips. */
function holdsBySlot(): Set<number> {
  const out = new Set<number>()
  ready.value.forEach((row, at) => {
    if (held.has(row)) out.add(at)
  })
  return out
}

/** Writes the shares the balancing worked out back onto the rows. */
function writeBack(shares: number[]): void {
  ready.value.forEach((row, at) => (row.percent = shares[at] ?? 0))
}

/**
 * Sets one share then hands the rest of the hundred to the rows that are
 * neither held nor the one being dragged.
 */
function setShare(row: Allocation, value: number): void {
  const list = ready.value
  const at = list.indexOf(row)
  if (at === -1) return
  sharesAreTheirs.value = true
  applied.value = false
  row.percent = value
  writeBack(balanceShares(list.map((r) => r.percent), at, holdsBySlot()))
}

function onShare(row: Allocation, event: Event): void {
  setShare(row, Number((event.target as HTMLInputElement).value))
}

/**
 * Splits 100 across the filled rows. The remainder goes to the first so the
 * total lands exactly on 100 rather than on 99 or 102.
 */
function spreadEvenly(): void {
  const list = ready.value
  if (list.length === 0) return
  const share = Math.floor(100 / list.length)
  list.forEach((row, index) => {
    row.percent = index === 0 ? 100 - share * (list.length - 1) : share
  })
  applied.value = false
}

/**
 * Called whenever the set of filled rows changes. Nothing was dragged so what
 * the row that left held goes back to the others in proportion.
 */
function rebalance(): void {
  if (!sharesAreTheirs.value) {
    spreadEvenly()
    return
  }
  if (ready.value.length === 0) return
  writeBack(balanceShares(ready.value.map((r) => r.percent), null, holdsBySlot()))
}

/** The button hands the shares back to the app. Every hold goes with them. */
function resetShares(): void {
  sharesAreTheirs.value = false
  held.clear()
  spreadEvenly()
}

function apply(): void {
  halfDays.value = distribute(ready.value, calendar.value, target.value)
  applied.value = true
}

function onWorkdayChange(row: Allocation, value: string | null): void {
  row.workdayId = value ?? ''
  row.specification = null
  // Filling or emptying a row changes how many ways 100 has to split.
  rebalance()
  applied.value = false
}
</script>

<template>
  <section data-tour="quickRows">
    <h2>{{ t('simple.title') }}</h2>
    <p class="muted intro">{{ t('simple.intro') }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-cc">{{ t('grid.workdayId') }}</th>
            <th class="col-spec">{{ t('grid.specification') }}</th>
            <th class="col-pct">{{ t('simple.percent') }}</th>
            <th class="col-days">{{ t('simple.days') }}</th>
            <th class="col-tasks">{{ t('grid.tasks') }}</th>
            <th class="col-act"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td>
              <CostCentrePicker
                :model-value="row.workdayId === '' ? null : row.workdayId"
                @update:model-value="onWorkdayChange(row, $event)"
              />
            </td>
            <td>
              <SpecPicker
                v-model="row.specification"
                :workday-id="row.workdayId === '' ? null : row.workdayId"
                :is-default="row.specification === null && row.workdayId !== ''"
              />
            </td>
            <td>
              <div class="pct" :data-tour="index === 0 ? 'quickShare' : undefined">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="row.percent"
                  :disabled="row.workdayId === ''"
                  :aria-label="t('simple.percent')"
                  @input="onShare(row, $event)"
                />
                <span class="under">
                  <button
                    type="button"
                    class="hold"
                    :aria-pressed="held.has(row)"
                    :disabled="row.workdayId === ''"
                    :title="t('simple.holdHint')"
                    @click="toggleHold(row)"
                  >
                    {{ t('simple.hold') }}
                  </button>
                  <b class="num pc" :class="{ auto: !sharesAreTheirs && row.workdayId !== '' }">
                    {{ row.percent }} %
                  </b>
                </span>
              </div>
            </td>
            <td class="num days">{{ daysOf(row) ?? '' }}</td>
            <td><input v-model="row.tasks" type="text" /></td>
            <td>
              <button type="button" class="icon" :title="t('simple.remove')" @click="remove(index)">
                ×
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">
              <button type="button" class="btn" @click="add">{{ t('simple.addRow') }}</button>
              <button type="button" class="btn spread" data-tour="quickSpread" @click="resetShares">100 / n</button>
            </td>
            <td class="num total" :class="{ off: !balanced }">{{ total }} %</td>
            <td class="num total">{{ target }}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="!balanced && ready.length > 0" class="warn">{{ t('simple.mustBe100') }}</p>

    <footer>
      <p class="muted note">
        {{ t('header.workingDays') }}: <span class="num">{{ workingDays }}</span>
        &middot; {{ t('header.target') }}: <span class="num">{{ target }}</span>
      </p>
      <p class="muted note">{{ t('simple.applyWarning') }}</p>
      <button
        type="button"
        class="btn btn-primary"
        data-tour="quickApply"
        :disabled="!balanced || ready.length === 0"
        @click="apply"
      >
        {{ t('simple.apply') }}
      </button>
      <p v-if="applied" class="ok">{{ t('simple.applied') }}</p>
    </footer>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0;
  max-width: 70ch;
}

/*
 * This section is a grid item of the month box so it holds its own content
 * width until it is told not to. The table below then pushed the sheet wider
 * than the page.
 */
section {
  min-width: 0;
}

/*
 * The section scrolls the table rather than the sheet clipping it.
 *
 * Five columns hold 674px and the month box beside the aside is 656px at a
 * 1280px window. The sheet carries `overflow: hidden` so without this the
 * tasks column and the remove button were cut off the screen with nothing
 * saying they were there. `MonthGrid.vue` answers its own width the same way.
 */
.table-wrap {
  overflow-x: auto;
}

/*
 * The slider costs the share column 50px. Five columns held 674px and they hold
 * 684px now, because the specification column gives 40px of the 50 back.
 *
 * The figure is what the width is spent on. Measured in the running app at a
 * 1440px window the section gives the table 732px and the cost centre column
 * takes 321px of it on a long name. A one line share cell of 230px put the
 * figure 43px past the edge, so the value the user was dragging sat in the part
 * of the table that scrolls. `.table-wrap` still scrolls the tasks column and
 * the remove button the way it did before.
 */
table {
  width: 100%;
  min-width: 684px;
  border-collapse: collapse;
}

th {
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--grey);
  padding: 4px 6px;
  border-bottom: 1px solid var(--warm-grey);
}

td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--warm-grey);
  vertical-align: middle;
}

tfoot td {
  border-bottom: 0;
  padding-top: 10px;
}

.col-cc {
  min-width: 240px;
}

/* 40px of what the share column took. A specification is a select and it cuts
   its own label where a picker trigger would push the column wider. */
.col-spec {
  min-width: 180px;
}

/*
 * `min-width` rather than `width`. An auto laid out table treats a width as a
 * suggestion and squeezes it for whichever column asks for more, which took the
 * share column to 107px and the track down to 95px with it. A minimum holds.
 */
.col-pct {
  min-width: 160px;
}

.col-days {
  width: 70px;
}

.col-act {
  width: 34px;
}

/*
 * Two lines rather than one. The track has the first to itself so a per cent is
 * 1.5px of it rather than 0.8px, and the hold and the figure share the second.
 * A cell holding all three side by side ran the figure off the visible table.
 */
.pct {
  display: grid;
  gap: 2px;
}

.pct input {
  width: 100%;
}

.under {
  display: flex;
  align-items: center;
  gap: 8px;
}

/*
 * The hold. A settled share is held out of the balancing so the next drag on
 * another row cannot move it.
 *
 * Grey holds 4.61 to 1 on the white sheet. It may not sit on the Warm Grey of a
 * control, which is why the button is white with an edge rather than filled.
 */
.hold {
  flex: none;
  border: 1px solid var(--warm-grey);
  background: var(--white);
  color: var(--grey);
  border-radius: var(--radius);
  padding: 3px 9px;
  font-size: 12px;
  line-height: 1.5;
}

.hold:hover:not(:disabled) {
  border-color: var(--bright-blue);
  color: var(--smart-blue);
}

.hold[aria-pressed='true'] {
  background: var(--smart-blue);
  border-color: var(--smart-blue);
  color: var(--white);
}

.hold:disabled {
  opacity: 0.45;
  cursor: default;
}

/* Tabular digits at a fixed width so the row does not shift as the drag moves
   the figure between one and three characters. */
.pc {
  margin-left: auto;
  min-width: 5ch;
  text-align: right;
  font-weight: 700;
}

/* Split by the app rather than dragged. Matches the default specification. The
   figure carries it now that the control is a track rather than a box. */
.pc.auto {
  font-weight: 400;
  font-style: italic;
}

.days,
.total {
  text-align: right;
  font-weight: 600;
}

.total.off {
  color: var(--smart-blue);
}

.spread {
  margin-left: 8px;
}

.warn {
  color: var(--smart-blue);
  background: var(--open);
  border-radius: var(--radius);
  padding: 6px 10px;
}

.ok {
  color: var(--smart-blue);
  margin: 0;
}

footer {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--warm-grey);
}

.note {
  margin: 0;
}

footer .btn-primary {
  margin-left: auto;
}

.icon {
  background: none;
  border: 0;
  border-radius: var(--radius);
  color: var(--grey);
  font-size: 16px;
  padding: 4px 6px;
}

.icon:hover {
  background: var(--warm-grey);
  color: var(--smart-blue);
}
</style>
