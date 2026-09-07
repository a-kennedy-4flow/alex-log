<script setup lang="ts">
// The questions asked on first login. Cognito supplies the email and the name.
// The user sets the location and the entity and the part time adjustment.
//
// Every question is a `SettingRow` carrying one control. The row owns the box
// so a select and a number and a toggle all take the same height and the same
// width down the column. The catalogue is mapped to values and labels here
// because the wording of an option belongs to the question being asked.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { catalogue } from '@tracker/core'
import type { UserProfile } from '@tracker/core'
import { LOCALES, type LocaleCode } from '@/i18n'
import {
  chooseLocale,
  contractDays,
  profile,
  saveProfile,
  suggestedEntity,
  workingDays,
} from '@/composables/useTimesheet'
import { openWizard } from '@/composables/useWizard'
import SettingRow from '@/components/SettingRow.vue'
import SettingSelect from '@/components/SettingSelect.vue'
import SettingNumber from '@/components/SettingNumber.vue'
import SettingValue from '@/components/SettingValue.vue'
import SettingJira from '@/components/SettingJira.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { t, locale } = useI18n()

const saved = ref(false)

/**
 * Writes one answer and marks the form unsaved. Every question but the location
 * and the language does only this.
 */
function set<K extends keyof UserProfile>(key: K, value: UserProfile[K]): void {
  profile[key] = value
  saved.value = false
}

/**
 * The options are read on every render rather than held in a computed. The
 * catalogue is a plain object that `setCatalogue` replaces so a cached list
 * would outlive an upload without ever saying so.
 */
function languageOptions(): { value: string; label: string }[] {
  return LOCALES.map((option) => ({ value: option.code, label: option.label }))
}

function locationOptions(): { value: string; label: string }[] {
  return catalogue.locations.map((place) => ({ value: place.code, label: place.code }))
}

function entityOptions(): { value: string; label: string }[] {
  return catalogue.entities.map((entity) => ({
    value: entity.entity,
    label: entity.country ? `${entity.entity} — ${entity.country}` : entity.entity,
  }))
}

function businessLineOptions(): { value: string; label: string }[] {
  return catalogue.businessLines.map((line) => ({
    value: line.name,
    label: `${line.name} (${line.count})`,
  }))
}

function onLocaleChange(code: string | null): void {
  if (code === null) return
  chooseLocale(code as LocaleCode)
  saved.value = false
}

/** The entity the location implies is offered rather than left to be found. */
function onLocationChange(code: string | null): void {
  profile.location = code
  saved.value = false
  if (!profile.entity && suggestedEntity.value) profile.entity = suggestedEntity.value
}

const contractHint = computed(
  () =>
    `${t('setup.workPercentHint')} ${t('setup.workPercentDays', {
      days: contractDays.value,
      working: workingDays.value,
    })}`,
)

async function save(): Promise<void> {
  await saveProfile()
  saved.value = true
}
</script>

<template>
  <section class="sheet pad">
    <h2>{{ t('setup.title') }}</h2>
    <p class="muted intro">{{ t('setup.intro') }}</p>

    <div class="fields">
      <SettingRow :label="t('setup.name')">
        <SettingValue :value="`${profile.firstName} ${profile.lastName}`" />
      </SettingRow>

      <SettingRow :label="t('setup.email')">
        <SettingValue :value="profile.email" />
      </SettingRow>

      <SettingRow :label="t('common.language')">
        <SettingSelect
          :model-value="locale"
          :options="languageOptions()"
          @update:model-value="onLocaleChange"
        />
      </SettingRow>

      <SettingRow
        data-tour="location"
        :label="t('setup.location')"
        :hint="t('setup.locationHint')"
      >
        <SettingSelect
          :model-value="profile.location"
          :options="locationOptions()"
          :none="t('common.none')"
          :class="{ missing: profile.location === null }"
          @update:model-value="onLocationChange"
        />
      </SettingRow>

      <SettingRow data-tour="entity" :label="t('setup.entity')">
        <SettingSelect
          :model-value="profile.entity"
          :options="entityOptions()"
          :none="t('common.none')"
          :class="{ incomplete: profile.entity === null }"
          @update:model-value="set('entity', $event)"
        />
      </SettingRow>

      <SettingRow
        data-tour="businessLine"
        :label="t('setup.businessLine')"
        :hint="t('setup.businessLineHint')"
      >
        <SettingSelect
          :model-value="profile.businessLine"
          :options="businessLineOptions()"
          :none="t('common.none')"
          @update:model-value="set('businessLine', $event)"
        />
      </SettingRow>

      <SettingRow data-tour="contract" :label="t('setup.workPercent')" :hint="contractHint">
        <SettingNumber
          :model-value="profile.workPercent"
          unit="%"
          :min="0"
          :max="100"
          :step="1"
          placeholder="100"
          @update:model-value="set('workPercent', $event)"
        />
      </SettingRow>

      <SettingRow :label="t('setup.hoursPerDay')" :hint="t('setup.hoursPerDayHint')">
        <SettingNumber
          :model-value="profile.hoursPerDay"
          unit="h"
          :min="1"
          :max="24"
          :step="0.5"
          placeholder="8"
          @update:model-value="set('hoursPerDay', $event)"
        />
      </SettingRow>

      <SettingRow :label="t('setup.reminder')" :hint="t('setup.reminderHint')">
        <ToggleSwitch
          :model-value="profile.remindByEmail"
          @update:model-value="set('remindByEmail', $event)"
        />
      </SettingRow>

      <SettingJira />
    </div>

    <footer>
      <button type="button" class="btn btn-primary" @click="save">{{ t('setup.save') }}</button>
      <button type="button" class="btn" @click="openWizard">{{ t('setup.wizard') }}</button>
      <span v-if="saved" class="ok">{{ t('setup.saved') }}</span>
    </footer>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--gap);
}

/* Required and empty. Marked here as well as in the checks panel. */
select.missing,
select.incomplete {
  border-color: var(--orange);
  background: var(--open);
}

footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--warm-grey);
}

.ok {
  color: var(--smart-blue);
}
</style>
