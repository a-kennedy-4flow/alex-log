<script setup lang="ts">
// The download. The page hands the user a file and the user emails it. The app
// sends nothing.
//
// The workbook is built by the API so the validation that guards it runs on a
// server the browser cannot talk past. The month is saved first because the API
// exports what is stored rather than what the browser sends.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { exportFilename } from '@tracker/core'
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
  <section class="download" data-tour="download">
    <div class="fn">
      <span>{{ t('exportPanel.filename') }}</span>
      <p class="num">{{ filename }}</p>
    </div>

    <div class="say">
      <p>{{ t('exportPanel.intro', { address: RECIPIENT }) }}</p>
      <p v-if="failure" class="reason">{{ failure }}</p>
      <p v-else-if="blocked" class="reason">{{ t('exportPanel.blocked') }}</p>
      <p v-else-if="!usingApi" class="reason">
        Set VITE_API_URL and run the API to enable the download. Everything above is the data it
        writes.
      </p>
      <p v-else-if="!halfDays.some((h) => h.days !== null)" class="reason">
        {{ t('grid.empty') }}
      </p>
    </div>

    <button type="button" class="primary" :disabled="!canDownload || busy" @click="run">
      {{ busy ? '…' : t('exportPanel.button') }}
    </button>
  </section>
</template>

<style scoped>
/* The download closes the sheet rather than standing away from it. */
.download {
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
  background: var(--smart-blue);
  color: var(--white);
  padding: 24px 26px;
}

.fn span {
  display: block;
  color: var(--on-blue-label);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 3px;
}

.fn p {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.say p {
  margin: 0;
  color: var(--on-blue-body);
  font-size: 13px;
}

.say .reason {
  margin-top: 4px;
  color: var(--white);
}

.primary {
  margin-left: auto;
  border: 0;
  background: var(--orange);
  color: var(--smart-blue);
  font-weight: 700;
  border-radius: var(--radius);
  padding: 13px 26px;
  font-size: 15px;
}

.primary:hover:not(:disabled) {
  background: var(--orange-hover);
}

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
