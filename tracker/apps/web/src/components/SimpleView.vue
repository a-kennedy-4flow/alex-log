<script setup lang="ts">
// Quick fill. The user gives each cost centre a share of the month and the grid
// fills from the first day onwards. Non-working days are skipped.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Allocation } from '@tracker/core'
import { distribute, halvesPerAllocation, percentTotal } from '@tracker/core'
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
 * True once the user has typed a share. Until then the shares are kept even so
 * a cost centre added to the list is usable straight away. After it the shares
 * are theirs and nothing rewrites them.
 */
const sharesAreTheirs = ref(false)

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
  rows.value.splice(index, 1)
  if (rows.value.length === 0) rows.value.push(blankRow())
  respreadUnlessTheirs()
  applied.value = false
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

/** Called whenever the set of filled rows changes. */
function respreadUnlessTheirs(): void {
  if (sharesAreTheirs.value) return
  spreadEvenly()
}

function onPercentInput(): void {
  sharesAreTheirs.value = true
  applied.value = false
}

/** The button hands the shares back to the app. */
function resetShares(): void {
  sharesAreTheirs.value = false
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
  respreadUnlessTheirs()
  applied.value = false
}
</script>

<template>
  <section data-tour="quickRows">
    <h2>{{ t('simple.title') }}</h2>
    <p class="muted intro">{{ t('simple.intro') }}</p>

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
                v-model.number="row.percent"
                type="number"
                min="0"
                max="100"
                step="1"
                :class="{ auto: !sharesAreTheirs && row.workdayId !== '' }"
                @input="onPercentInput"
              />
              <span class="muted">%</span>
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

table {
  width: 100%;
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

.col-spec {
  min-width: 220px;
}

.col-pct {
  width: 110px;
}

.col-days {
  width: 70px;
}

.col-act {
  width: 34px;
}

.pct {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Split by the app rather than typed. Matches the default specification. */
.pct input.auto {
  border-style: dashed;
  border-color: var(--grey);
  background: var(--warm-grey);
  color: var(--smart-blue);
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
