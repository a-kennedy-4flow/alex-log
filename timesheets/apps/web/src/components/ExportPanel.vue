<script setup lang="ts">
// The download. The page hands the user a file and the user emails it. The app
// sends nothing.
//
// The workbook is built by the API so the validation that guards it runs on a
// server the browser cannot talk past. The month is saved first because the API
// exports what is stored rather than what the browser sends.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { exportFilename } from '@timesheets/core'
import { ApiError, api, download, usingApi } from '@/lib/api'
import {
  blocked,
  booked,
  halfDays,
  month,
  period,
  profile,
  saveSheet,
  year,
} from '@/composables/useTimesheet'

const { t } = useI18n()

const RECIPIENT = 'software.projecttracker@4flow.com'

const busy = ref(false)
const failure = ref<string | null>(null)

const filename = computed(() =>
  exportFilename({
    firstName: profile.firstName,
    lastName: profile.lastName,
    year: year.value,
    month: month.value,
    location: profile.location,
  }),
)

// A missing office is reported by the validation so it need not be repeated
// here. Two copies of one rule drift.
const canDownload = computed(() => usingApi && !blocked.value && booked.value > 0)

async function run(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    await saveSheet()
    const file = await api.export(period.value)
    download(file.filename, file.blob)
  } catch (error) {
    failure.value =
      error instanceof ApiError
        ? `${error.message}${error.codes.length ? ` (${error.codes.join(' ')})` : ''}`
        : String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card" data-tour="download">
    <h2>{{ t('exportPanel.title') }}</h2>
    <p class="muted intro">{{ t('exportPanel.intro', { address: RECIPIENT }) }}</p>

    <dl>
      <dt>{{ t('exportPanel.filename') }}</dt>
      <dd class="num">{{ filename }}</dd>
    </dl>

    <button type="button" class="btn btn-primary" :disabled="!canDownload || busy" @click="run">
      {{ busy ? '…' : t('exportPanel.button') }}
    </button>

    <p v-if="failure" class="failure">{{ failure }}</p>
    <p v-else-if="blocked" class="muted reason">{{ t('exportPanel.blocked') }}</p>
    <p v-else-if="!usingApi" class="muted reason">
      Set VITE_API_URL and run the API to enable the download. Everything above is the data it
      writes.
    </p>
    <p v-else-if="!halfDays.some((h) => h.days !== null)" class="muted reason">
      {{ t('grid.empty') }}
    </p>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0;
}

dl {
  margin: 0 0 12px;
}

dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--navy-soft);
}

dd {
  margin: 2px 0 0;
  padding: 6px 8px;
  background: var(--navy-tint);
  border-radius: var(--radius);
  overflow-wrap: anywhere;
}

.reason {
  margin: 8px 0 0;
  font-size: 12px;
}

.failure {
  margin: 8px 0 0;
  padding: 6px 8px;
  border-radius: var(--radius);
  background: var(--error-tint);
  color: var(--error);
}
</style>
