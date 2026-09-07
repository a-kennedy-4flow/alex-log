<script setup lang="ts">
// The head of the sheet. The period and the location and the view on the left.
// The running figures on the right.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { catalogue } from '@tracker/core'
import { LOCALES, monthName, type LocaleCode } from '@/i18n'
import {
  booked,
  chooseLocale,
  contractDays,
  month,
  monthOverride,
  profile,
  saveProfile,
  saveSheet,
  target,
  workingDays,
  year,
} from '@/composables/useTimesheet'
import { view, type MonthView } from '@/composables/useView'

const { t, locale } = useI18n()

const YEARS = [2024, 2025, 2026, 2027]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const VIEWS: { value: MonthView; key: string }[] = [
  { value: 'grid', key: 'view.grid' },
  { value: 'board', key: 'view.board' },
]

const delta = computed(() => Math.round((booked.value - target.value) * 2) / 2)

const targetId = 'target-override'

/**
 * The expected days for this month alone. Empty hands the month back to the
 * contract percentage. Tracker cell B8 carries whatever ends up here.
 */
function onOverride(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  monthOverride.value = raw === '' ? null : Number(raw)
}

function onLocaleChange(event: Event): void {
  chooseLocale((event.target as HTMLSelectElement).value as LocaleCode)
  void saveProfile()
}
</script>

<template>
  <div class="bar sheet pad" data-tour="period">
    <label class="field">
      <span>{{ t('header.year') }}</span>
      <select v-model.number="year">
        <option v-for="value in YEARS" :key="value" :value="value">{{ value }}</option>
      </select>
    </label>

    <label class="field">
      <span>{{ t('header.month') }}</span>
      <select v-model.number="month">
        <option v-for="value in MONTHS" :key="value" :value="value">
          {{ monthName(locale, value) }}
        </option>
      </select>
    </label>

    <label class="field wide">
      <span>{{ t('header.location') }}</span>
      <select v-model="profile.location" :class="{ missing: profile.location === null }">
        <option :value="null">{{ t('common.none') }}</option>
        <option v-for="place in catalogue.locations" :key="place.code" :value="place.code">
          {{ place.code }}
        </option>
      </select>
    </label>

    <label class="field">
      <span>{{ t('common.language') }}</span>
      <select :value="locale" @change="onLocaleChange">
        <option v-for="option in LOCALES" :key="option.code" :value="option.code">
          {{ option.label }}
        </option>
      </select>
    </label>

    <div class="field" data-tour="view">
      <span id="view-label">{{ t('view.title') }}</span>
      <div class="views" role="group" aria-labelledby="view-label">
        <button
          v-for="option in VIEWS"
          :key="option.value"
          type="button"
          :class="{ on: view === option.value }"
          :aria-pressed="view === option.value"
          @click="view = option.value"
        >
          {{ t(option.key) }}
        </button>
      </div>
    </div>

    <button type="button" class="btn save" @click="saveSheet">{{ t('setup.save') }}</button>

    <dl class="stats">
      <div class="stat">
        <dt>{{ t('header.workingDays') }}</dt>
        <dd class="num">{{ workingDays }}</dd>
      </div>
      <div class="stat target" data-tour="target">
        <dt>
          <label :for="targetId">{{ t('header.target') }}</label>
        </dt>
        <dd>
          <input
            :id="targetId"
            :value="monthOverride ?? ''"
            type="number"
            min="0"
            max="31"
            step="0.5"
            class="num override"
            :class="{ auto: monthOverride === null }"
            :placeholder="String(contractDays)"
            :title="t('header.targetHint')"
            @input="onOverride"
          />
          <button
            v-if="monthOverride !== null"
            type="button"
            class="reset"
            :title="t('header.targetReset')"
            @click="monthOverride = null"
          >
            ×
          </button>
        </dd>
      </div>
      <div class="stat">
        <dt>{{ t('header.total') }}</dt>
        <dd class="num" :class="{ off: delta !== 0 }">{{ booked }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}

.field {
  display: grid;
  gap: 3px;
  min-width: 130px;
}

.field.wide {
  min-width: 200px;
}

.field > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

/* A required field that is empty is marked where it is rather than only in the
   checks panel. */
select.missing {
  border-color: var(--orange);
  background: var(--open);
}

/* The switch. Both views edit one month so they share the route. */
.views {
  display: flex;
  gap: 2px;
  background: var(--warm-grey);
  border-radius: var(--radius);
  padding: 3px;
}

.views button {
  border: 0;
  background: none;
  color: var(--smart-blue);
  border-radius: calc(var(--radius) - 3px);
  padding: 7px 15px;
  font-size: 13px;
}

.views button.on {
  background: var(--white);
  font-weight: 700;
}

.save {
  align-self: flex-end;
}

/* The figures read left to right in one line. */
.stats {
  display: flex;
  margin: 0 0 0 auto;
}

.stat {
  padding: 0 20px;
  border-left: 1px solid var(--warm-grey);
  text-align: right;
}

.stat:first-child {
  border-left: none;
}

.stat:last-child {
  padding-right: 0;
}

dt {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

dd {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 700;
}

/*
 * Vibrant Orange on white reaches 3.32 to 1. That clears the 3 to 1 large text
 * needs and this figure is 22px bold. It is the one place orange carries a word.
 */
dd.off {
  color: var(--orange);
}

.target dd {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

/* The target reads as a figure until it is edited so it matches its neighbours. */
input.override {
  width: 72px;
  text-align: right;
  font-size: 22px;
  font-weight: 700;
  padding: 0 4px;
  background: transparent;
}

input.override:hover,
input.override:focus {
  background: var(--warm-grey);
}

/* Italic while the contract decides. Upright once this month is overridden. */
input.override.auto,
input.override.auto::placeholder {
  color: var(--smart-blue);
  opacity: 1;
  font-style: italic;
}

.reset {
  border: 0;
  background: none;
  color: var(--grey);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: var(--radius);
}

.reset:hover {
  background: var(--warm-grey);
  color: var(--smart-blue);
}
</style>
