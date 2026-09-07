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
  <section class="sheet pad" :class="{ blocked }" data-tour="checks">
    <h2 class="eyebrow">{{ t('validation.title') }}</h2>

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
h2 {
  margin: 0 0 10px;
}

.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 11px;
}

.lines li {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 9px;
  align-items: start;
  font-size: 13px;
}

/*
 * Severity is carried by the badge and not by the text. Because a) Vibrant
 * Orange reaches 3.32 to 1 on white. b) body text needs 4.5 to 1. c) Smart Blue
 * on that orange reaches 4.70 to 1 so the badge reads that way round.
 */
.badge {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--warm-grey);
  color: var(--smart-blue);
  font-weight: 700;
  font-size: 12px;
}

.lines li.error .badge {
  background: var(--orange);
}

.rows {
  display: block;
  font-family: var(--mono);
  font-size: 12px;
  margin-top: 2px;
}

.line {
  margin: 0;
  font-size: 13px;
}

.error-note {
  margin-top: 10px;
  font-weight: 700;
  padding-left: 29px;
}

/* The whole panel is marked when the download is blocked. */
.blocked .error-note {
  box-shadow: inset 3px 0 0 var(--orange);
  padding-left: 12px;
  margin-left: 17px;
}
</style>
