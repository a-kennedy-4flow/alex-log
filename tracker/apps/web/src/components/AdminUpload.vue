<script setup lang="ts">
// The backoffice screen.
//
// A workbook is read in the browser and only the lists it holds are sent. A
// tracker is 660 kB and its lists are about 1.3 MB of JSON so the Lambda needs
// no spreadsheet parser.
//
// A tracker upload replaces everything so the screen shows what was read and
// what it would replace before anything is sent. The 4s project numbers list
// replaces nothing. It names the projects the tracker leaves blank so the
// screen counts what it would name instead.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { offeredWorkdayIds, setCatalogue, type CatalogueInput } from '@tracker/core'
import {
  NotAnUpload,
  mergeProjectNumbers,
  readUploadFrom,
  toCatalogueInput,
  type Upload,
} from '@tracker/workbook-reader'
import { ApiError, api, usingApi } from '@/lib/api'
import { isBackoffice } from '@/composables/useIdentity'

const { t } = useI18n()

const upload = ref<Upload | null>(null)
const filename = ref('')
const reading = ref(false)
const sending = ref(false)
const failure = ref<string | null>(null)
const done = ref<string | null>(null)
const dragging = ref(false)
/** Whether a project number the catalogue has not got is added as bookable. */
const addAbsent = ref(true)

/** The stored lists. A project numbers upload is laid over these. */
const stored = ref<CatalogueInput | null>(null)

const current = ref<{
  updatedAt: string
  projects: number
  workbook: string | null
  numbers: string | null
} | null>(null)

async function loadCurrent(): Promise<void> {
  if (!usingApi) return
  try {
    // The route answers with its version and its date beside the lists. Both
    // are dropped here. A copy of either inside the lists would win the spread
    // the route serves them through and hand every reader a stale one.
    const { version: _version, updatedAt, ...data } = await api.catalogue()
    stored.value = data
    current.value = {
      updatedAt,
      projects: offeredWorkdayIds(data).length,
      workbook: data.source?.workbook ?? null,
      numbers: data.source?.projectNumbers?.workbook ?? null,
    }
  } catch {
    // Nothing uploaded yet is a fine state to be in.
    stored.value = null
    current.value = null
  }
}
void loadCurrent()

const catalogue = computed(() =>
  upload.value?.kind === 'tracker' ? upload.value.catalogue : null,
)
const numbers = computed(() =>
  upload.value?.kind === 'projectNumbers' ? upload.value.projectNumbers : null,
)

/** The 4s list laid over what is stored. Null until both are there. */
const merged = computed(() => {
  const list = numbers.value
  const base = stored.value
  if (list === null || base === null) return null
  return mergeProjectNumbers(base, list, filename.value, addAbsent.value)
})

/** The body a send would put. Null when there is nothing to send. */
const outgoing = computed<CatalogueInput | null>(() => {
  const parsed = catalogue.value
  if (parsed !== null) return toCatalogueInput(parsed, filename.value)
  return merged.value?.data ?? null
})

/** What the picker will offer once this file is uploaded. */
const offered = computed(() => {
  const data = outgoing.value
  if (!data) return { kept: 0, dropped: 0 }
  const kept = offeredWorkdayIds(data).length
  const rows = (data.projects?.length ?? 0) + (data.absenceTypes?.length ?? 0)
  return { kept, dropped: rows - kept }
})

const summary = computed(() => {
  const list = numbers.value
  if (list !== null) {
    // The count of numbers read needs no catalogue. The other two are what the
    // merge found so they wait for one.
    const rows = [{ label: t('admin.numbersRead'), value: list.numbers.length }]
    const report = merged.value?.report
    if (report) {
      rows.push({ label: t('admin.numbersNamed'), value: report.named })
      rows.push({ label: t('admin.numbersAbsent'), value: report.absent })
    }
    return rows
  }
  const parsed = catalogue.value
  if (parsed === null) return []
  return [
    { label: t('admin.projects'), value: offered.value.kept },
    { label: t('admin.locations'), value: parsed.locations.length },
    { label: t('admin.holidayLists'), value: Object.keys(parsed.holidays).length },
    { label: t('admin.businessLines'), value: parsed.businessLines.length },
    { label: t('admin.specRanges'), value: Object.keys(parsed.specifications).length },
  ]
})

/** What the file says about when its own list was cut. */
const cut = computed(() => {
  const parsed = catalogue.value
  if (parsed !== null) return parsed.source.projectListUpdated ?? ''
  const date = numbers.value?.source.listUpdated
  return date ? t('admin.numbersCut', { date }) : ''
})

async function read(file: File): Promise<void> {
  reading.value = true
  failure.value = null
  done.value = null
  upload.value = null
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    upload.value = readUploadFrom(bytes)
    filename.value = file.name
  } catch (error) {
    failure.value = error instanceof NotAnUpload ? error.message : String(error)
  } finally {
    reading.value = false
  }
}

function onPick(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void read(file)
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void read(file)
}

