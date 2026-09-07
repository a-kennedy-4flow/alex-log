<script setup lang="ts">
// The backoffice screen.
//
// A tracker workbook is read in the browser and only the lists it holds are
// sent. The file is 660 kB and the lists are about 1.3 MB of JSON so the Lambda
// needs no spreadsheet parser.
//
// Each upload replaces everything. The screen therefore shows what was read and
// what it would replace before anything is sent.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { offeredWorkdayIds, setCatalogue } from '@tracker/core'
import {
  NotATracker,
  readCatalogueFrom,
  toCatalogueInput,
  type ParsedCatalogue,
} from '@tracker/workbook-reader'
import { ApiError, api, usingApi } from '@/lib/api'
import { isBackoffice } from '@/composables/useIdentity'

const { t } = useI18n()

const parsed = ref<ParsedCatalogue | null>(null)
const filename = ref('')
const reading = ref(false)
const sending = ref(false)
const failure = ref<string | null>(null)
const done = ref<string | null>(null)
const dragging = ref(false)

const current = ref<{ updatedAt: string; projects: number; workbook: string | null } | null>(null)

async function loadCurrent(): Promise<void> {
  if (!usingApi) return
  try {
    const value = await api.catalogue()
    current.value = {
      updatedAt: value.updatedAt,
      projects: offeredWorkdayIds(value).length,
      workbook: value.source?.workbook ?? null,
    }
  } catch {
    // Nothing uploaded yet is a fine state to be in.
    current.value = null
  }
}
void loadCurrent()

/** What the picker will offer once this file is uploaded. */
const offered = computed(() => {
  const value = parsed.value
  if (!value) return { kept: 0, dropped: 0 }
  const kept = offeredWorkdayIds(toCatalogueInput(value, filename.value)).length
  return { kept, dropped: value.projects.length + value.absenceTypes.length - kept }
})

const summary = computed(() => {
  const value = parsed.value
  if (!value) return []
  return [
    { label: t('admin.projects'), value: offered.value.kept },
    { label: t('admin.locations'), value: value.locations.length },
    { label: t('admin.holidayLists'), value: Object.keys(value.holidays).length },
    { label: t('admin.businessLines'), value: value.businessLines.length },
    { label: t('admin.specRanges'), value: Object.keys(value.specifications).length },
  ]
})

async function read(file: File): Promise<void> {
  reading.value = true
  failure.value = null
  done.value = null
  parsed.value = null
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    parsed.value = readCatalogueFrom(bytes)
    filename.value = file.name
  } catch (error) {
    failure.value = error instanceof NotATracker ? error.message : String(error)
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
  const value = parsed.value
  if (!value) return
  sending.value = true
  failure.value = null
  try {
    const saved = await api.putCatalogue(toCatalogueInput(value, filename.value))
    // The browser holds a copy so the editor reflects the upload at once.
    setCatalogue(await api.catalogue())
    done.value = t('admin.replaced', { projects: saved.projects })
    parsed.value = null
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

      <div v-if="parsed" class="preview" data-tour="adminPreview">
        <h3>{{ filename }}</h3>
        <p class="muted">{{ parsed.source.projectListUpdated }}</p>
        <dl class="counts">
          <div v-for="row in summary" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd class="num">{{ row.value }}</dd>
          </div>
        </dl>

        <p v-if="offered.dropped" class="muted note">
          {{ t('admin.dropped', { count: offered.dropped }) }}
        </p>

        <p v-if="parsed.brokenSpecRanges.length" class="warn">
          {{ t('admin.brokenRanges', { names: parsed.brokenSpecRanges.map((r) => r.name).join(' ') }) }}
        </p>

        <footer>
          <p class="muted note">{{ t('admin.replaceWarning') }}</p>
          <button
            type="button"
            class="btn btn-primary"
            data-tour="adminReplace"
            :disabled="sending || !usingApi"
            @click="send"
          >
            {{ sending ? '…' : t('admin.replace') }}
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
</style>
