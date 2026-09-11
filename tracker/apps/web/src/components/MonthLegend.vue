<script setup lang="ts">
// What each theme line on the board stands for.
//
// It stands in the row above the month with the other controls rather than
// above the board it describes. The chip it draws is the chip the board draws
// so `tokens.css` owns both.
//
// Nothing renders until the month books something. An empty legend is a label
// with nothing after it.

import { useI18n } from 'vue-i18n'

import { isAbsence } from '@tracker/core'
import { monthLines } from '@/composables/useMonthLines'

const { t } = useI18n()
</script>

<template>
  <div v-if="monthLines.length" class="legend">
    <span class="lab">{{ t('board.legend') }}</span>
    <span class="chips">
      <span v-for="entry in monthLines" :key="entry.id" class="chip" :class="entry.line">
        <b class="num">{{ isAbsence(entry.id) ? t('picker.absence') : entry.id }}</b>
      </span>
    </span>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  align-items: center;
}

.lab {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

/* Smaller than a chip in a cell. The row is a dense line. */
.chip {
  font-size: 11px;
  padding: 3px 9px;
}
</style>
