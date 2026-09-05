<script setup lang="ts">
// The questions asked on first login. Cognito supplies the email and the name.
// The user sets the location and the entity and the part time adjustment.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { catalogue } from '@timesheets/core'
import { contractDays, profile, saveProfile, workingDays } from '@/composables/useTimesheet'

const { t } = useI18n()

const saved = ref(false)

/** The location code carries the entity number so it suggests the entity. */
const suggestedEntity = computed(() => {
  const code = profile.location
  if (!code) return null
  const number = code.split('_')[0]
  return catalogue.entities.find((e) => e.entity.startsWith(`${number}_`))?.entity ?? null
})

function onLocationChange(): void {
  saved.value = false
  if (!profile.entity && suggestedEntity.value) profile.entity = suggestedEntity.value
}

async function save(): Promise<void> {
  await saveProfile()
  saved.value = true
}
</script>

<template>
  <section class="card">
    <h2>{{ t('setup.title') }}</h2>
    <p class="muted intro">{{ t('setup.intro') }}</p>

    <div class="fields">
      <label>
        <span>{{ t('setup.name') }}</span>
        <input :value="`${profile.firstName} ${profile.lastName}`" type="text" readonly />
      </label>

      <label>
        <span>{{ t('setup.email') }}</span>
        <input :value="profile.email" type="email" readonly />
      </label>

      <label data-tour="location">
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
        <small class="muted">{{ t('setup.locationHint') }}</small>
      </label>

      <label data-tour="entity">
        <span>{{ t('setup.entity') }}</span>
        <select
          v-model="profile.entity"
          :class="{ incomplete: profile.entity === null }"
          @change="saved = false"
        >
          <option :value="null">{{ t('common.none') }}</option>
          <option v-for="entity in catalogue.entities" :key="entity.entity" :value="entity.entity">
            {{ entity.entity }}<template v-if="entity.country"> — {{ entity.country }}</template>
          </option>
        </select>
      </label>

      <label data-tour="businessLine">
        <span>{{ t('setup.businessLine') }}</span>
        <select v-model="profile.businessLine" @change="saved = false">
          <option :value="null">{{ t('common.none') }}</option>
          <option v-for="line in catalogue.businessLines" :key="line.key" :value="line.name">
            {{ line.name }} ({{ line.count }})
          </option>
        </select>
        <small class="muted">{{ t('setup.businessLineHint') }}</small>
      </label>

      <label data-tour="contract">
        <span>{{ t('setup.workPercent') }}</span>
        <div class="percent">
          <input
            v-model.number="profile.workPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            :placeholder="'100'"
            @input="saved = false"
          />
          <span class="muted">%</span>
        </div>
        <small class="muted">
          {{ t('setup.workPercentHint') }}
          {{ t('setup.workPercentDays', { days: contractDays, working: workingDays }) }}
        </small>
      </label>
    </div>

    <footer>
      <button type="button" class="btn btn-primary" @click="save">{{ t('setup.save') }}</button>
      <span v-if="saved" class="ok">{{ t('setup.saved') }}</span>
    </footer>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0;
}

.percent {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--gap);
}

label {
  display: grid;
  gap: 3px;
}

label > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--navy-soft);
}

small {
  font-size: 11px;
}

/* Required and empty. Marked here as well as in the checks panel. */
select.missing {
  border-color: var(--error);
  background: var(--error-tint);
}

select.incomplete {
  border-color: var(--warn);
  background: var(--warn-tint);
}

input[readonly] {
  background: var(--navy-tint);
  color: var(--navy-soft);
}

footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--navy-line);
}

.ok {
  color: var(--ok);
}
</style>
