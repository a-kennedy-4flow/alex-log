<script setup lang="ts">
// The page heading. The month then the location then the contract.
//
// Both editing pages carry it. The month view had one and the quick fill had
// none so moving between them made the heading appear and disappear.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { monthName } from '@/i18n'
import { month, profile, year } from '@/composables/useTimesheet'

const { t, locale } = useI18n()

/** A full month is 100 per cent so an unset contract reads as one. */
const contractPercent = computed(() => profile.workPercent ?? 100)
</script>

<template>
  <div class="title">
    <h1>{{ monthName(locale, month) }} {{ year }}</h1>
    <span v-if="profile.location" class="pill">{{ profile.location }}</span>
    <span class="pill light">{{ t('header.contract', { percent: contractPercent }) }}</span>
    <p class="muted">{{ t('app.subtitle') }}</p>
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
  margin: 0 0 0 auto;
}
</style>
