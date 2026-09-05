<script setup lang="ts">
// Mirrors the two tracker validation cells. O3 reports missing or invalid
// entries. O2 reports the gap against the target. An error blocks the download
// and a warning does not.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { blocked, booked, issues } from '@/composables/useTimesheet'

const { t } = useI18n()

const errors = computed(() => issues.value.filter((i) => i.severity === 'error'))
const warnings = computed(() => issues.value.filter((i) => i.severity === 'warning'))
const clean = computed(() => issues.value.length === 0 && booked.value > 0)

const ROW_PREVIEW = 12
</script>

<template>
  <section class="card" :class="{ blocked }" data-tour="checks">
    <h2>{{ t('validation.title') }}</h2>

    <p v-if="clean" class="line ok">{{ t('validation.complete') }}</p>

    <ul v-if="issues.length" class="lines">
      <li v-for="(issue, index) in [...errors, ...warnings]" :key="index" :class="issue.severity">
        <span class="badge">{{ issue.severity === 'error' ? '!' : '?' }}</span>
        <span>
          {{ t(`validation.${issue.code}`, issue.values ?? {}) }}
          <span v-if="issue.rows?.length" class="rows muted">
            {{ t('validation.rows') }}
            {{ issue.rows.slice(0, ROW_PREVIEW).join(' ') }}
            <template v-if="issue.rows.length > ROW_PREVIEW">…</template>
          </span>
        </span>
      </li>
    </ul>

    <p v-if="blocked" class="line error-note">{{ t('validation.blocksExport') }}</p>
  </section>
</template>

<style scoped>
.card.blocked {
  border-color: var(--error);
}

.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.lines li {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 8px;
  align-items: start;
  border-radius: var(--radius);
  padding: 6px 8px;
}

.lines li.error {
  background: var(--error-tint);
  color: var(--error);
}

.lines li.warning {
  background: var(--warn-tint);
  color: var(--warn);
}

.badge {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: currentcolor;
  color: var(--white);
  font-weight: 700;
  font-size: 12px;
}

.rows {
  display: block;
  font-family: var(--mono);
  font-size: 11px;
}

.line {
  margin: 0;
}

.line.ok {
  color: var(--ok);
  background: var(--ok-tint);
  border-radius: var(--radius);
  padding: 6px 8px;
}

.error-note {
  margin-top: 8px;
  color: var(--error);
  font-weight: 600;
}
</style>
