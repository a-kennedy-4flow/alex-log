<script setup lang="ts">
// The cost centres this user actually books to.
//
// A month is mostly the same few codes as the month before. Reaching them from
// a list beside the grid saves opening the picker and typing an id that is
// already known.

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { findProject, isAbsence, labelOf } from '@timesheets/core'
import { bookNextFree, topCostCentres, type CostCentreUse } from '@/composables/useTimesheet'
import { shortDate } from '@/i18n'

const { t, locale } = useI18n()

/** The date the last click filled. Held briefly so the click is acknowledged. */
const landed = ref<{ workdayId: string; date: string } | null>(null)

function nameOf(use: CostCentreUse): string {
  const project = findProject(use.workdayId)
  if (!project) return use.workdayId
  if (isAbsence(project.workdayId)) return project.workdayId
  return labelOf(project) || use.workdayId
}

function book(use: CostCentreUse): void {
  const date = bookNextFree(use.workdayId, use.specification)
  if (!date) {
    landed.value = null
    return
  }
  landed.value = { workdayId: use.workdayId, date }
  window.setTimeout(() => {
    if (landed.value?.workdayId === use.workdayId) landed.value = null
  }, 1600)
}
</script>

<template>
  <section class="card" data-tour="recent">
    <h2>{{ t('recent.title') }}</h2>

    <p v-if="topCostCentres.length === 0" class="muted empty">{{ t('recent.empty') }}</p>

    <ul v-else>
      <li v-for="use in topCostCentres" :key="use.workdayId">
        <button type="button" :title="t('recent.book')" @click="book(use)">
          <span class="id num">{{ isAbsence(use.workdayId) ? '—' : use.workdayId }}</span>
          <span class="name">{{ nameOf(use) }}</span>
          <span class="meta">
            <span class="days num">{{ use.days }} {{ t('header.days') }}</span>
            <span>{{ t('recent.months', { count: use.months }) }}</span>
          </span>
        </button>
        <span v-if="landed?.workdayId === use.workdayId" class="landed">
          {{ t('recent.landed', { date: shortDate(locale, landed.date) }) }}
        </span>
      </li>
    </ul>

    <p class="muted footnote">{{ t('recent.hint') }}</p>
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--navy-soft);
}

.empty {
  margin: 0;
  font-size: 12px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

button {
  display: grid;
  grid-template-columns: 62px 1fr;
  gap: 1px 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 5px 6px;
}

button:hover {
  background: var(--orange-tint);
  border-color: var(--orange-line);
}

.id {
  color: var(--orange-dark);
  font-weight: 600;
}

.name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  grid-column: 2;
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--navy-soft);
}

.days {
  font-weight: 600;
}

/* Says where the click landed. The grid is long so the row may be off screen. */
.landed {
  display: block;
  padding: 2px 6px 4px;
  font-size: 11px;
  color: var(--ok);
}

.footnote {
  margin: 10px 0 0;
  font-size: 11px;
}
</style>
