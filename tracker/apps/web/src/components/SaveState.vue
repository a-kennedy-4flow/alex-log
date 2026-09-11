<script setup lang="ts">
// Whether the last edit landed.
//
// The month is written as it is edited so there is no Save button and nothing
// to press. What is left to say is the state of the write and the time of the
// last one. A failure is the only state that asks anything of the user so it is
// the only one carrying a control.
//
// It stands with the section that edits the month rather than in the period
// bar. Because a) the bar heads the month and this is about the last keystroke.
// b) the eye is on the rows being filled. c) both editing pages carry it so a
// failed write is never silent on either.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { shortTime } from '@/i18n'
import { retrySave, saveState, savedAt } from '@/composables/useTimesheet'

const { t, locale } = useI18n()

// The clock time rather than the date because a save is minutes old at most.
const savedTime = computed(() => (savedAt.value ? shortTime(locale.value, savedAt.value) : ''))
</script>

<template>
  <p class="state" :class="saveState" aria-live="polite">
    <template v-if="saveState === 'saving'">{{ t('setup.saving') }}</template>
    <template v-else-if="saveState === 'saved'">{{ t('setup.saved') }} {{ savedTime }}</template>
    <template v-else-if="saveState === 'failed'">
      <span class="failed">{{ t('setup.saveFailed') }}</span>
      <button type="button" class="btn retry" @click="retrySave">{{ t('setup.retry') }}</button>
      <span class="hint">{{ t('setup.saveFailedHint') }}</span>
    </template>
  </p>
</template>

<style scoped>
/* It holds its height so the bar does not jump as the state changes. */
.state {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  min-height: 17px;
  font-size: 13px;
  color: var(--grey);
}

/*
 * Vibrant Orange on white reaches 3.32 to 1 which is short of the 4.5 to 1 that
 * 13px needs. So a failure is carried by the word and not by the colour and the
 * text stays the body one.
 */
.failed {
  font-weight: 700;
  color: var(--smart-blue);
}

.hint {
  flex-basis: 100%;
}

.retry {
  padding: 2px 10px;
  font-size: 12px;
}
</style>
