<script setup lang="ts">
// The guided build. Five steps down one sheet.
//
// The numbered steps are the layout because the order is the point. Absence
// must land on the day it was taken. Work may land anywhere. So the days off
// are answered before the projects and the projects take what is left.
//
// Every step stays on the screen after it is answered. A wizard that hides the
// answered step hides the thing the next step is being answered against.

import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { router } from '@/router'

import CostCentrePicker from '@/components/CostCentrePicker.vue'
import GuidedCalendar from '@/components/GuidedCalendar.vue'
import NumberStepper from '@/components/NumberStepper.vue'
import PageTitle from '@/components/PageTitle.vue'
import PeriodBar from '@/components/PeriodBar.vue'
import SpecPicker from '@/components/SpecPicker.vue'
import SummaryPanel from '@/components/SummaryPanel.vue'
import { booked, target } from '@/composables/useTimesheet'
import { setPage, startUnlessSeen } from '@/composables/useTour'
import {
  absenceOptions,
  addRow,
  balanced,
  build,
  built,
  chosen,
  daysOff,
  daysOffBy,
  filled,
  kind,
  kindsInPlay,
  leftToPlace,
  maxFor,
  placing,
  removeRow,
  reset,
  ready,
  rows,
  setCount,
  shareTotal,
  spreadEvenly,
  stillToPlace,
  workTarget,
} from '@/composables/useGuided'

const { t, n } = useI18n()

setPage('guided')
onMounted(() => startUnlessSeen())

function onWorkdayChange(index: number, value: string | null): void {
  const row = rows[index]
  if (!row) return
  row.workdayId = value ?? ''
  row.specification = null
  spreadEvenly()
}

/**
 * Builds the month then opens it.
 *
 * The month view is where a row is corrected so the build lands the user there
 * rather than leaving them a button to press. What the build has to report
 * travels with them because `GuidedResult.vue` reads the same result.
 */
async function buildAndOpen(): Promise<void> {
  await build()
  if (built.value) await openMonthView()
}

/** The month the build wrote is the month view. That is where a row is edited. */
async function openMonthView(): Promise<void> {
  await router.navigate({ to: '/' })
}
</script>

