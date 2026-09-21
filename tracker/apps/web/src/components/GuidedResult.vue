<script setup lang="ts">
// What the guided build wrote.
//
// It is drawn on the month view because that is where the build lands the
// user. The two warnings under the summary name days a person has to decide
// about so the notice is dismissed by hand rather than on a timer.

import { useI18n } from 'vue-i18n'

import { built } from '@/composables/useGuided'

const { t, n } = useI18n()
</script>

<template>
  <section v-if="built" class="sheet pad">
    <h2 class="eyebrow">{{ t('guided.step5') }}</h2>
    <p class="said">
      {{ t('guided.builtSummary', { absence: n(built.absenceDays), work: n(built.workDays) }) }}
    </p>
    <p v-if="built.shortBy > 0" class="said warn">
      {{ t('guided.shortBy', { days: n(built.shortBy) }) }}
    </p>
    <p v-if="built.ignored.length" class="said warn">
      {{ t('guided.ignored', { dates: built.ignored.join(' ') }) }}
    </p>
    <button type="button" class="btn" @click="built = null">{{ t('guided.dismiss') }}</button>
  </section>
</template>

<style scoped>
.said {
  margin: 0 0 10px;
  font-size: 13px;
}

.warn {
  color: var(--orange);
  font-weight: 700;
}
</style>
