<script setup lang="ts">
// Year and month and location for the sheet plus the running totals.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { catalogue } from '@timesheets/core'
import { LOCALES, monthName, setLocale, type LocaleCode } from '@/i18n'
import {
  booked,
  contractDays,
  month,
  monthOverride,
  profile,
  saveSheet,
  target,
  workingDays,
  year,
} from '@/composables/useTimesheet'

const { t, locale } = useI18n()

const YEARS = [2024, 2025, 2026, 2027]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

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
  setLocale((event.target as HTMLSelectElement).value as LocaleCode)
}
</script>

<template>
  <div class="bar card" data-tour="period">
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

    <dl class="stats">
      <div>
        <dt>{{ t('header.workingDays') }}</dt>
        <dd class="num">{{ workingDays }}</dd>
      </div>
      <div class="target" data-tour="target">
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
      <div>
        <dt>{{ t('header.total') }}</dt>
        <dd class="num" :class="{ off: delta !== 0 }">{{ booked }}</dd>
      </div>
    </dl>

    <div class="actions">
      <button type="button" class="btn" @click="saveSheet">{{ t('setup.save') }}</button>
      <label class="field">
        <span>{{ t('common.language') }}</span>
        <select :value="locale" @change="onLocaleChange">
          <option v-for="option in LOCALES" :key="option.code" :value="option.code">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--gap);
  padding: 12px 16px;
}

.field {
  display: grid;
  gap: 2px;
  min-width: 110px;
}

.field.wide {
  min-width: 220px;
}

/* A required field that is empty is marked where it is rather than only in the
   checks panel. */
select.missing {
  border-color: var(--error);
  background: var(--error-tint);
}

.field > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--navy-soft);
}

.stats {
  display: flex;
  gap: 18px;
  margin: 0 0 0 auto;
}

.stats div {
  text-align: right;
}

dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--navy-soft);
}

dd {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

dd.off {
  color: var(--orange-dark);
}

.target dd {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* The target reads as a figure until it is edited so it matches its neighbours. */
input.override {
  width: 68px;
  text-align: right;
  font-size: 18px;
  font-weight: 600;
  padding: 0 4px;
  border-color: transparent;
  background: transparent;
}

input.override:hover,
input.override:focus {
  border-color: var(--navy-line);
  background: var(--white);
}

/* Dashed while the contract decides. Solid once this month is overridden. */
input.override.auto {
  color: var(--navy-mid);
  font-style: italic;
}

input.override.auto::placeholder {
  color: var(--navy-mid);
  opacity: 1;
  font-style: italic;
}

.reset {
  border: 0;
  background: none;
  color: var(--navy-soft);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: var(--radius);
}

.reset:hover {
  background: var(--navy-tint);
  color: var(--navy);
}

.actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
</style>
