<script setup lang="ts">
// The cost centres this user actually books to.
//
// A month is mostly the same few codes as the month before. Reaching them from
// a list beside the grid saves opening the picker and typing an id that is
// already known.
//
// The absences sit at the top on a square each. Because a) everyone books one
// where a cost centre is booked by the few who own it. b) an absence carries no
// number so a full width row would show an empty column. c) a square is the
// smallest control that still holds a mark.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { catalogue, findProject, isAbsence, labelOf } from '@tracker/core'
import { bookNextFree, topCostCentres, type CostCentreUse } from '@/composables/useTimesheet'
import { shortDate } from '@/i18n'

const { t, locale } = useI18n()

/** Where the last click landed. Held briefly so the click is acknowledged. */
const landed = ref<{ at: 'list' | 'absence'; workdayId: string; date: string } | null>(null)

/** Set when a click booked nothing. The month is then on its target. */
const refused = ref(false)

/** The click the running timer belongs to. A later click takes the timer over. */
let click = 0

/**
 * The interface wording for an absence. The workbook names the two in English
 * so a locale reads the label the summary already carries. One the workbook
 * adds later falls back to that label.
 */
function absenceName(label: string): string {
  if (label === 'Vacation or sickness') return t('summary.vacation')
  if (label === 'Other absence') return t('summary.otherAbsence')
  return label
}

/** One square a catalogue absence. The mark is the initial of its name. */
const absences = computed(() =>
  catalogue.absenceTypes.map((absence) => {
    const name = absenceName(absence.label)
    return { label: absence.label, name, mark: [...name][0]?.toUpperCase() ?? '' }
  }),
)

function nameOf(use: CostCentreUse): string {
  const project = findProject(use.workdayId)
  if (!project) return use.workdayId
  if (isAbsence(project.workdayId)) return absenceName(project.workdayId)
  return labelOf(project) || use.workdayId
}

function book(at: 'list' | 'absence', workdayId: string, specification: string | null): void {
  const date = bookNextFree(workdayId, specification)
  const mine = ++click
  refused.value = date === null
  landed.value = date === null ? null : { at, workdayId, date }
  window.setTimeout(() => {
    if (mine !== click) return
    refused.value = false
    landed.value = null
  }, 1600)
}
</script>

<template>
  <section class="sheet pad" data-tour="recent">
    <h2 class="eyebrow">{{ t('recent.title') }}</h2>

    <div class="absence">
      <span class="lab">{{ t('picker.absence') }}</span>
      <button
        v-for="absence in absences"
        :key="absence.label"
        type="button"
        class="square"
        :title="t('recent.bookAbsence', { name: absence.name })"
        :aria-label="t('recent.bookAbsence', { name: absence.name })"
        @click="book('absence', absence.label, null)"
      >
        {{ absence.mark }}
      </button>
      <span v-if="landed?.at === 'absence'" class="landed">
        {{ t('recent.landed', { date: shortDate(locale, landed.date) }) }}
      </span>
    </div>

    <p v-if="topCostCentres.length === 0" class="muted empty">{{ t('recent.empty') }}</p>

    <ul v-else>
      <li v-for="use in topCostCentres" :key="use.workdayId">
        <button
          type="button"
          :title="t('recent.book')"
          @click="book('list', use.workdayId, use.specification)"
        >
          <span class="id num">{{ isAbsence(use.workdayId) ? '—' : use.workdayId }}</span>
          <span class="name">{{ nameOf(use) }}</span>
          <span class="meta">
            <span class="days num">{{ use.days }} {{ t('header.days') }}</span>
            <span>{{ t('recent.months', { count: use.months }) }}</span>
          </span>
        </button>
        <span v-if="landed?.at === 'list' && landed.workdayId === use.workdayId" class="landed">
          {{ t('recent.landed', { date: shortDate(locale, landed.date) }) }}
        </span>
      </li>
    </ul>

    <p v-if="refused" class="full">{{ t('recent.full') }}</p>

    <p class="muted footnote">{{ t('recent.hint') }}</p>
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 10px;
}

.empty {
  margin: 0;
  font-size: 12px;
}

/* The list is taller than the panel it sits in so it scrolls on its own.
   Because a) the aside is sticky and one taller than the window puts the checks
   below it out of reach. b) the rows are a reference list so a part of one at
   the boundary still says there is more under it. */
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

li button {
  display: grid;
  grid-template-columns: 62px 1fr;
  gap: 1px 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--radius);
  padding: 6px 8px;
}

li button:hover {
  background: var(--warm-grey);
}

.id {
  font-weight: 700;
}

.name {
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  grid-column: 2;
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--grey);
}

/* Grey holds to white so the hover fill takes the label with it. */
li button:hover .meta {
  color: var(--smart-blue);
}

.days {
  font-weight: 700;
}

/* Says where the click landed. The month is long so the day may be off screen. */
.landed {
  display: block;
  padding: 2px 8px 4px;
  font-size: 11px;
}

/* The absences are a band of their own above the list. */
.absence {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--warm-grey);
}

.absence .lab {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.absence .landed {
  padding: 0;
}

/* The one radius on a 34px box reads as a rounded square rather than a disc. */
.square {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  padding: 0;
  border: 1px solid var(--warm-grey);
  border-radius: var(--radius);
  background: var(--white);
  color: var(--smart-blue);
  font-weight: 700;
}

.square:hover {
  background: var(--warm-grey);
}

/* A click that booked nothing. Smart Blue reaches 14.69 to 1 on this wash. */
.full {
  margin: 8px 0 0;
  background: var(--open);
  border-radius: var(--radius);
  padding: 5px 9px;
  font-size: 11px;
}

.footnote {
  margin: 12px 0 0;
  font-size: 12px;
}
</style>
