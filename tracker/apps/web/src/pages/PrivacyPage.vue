<script setup lang="ts">
// The privacy notice. One band per thing the service holds.
//
// It carries no `PageTitle` because that heading is the month being edited and
// this notice does not change with the period.

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** The bands in reading order. Each name is a `privacy.<name>` pair. */
const SECTIONS = ['logs', 'store', 'jira', 'use', 'erase'] as const
</script>

<template>
  <div>
    <div class="title">
      <h1>{{ t('privacy.title') }}</h1>
      <p class="muted">{{ t('privacy.intro') }}</p>
    </div>

    <div class="stack">
      <section v-for="name in SECTIONS" :key="name" class="sheet pad">
        <h2 class="eyebrow">{{ t(`privacy.${name}.title`) }}</h2>
        <p>{{ t(`privacy.${name}.body`) }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.title {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  padding: 0 0 18px;
}

.title h1 {
  margin: 0;
}

.title p {
  margin: 0;
}

section p {
  margin: 0;
  max-width: 78ch;
  font-size: 13px;
}
</style>