async function send(): Promise<void> {
  const data = outgoing.value
  if (!data) return
  sending.value = true
  failure.value = null
  try {
    const report = merged.value?.report ?? null
    const saved = await api.putCatalogue(data)
    // The browser holds a copy so the editor reflects the upload at once.
    setCatalogue(await api.catalogue())
    done.value =
      report === null
        ? t('admin.replaced', { projects: saved.projects })
        : t('admin.numbersApplied', { named: report.named, added: report.added })
    upload.value = null
    await loadCurrent()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : String(error)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="sheet pad">
    <h2>{{ t('admin.title') }}</h2>

    <p v-if="!isBackoffice()" class="denied">{{ t('admin.denied') }}</p>

    <template v-else>
      <p class="muted intro">{{ t('admin.intro') }}</p>

      <dl v-if="current" class="current">
        <dt>{{ t('admin.current') }}</dt>
        <dd>
          <span class="num">{{ current.projects }}</span> {{ t('admin.projects').toLowerCase() }}
          <span v-if="current.workbook" class="muted">
            &middot; {{ t('admin.from', { workbook: current.workbook }) }}
          </span>
          <span v-if="current.numbers" class="muted">
            &middot; {{ t('admin.numbersFrom', { workbook: current.numbers }) }}
          </span>
          <span class="muted">&middot; {{ current.updatedAt }}</span>
        </dd>
      </dl>

      <label
        class="drop"
        data-tour="adminDrop"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <input type="file" accept=".xlsm,.xlsx" @change="onPick" />
        <span class="headline">{{ reading ? t('admin.reading') : t('admin.drop') }}</span>
        <span class="muted">{{ t('admin.dropHint') }}</span>
      </label>

      <p v-if="failure" class="failure">{{ failure }}</p>
      <p v-if="done" class="done">{{ done }}</p>

      <div v-if="upload" class="preview" data-tour="adminPreview">
        <h3>{{ filename }}</h3>
        <p class="muted">{{ cut }}</p>

        <p v-if="numbers && !stored" class="warn">{{ t('admin.numbersNeedTracker') }}</p>

        <dl class="counts">
          <div v-for="row in summary" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd class="num">{{ row.value }}</dd>
          </div>
        </dl>

        <template v-if="catalogue">
          <p v-if="offered.dropped" class="muted note">
            {{ t('admin.dropped', { count: offered.dropped }) }}
          </p>

          <p v-if="catalogue.brokenSpecRanges.length" class="warn">
            {{
              t('admin.brokenRanges', {
                names: catalogue.brokenSpecRanges.map((r) => r.name).join(' '),
              })
            }}
          </p>
        </template>

        <template v-if="merged">
          <label v-if="merged.report.absent" class="add">
            <input v-model="addAbsent" type="checkbox" />
            <span>{{ t('admin.numbersAdd', { count: merged.report.absent }) }}</span>
          </label>

          <p v-if="merged.report.known" class="muted note">
            {{ t('admin.numbersKnown', { count: merged.report.known }) }}
          </p>
        </template>

        <footer>
          <p class="muted note">
            {{ numbers ? t('admin.numbersWarning') : t('admin.replaceWarning') }}
          </p>
          <button
            type="button"
            class="btn btn-primary"
            data-tour="adminReplace"
            :disabled="sending || !usingApi || !outgoing"
            @click="send"
          >
            {{ sending ? '…' : numbers ? t('admin.numbersApply') : t('admin.replace') }}
          </button>
        </footer>
        <p v-if="!usingApi" class="muted note">{{ t('admin.needsApi') }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0;
  max-width: 70ch;
}

.denied {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--open);
  box-shadow: inset 3px 0 0 var(--orange);
}

.current {
  margin: 0 0 12px;
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.current dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--grey);
}

.current dd {
  margin: 0;
}

.drop {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 28px;
  border: 2px dashed var(--warm-grey);
  border-radius: var(--radius);
  background: var(--tint);
  cursor: pointer;
  text-align: center;
}

.drop.dragging {
  border-color: var(--orange);
  background: var(--open);
}

.drop input {
  display: none;
}

.headline {
  font-weight: 600;
}

.preview {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--warm-grey);
}

.preview h3 {
  margin-bottom: 0;
  overflow-wrap: anywhere;
}

.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin: 12px 0;
}

.counts dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--grey);
}

.counts dd {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.warn {
  padding: 6px 10px;
  border-radius: var(--radius);
  background: var(--open);
  box-shadow: inset 3px 0 0 var(--orange);
}

footer {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 12px;
}

footer .btn-primary {
  margin-left: auto;
}

.note {
  margin: 0;
  font-size: 12px;
}

.failure {
  padding: 6px 10px;
  border-radius: var(--radius);
  background: var(--open);
  box-shadow: inset 3px 0 0 var(--orange);
}

.done {
  padding: 6px 10px;
  border-radius: var(--radius);
  background: var(--warm-grey);
  color: var(--smart-blue);
}

.add {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0;
  cursor: pointer;
}

.add input {
  margin: 0;
}
</style>
