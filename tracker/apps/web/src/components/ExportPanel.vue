<script setup lang="ts">
// The download.
//
// Two ways out and one workbook. The browser takes the file or the API sends it
// to the mailbox the token names. The second is for a user who forwards it from
// Outlook rather than attaching it by hand.
//
// The workbook is built by the API so the validation that guards it runs on a
// server the browser cannot talk past. The API exports what is stored. The
// month is stored as it is edited so there is nothing to save here. Only an
// edit still inside the autosave interval is written first and that is what the
// flush does.
//
// Either way out files the month. It is also what mutes the monthly reminder.
// So a month edited after that is named here because it is named nowhere else.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { exportFilename, exportLocation, TRACKER_RECIPIENT } from '@tracker/core'
import { ApiError, api, download, usingApi } from '@/lib/api'
import { longDate } from '@/i18n'
import {
  blocked,
  booked,
  exportedAt,
  flushSheet,
  halfDays,
  month,
  openLocation,
  period,
  profile,
  refreshSentState,
  sentState,
  year,
} from '@/composables/useTimesheet'

const { t, locale } = useI18n()

const busy = ref(false)
const sending = ref(false)
const failure = ref<string | null>(null)
/** The mailbox the last delivery reached. Null until one has. */
const delivered = ref<string | null>(null)

// The location comes from the stored month before the profile. The API names
// the workbook the same way so what is shown here is what arrives.
const filename = computed(() =>
  exportFilename({
    firstName: profile.firstName,
    lastName: profile.lastName,
    year: year.value,
    month: month.value,
    location: exportLocation(openLocation.value, profile.location),
  }),
)

// A missing office is reported by the validation so it need not be repeated
// here. Two copies of one rule drift.
const canDownload = computed(() => usingApi && !blocked.value && booked.value > 0)

const downloadedOn = computed(() =>
  exportedAt.value ? longDate(locale.value, exportedAt.value) : '',
)

function reasonOf(error: unknown): string {
  return error instanceof ApiError
    ? `${error.message}${error.codes.length ? ` (${error.codes.join(' ')})` : ''}`
    : String(error)
}

async function run(): Promise<void> {
  busy.value = true
  failure.value = null
  delivered.value = null
  try {
    // An edit still inside the autosave interval has not been written yet and
    // the API exports what is stored.
    await flushSheet()
    // The name on the screen is handed in so a hidden header cannot rename the
    // file to something the user was never shown.
    const file = await api.export(period.value, filename.value)
    download(file.filename, file.blob)
    // The export writes the sent marker on the server so it is read back.
    await refreshSentState()
  } catch (error) {
    failure.value = reasonOf(error)
  } finally {
    busy.value = false
  }
}

async function send(): Promise<void> {
  sending.value = true
  failure.value = null
  delivered.value = null
  try {
    await flushSheet()
    // The address is never sent. The API answers with the one on the token so
    // the panel names the mailbox the file actually reached.
    delivered.value = (await api.emailTracker(period.value)).to
    await refreshSentState()
  } catch (error) {
    failure.value = reasonOf(error)
  } finally {
    sending.value = false
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
      <p>{{ t('exportPanel.intro', { address: TRACKER_RECIPIENT }) }}</p>
      <p v-if="failure" class="reason">{{ failure }}</p>
      <p v-else-if="blocked" class="reason">{{ t('exportPanel.blocked') }}</p>
      <p v-else-if="!usingApi" class="reason">
        Set VITE_API_URL and run the API to enable the download. Everything above is the data it
        writes.
      </p>
      <p v-else-if="!halfDays.some((h) => h.days !== null)" class="reason">
        {{ t('grid.empty') }}
      </p>
      <p v-if="delivered" class="sent">{{ t('exportPanel.delivered', { address: delivered }) }}</p>
      <p v-else-if="sentState === 'changed'" class="reason">
        {{ t('exportPanel.changed', { at: downloadedOn }) }}
      </p>
      <p v-else-if="sentState === 'sent'" class="sent">
        {{ t('exportPanel.sent', { at: downloadedOn }) }}
      </p>
    </div>

    <div class="acts">
      <button type="button" class="primary" :disabled="!canDownload || busy || sending" @click="run">
        {{ busy ? '…' : t('exportPanel.button') }}
      </button>
      <button type="button" class="second" :disabled="!canDownload || busy || sending" @click="send">
        {{ sending ? '…' : t('exportPanel.email') }}
      </button>
    </div>
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

/* A month already sent is a settled fact so it reads as quietly as the intro. */
.say .sent {
  margin-top: 4px;
}

/* The two ways out sit together rather than one per corner. */
.acts {
  margin-left: auto;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.primary {
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

.primary:disabled,
.second:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Outlined rather than filled. The download is the ordinary way out. */
.second {
  border: 1px solid var(--on-blue-body);
  background: transparent;
  color: var(--white);
  font-weight: 700;
  border-radius: var(--radius);
  padding: 12px 22px;
  font-size: 15px;
}

.second:hover:not(:disabled) {
  background: var(--white);
  color: var(--smart-blue);
}
</style>
