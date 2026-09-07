<script setup lang="ts">
// The questions asked on first login.
//
// The same answers live on the settings page. They are asked here one at a time
// because a new user meets them before they have any reason to care. The
// language comes first so the rest is read in it.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { catalogue } from '@tracker/core'
import { LOCALES, type LocaleCode } from '@/i18n'
import {
  chooseLocale,
  contractDays,
  profile,
  saveProfile,
  suggestedEntity,
  workingDays,
} from '@/composables/useTimesheet'
import { closeWizard } from '@/composables/useWizard'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { t, locale } = useI18n()

const STEPS = ['language', 'place', 'contract', 'reminder'] as const

const step = ref(0)
const saving = ref(false)

const current = computed(() => STEPS[step.value])
const isLast = computed(() => step.value === STEPS.length - 1)

/** The location fixes the bank holidays so no later answer means anything. */
const blocked = computed(() => current.value === 'place' && profile.location === null)

function onLocationChange(): void {
  if (!profile.entity && suggestedEntity.value) profile.entity = suggestedEntity.value
}

function back(): void {
  if (step.value > 0) step.value--
}

async function forward(): Promise<void> {
  if (blocked.value) return
  if (!isLast.value) {
    step.value++
    return
  }
  saving.value = true
  try {
    await saveProfile()
  } finally {
    saving.value = false
  }
  closeWizard()
}
</script>

<template>
  <div class="backdrop">
    <section class="sheet pad wizard" role="dialog" aria-modal="true">
      <header>
        <h2>{{ t('wizard.title') }}</h2>
        <p class="muted">{{ t('wizard.step', { n: step + 1, total: STEPS.length }) }}</p>
        <ol class="dots">
          <li v-for="(name, at) in STEPS" :key="name" :class="{ done: at < step, now: at === step }" />
        </ol>
      </header>

      <div class="body">
        <template v-if="current === 'language'">
          <h3>{{ t('wizard.languageTitle') }}</h3>
          <p class="muted">{{ t('wizard.languageBody') }}</p>
          <div class="languages">
            <button
              v-for="option in LOCALES"
              :key="option.code"
              type="button"
              class="language"
              :class="{ chosen: locale === option.code }"
              @click="chooseLocale(option.code as LocaleCode)"
            >
              {{ option.label }}
            </button>
          </div>
        </template>

        <template v-else-if="current === 'place'">
          <h3>{{ t('wizard.placeTitle') }}</h3>
          <p class="muted">{{ t('wizard.placeBody') }}</p>
          <label>
            <span>{{ t('setup.location') }}</span>
            <select
              v-model="profile.location"
              :class="{ missing: profile.location === null }"
              @change="onLocationChange"
            >
              <option :value="null">{{ t('common.none') }}</option>
              <option v-for="place in catalogue.locations" :key="place.code" :value="place.code">
                {{ place.code }}
              </option>
            </select>
          </label>
          <label>
            <span>{{ t('setup.entity') }}</span>
            <select v-model="profile.entity" :class="{ incomplete: profile.entity === null }">
              <option :value="null">{{ t('common.none') }}</option>
              <option
                v-for="entity in catalogue.entities"
                :key="entity.entity"
                :value="entity.entity"
              >
                {{ entity.entity }}<template v-if="entity.country"> — {{ entity.country }}</template>
              </option>
            </select>
          </label>
          <p v-if="blocked" class="warn">{{ t('wizard.needLocation') }}</p>
        </template>

        <template v-else-if="current === 'contract'">
          <h3>{{ t('wizard.contractTitle') }}</h3>
          <p class="muted">{{ t('wizard.contractBody') }}</p>
          <label>
            <span>{{ t('setup.businessLine') }}</span>
            <select v-model="profile.businessLine">
              <option :value="null">{{ t('common.none') }}</option>
              <option v-for="line in catalogue.businessLines" :key="line.key" :value="line.name">
                {{ line.name }} ({{ line.count }})
              </option>
            </select>
            <small class="muted">{{ t('setup.businessLineHint') }}</small>
          </label>
          <label>
            <span>{{ t('setup.workPercent') }}</span>
            <div class="percent">
              <input
                v-model.number="profile.workPercent"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="100"
              />
              <span class="muted">%</span>
            </div>
            <small class="muted">
              {{ t('setup.workPercentHint') }}
              {{ t('setup.workPercentDays', { days: contractDays, working: workingDays }) }}
            </small>
          </label>
        </template>

        <template v-else>
          <h3>{{ t('wizard.reminderTitle') }}</h3>
          <p class="muted">{{ t('wizard.reminderBody') }}</p>
          <label class="toggle-row">
            <ToggleSwitch v-model="profile.remindByEmail" />
            <span>
              {{ t('setup.reminder') }}
              <small class="muted">{{ t('setup.reminderHint') }}</small>
            </span>
          </label>
          <p class="muted address">{{ profile.email }}</p>
        </template>
      </div>

      <footer>
        <button type="button" class="btn skip" @click="closeWizard">{{ t('wizard.skip') }}</button>
        <button v-if="step > 0" type="button" class="btn" @click="back">{{ t('wizard.back') }}</button>
        <button type="button" class="btn btn-primary" :disabled="blocked || saving" @click="forward">
          {{ isLast ? t('wizard.finish') : t('wizard.next') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 38 60 / 55%);
}

.wizard {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

header h2 {
  margin: 0;
}

header p {
  margin: 2px 0 0;
  font-size: 12px;
}

.dots {
  display: flex;
  gap: 6px;
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}

.dots li {
  height: 4px;
  flex: 1;
  border-radius: 2px;
  background: var(--warm-grey);
}

.dots li.done {
  background: var(--grey);
}

.dots li.now {
  background: var(--orange);
}

/* The body is a fixed height so the buttons do not move between steps. */
.body {
  min-height: 232px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.body h3 {
  margin: 0;
}

.body p {
  margin: 0;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
}

.languages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.language {
  border: 1px solid var(--warm-grey);
  background: var(--white);
  color: var(--smart-blue);
  border-radius: var(--radius);
  padding: 10px;
  font-weight: 500;
}

.language:hover {
  background: var(--warm-grey);
}

.language.chosen {
  border-color: var(--orange);
  background: var(--open);
  color: var(--smart-blue);
}

.percent {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* The row a toggle sits in. The toggle owns its own look. */
.toggle-row {
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
}

.toggle-row span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-row small {
  font-weight: 400;
}

.address {
  font-size: 12px;
}

.warn {
  color: var(--smart-blue);
  font-size: 13px;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.skip {
  margin-right: auto;
  border-color: transparent;
  background: none;
  color: var(--smart-blue);
}
</style>