<template>
  <div>
    <PageTitle />

    <div class="stack">
      <PeriodBar />

      <section class="sheet pad">
        <h2 class="eyebrow">{{ t('guided.title') }}</h2>
        <p class="intro">{{ t('guided.intro') }}</p>
      </section>

      <!-- 1. How many days off of each kind. -->
      <section class="sheet pad step" data-tour="guidedDays">
        <h3><span class="no">1</span>{{ t('guided.step1') }}</h3>
        <ul class="kinds">
          <li v-for="option in absenceOptions" :key="option">
            <label>
              <span>{{ option }}</span>
              <NumberStepper
                class="count"
                :model-value="daysOffBy[option] ?? 0"
                :min="0"
                :max="maxFor(option)"
                @update:model-value="setCount(option, $event)"
              />
            </label>
          </li>
        </ul>
        <p class="muted hint">{{ t('guided.step1Hint', { days: n(target) }) }}</p>
      </section>

      <!-- 2. Where those days off are. -->
      <section v-if="daysOff > 0" class="sheet pad step">
        <h3><span class="no">2</span>{{ t('guided.step2') }}</h3>
        <p class="muted hint">
          {{
            stillToPlace > 0
              ? t('guided.step2Left', { count: n(stillToPlace) })
              : t('guided.step2Done', { count: n(chosen.length) })
          }}
        </p>

        <!-- Which absence the next day takes. A month asking for one kind has
             nothing to choose so the switch is not drawn. -->
        <div v-if="kindsInPlay.length > 1" class="switch" data-tour="guidedKind">
          <span id="kind-label">{{ t('guided.absenceType') }}</span>
          <div class="pick" role="group" aria-labelledby="kind-label">
            <button
              v-for="option in kindsInPlay"
              :key="option"
              type="button"
              :class="{ on: placing === option }"
              :aria-pressed="placing === option"
              @click="kind = option"
            >
              {{ option }}
              <span class="num">{{ n(leftToPlace(option)) }}</span>
            </button>
          </div>
        </div>

        <!-- The month as a calendar. A day off is answered on the date it was
             taken so the question is asked on a month rather than on a list.
             Working days alone are offered. The tracker books no weekend and no
             holiday. -->
        <GuidedCalendar data-tour="guidedPlace" />
      </section>

      <!-- 3. Which projects were worked on. -->
      <section class="sheet pad step" data-tour="guidedProjects">
        <h3><span class="no">3</span>{{ t('guided.step3') }}</h3>
        <p class="muted hint">{{ t('guided.step3Hint', { days: n(workTarget) }) }}</p>

        <table v-if="rows.length">
          <thead>
            <tr>
              <th>{{ t('grid.workdayId') }}</th>
              <th>{{ t('grid.specification') }}</th>
              <th class="right">{{ t('simple.percent') }}</th>
              <th>{{ t('grid.tasks') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="index">
              <td>
                <CostCentrePicker
                  :model-value="row.workdayId === '' ? null : row.workdayId"
                  @update:model-value="onWorkdayChange(index, $event)"
                />
              </td>
              <td>
                <SpecPicker
                  v-model="row.specification"
                  :workday-id="row.workdayId === '' ? null : row.workdayId"
                  :is-default="row.specification === null && row.workdayId !== ''"
                />
              </td>
              <td class="right">
                <input v-model.number="row.percent" class="pct num" type="number" min="0" max="100" step="1" />
              </td>
              <td><input v-model="row.tasks" type="text" /></td>
              <td>
                <button type="button" class="icon" :title="t('simple.remove')" @click="removeRow(index)">
                  ×
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="row">
          <button type="button" class="btn" @click="addRow">{{ t('simple.addRow') }}</button>
          <button v-if="filled.length" type="button" class="btn" @click="spreadEvenly">100 / n</button>
          <p v-if="filled.length" :class="balanced ? 'muted total' : 'warn total'">
            {{ t('jira.shareTotal', { total: n(shareTotal) }) }}
          </p>
        </div>
      </section>

      <!-- 4. Build. -->
      <section class="fill" data-tour="guidedBuild">
        <span class="no on-blue">4</span>
        <div class="fig">
          <span>{{ t('guided.willBook') }}</span>
          <b class="num">{{ t('jira.ofTarget', { days: n(booked), target: n(target) }) }}</b>
        </div>
        <div class="say">
          <p v-if="!ready" class="warn">{{ t('guided.notReady') }}</p>
        </div>
        <button type="button" class="btn btn-primary" :disabled="!ready" @click="buildAndOpen">
          {{ t('guided.build') }}
        </button>
      </section>

      <!-- 5. The month it built. The build opens the month view so this is what
           a user coming back to the page finds. -->
      <template v-if="built">
        <section class="sheet pad step">
          <h3><span class="no">5</span>{{ t('guided.step5') }}</h3>
          <p class="muted hint">
            {{
              t('guided.builtSummary', {
                absence: n(built.absenceDays),
                work: n(built.workDays),
              })
            }}
          </p>
          <p v-if="built.shortBy > 0" class="warn">
            {{ t('guided.shortBy', { days: n(built.shortBy) }) }}
          </p>
          <div class="row">
            <button type="button" class="btn btn-primary" @click="openMonthView">
              {{ t('guided.openMonth') }}
            </button>
            <button type="button" class="btn" @click="reset">{{ t('guided.again') }}</button>
          </div>
        </section>

        <SummaryPanel />
      </template>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: 0;
  color: var(--grey);
  font-size: 13px;
  max-width: 82ch;
}

.step h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  font-size: 15px;
}

/* The step number. The order is the whole of what this page adds. */
.no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--smart-blue);
  color: var(--white);
  font-size: 12px;
  font-weight: 700;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
}

/* One count an absence type. The workbook totals the two apart so the month is
   answered the same way rather than built twice. */
.kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 26px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.kinds label {
  display: grid;
  gap: 5px;
  font-size: 13px;
}

/* The arrows stand inside the box so the field is wider than the count needs. */
.count {
  width: 124px;
  font-size: 18px;
}

/* The switch between the two absences. `ViewSwitch.vue` is the same control. */
.switch {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.switch > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.pick {
  display: flex;
  gap: 2px;
  background: var(--warm-grey);
  border-radius: var(--radius);
  padding: 3px;
}

.pick button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: var(--smart-blue);
  border-radius: calc(var(--radius) - 3px);
  padding: 7px 15px;
  font-size: 13px;
}

.pick button.on {
  background: var(--white);
  font-weight: 700;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  margin-bottom: 14px;
}

th,
td {
  text-align: left;
  padding: 5px 8px;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--grey);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 2px solid var(--bright-blue);
}

.right {
  text-align: right;
}

.pct {
  width: 74px;
  text-align: right;
}

.total {
  margin: 0 0 0 auto;
  font-size: 13px;
}

.warn {
  color: var(--orange);
  font-weight: 700;
}

/* The step number on the blue band. The band owns the blue so it inverts. */
.no.on-blue {
  background: var(--white);
  color: var(--smart-blue);
}

/* The build band closes the sheet the way the Jira fill does. */
.fill {
  background: var(--smart-blue);
  color: var(--white);
  border-radius: var(--radius);
  padding: 24px 26px;
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
}

.fill .fig span {
  display: block;
  color: var(--on-blue-label);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 3px;
}

.fill .fig b {
  font-size: 22px;
}

.fill .say {
  max-width: 60ch;
}

.fill .say p {
  margin: 0;
  color: var(--on-blue-body);
  font-size: 13px;
}

.fill .warn {
  color: var(--white);
}

.fill .btn {
  margin-left: auto;
}
</style>
