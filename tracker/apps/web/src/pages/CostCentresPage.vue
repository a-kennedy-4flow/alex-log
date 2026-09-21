<script setup lang="ts">
// The catalogue as something to read.
//
// The picker answers "which one do I book against" and it is driven from the
// keyboard so it shows a few rows at a time. This answers "what is there" and
// "what may this one book". Neither question has an answer on any other screen.
//
// The specification list of a row is the point of the page. A cost centre that
// names its own list may book those and nothing else. One whose list the
// workbook leaves empty may book anything and the row says so.

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  catalogue,
  isAbsence,
  labelOf,
  searchProjects,
  specificationsFor,
  type Project,
} from '@tracker/core'

import PageTitle from '@/components/PageTitle.vue'
import { profile } from '@/composables/useTimesheet'

const { t, n } = useI18n()

/** How many rows one page holds. The button below adds another page. */
const PAGE = 50

const query = ref('')
const shown = ref(PAGE)
/** The workday id whose specification list is open. Null when none is. */
const opened = ref<string | null>(null)

/**
 * The catalogue ordered by the same rule the picker uses.
 *
 * `searchProjects` is what the picker reads so a search here answers what a
 * search there would. A second ranking would leave the two screens disagreeing
 * about which row comes first.
 *
 * The whole list is ranked and the cut happens below. The count has to be the
 * count of what matched rather than of what is on the screen.
 */
const found = computed(() =>
  searchProjects(query.value, Number.MAX_SAFE_INTEGER, profile.businessLine, []),
)

const page = computed(() => found.value.slice(0, shown.value))

function reset(): void {
  shown.value = PAGE
  opened.value = null
}

function more(): void {
  shown.value += PAGE
}

function toggle(workdayId: string): void {
  opened.value = opened.value === workdayId ? null : workdayId
}

function kindOf(project: Project): string {
  if (isAbsence(project.workdayId)) return t('picker.absence')
  return project.objectKey === 'cc' ? t('picker.costCentre') : t('picker.project')
}

/** What one row may book. The range name is shown because the workbook uses it. */
function specOf(project: Project) {
  return specificationsFor(project.workdayId)
}

/** Every specification the workbook holds. The full list one row may fall back to. */
const everything = computed(() => specificationsFor(null))

/** The workbook these lists were read from. Empty before one is uploaded. */
const workbook = computed(
  () => catalogue.source?.projectListFile ?? catalogue.source?.workbook ?? '',
)
</script>

<template>
  <div>
    <PageTitle />

    <div class="stack">
      <section class="sheet pad">
        <h2 class="eyebrow">{{ t('catalogue.title') }}</h2>
        <p class="intro">{{ t('catalogue.intro') }}</p>

        <div class="tools">
          <input
            v-model="query"
            type="search"
            class="search"
            :placeholder="t('catalogue.search')"
            @input="reset"
          />
          <p class="muted count">
            {{ t('catalogue.count', { shown: n(page.length), total: n(found.length) }) }}
          </p>
        </div>

        <p v-if="workbook" class="muted">{{ t('catalogue.source', { file: workbook }) }}</p>

        <p v-if="found.length === 0" class="muted">{{ t('catalogue.none') }}</p>

        <table v-else>
          <thead>
            <tr>
              <th>{{ t('grid.workdayId') }}</th>
              <th>{{ t('jira.projectTitle') }}</th>
              <th>{{ t('setup.businessLine') }}</th>
              <th>{{ t('catalogue.kind') }}</th>
              <th class="right">{{ t('catalogue.specifications') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="project in page" :key="project.workdayId">
              <tr :class="{ open: opened === project.workdayId }">
                <td class="num nowrap">{{ project.workdayId }}</td>
                <td>
                  {{ labelOf(project) }}
                  <span v-if="project.customer" class="under">{{ project.customer }}</span>
                </td>
                <td class="nowrap">{{ project.businessLine ?? '—' }}</td>
                <td class="nowrap">{{ kindOf(project) }}</td>
                <td class="right">
                  <!--
                    The count is the button. A row holding 38 specifications is
                    the whole list and the label below says so once it is open.
                  -->
                  <button type="button" class="btn small" @click="toggle(project.workdayId)">
                    {{ n(specOf(project).options.length) }}
                  </button>
                </td>
              </tr>
              <tr v-if="opened === project.workdayId" class="specs">
                <td colspan="5">
                  <p class="muted">
                    {{
                      specOf(project).hasOwnList
                        ? t('catalogue.ownList', { range: specOf(project).range })
                        : t('catalogue.fullList', { range: specOf(project).range })
                    }}
                  </p>
                  <ul>
                    <li v-for="option in specOf(project).options" :key="option">{{ option }}</li>
                  </ul>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <button
          v-if="page.length < found.length"
          type="button"
          class="btn"
          @click="more"
        >
          {{ t('catalogue.more', { count: n(Math.min(PAGE, found.length - page.length)) }) }}
        </button>
      </section>

      <section class="sheet pad">
        <h2 class="eyebrow">{{ t('catalogue.allTitle') }}</h2>
        <p class="intro">{{ t('catalogue.allIntro') }}</p>
        <ul class="all">
          <li v-for="option in everything.options" :key="option">{{ option }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 14px;
  color: var(--grey);
  font-size: 13px;
  max-width: 82ch;
}

.tools {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.search {
  flex: 1;
  max-width: 48ch;
}

.count {
  margin: 0;
  font-size: 12px;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}

th,
td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--grey);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 2px solid var(--bright-blue);
  white-space: nowrap;
}

.right {
  text-align: right;
}

.nowrap {
  white-space: nowrap;
}

/* The row whose list is open. It reads as the head of the block below it. */
tr.open td {
  border-bottom: none;
  font-weight: 700;
}

tr.specs td {
  background: var(--warm-grey);
  padding-top: 4px;
}

tr.specs p {
  margin: 0 0 8px;
  font-size: 12px;
}

tr.specs ul,
.all {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

tr.specs li,
.all li {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 3px 9px;
  font-size: 12px;
}

.all li {
  background: var(--warm-grey);
  border-color: transparent;
}

.under {
  display: block;
  font-size: 11px;
  color: var(--grey);
}

.btn.small {
  padding: 3px 12px;
  font-size: 12px;
}
</style>
