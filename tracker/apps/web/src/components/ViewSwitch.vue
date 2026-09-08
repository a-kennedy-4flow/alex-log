<script setup lang="ts">
// The switch between the grid and the board.
//
// It stands with the month it draws rather than in the period bar. Because the
// bar is carried by both editing pages a) the quick fill offered a switch over
// a view it does not draw and b) the control sat away from the section it acts
// on.

import { useI18n } from 'vue-i18n'

import { view, type MonthView } from '@/composables/useView'

const { t } = useI18n()

const VIEWS: { value: MonthView; key: string }[] = [
  { value: 'grid', key: 'view.grid' },
  { value: 'board', key: 'view.board' },
]
</script>

<template>
  <div class="switch" data-tour="view">
    <span id="view-label">{{ t('view.title') }}</span>
    <div class="views" role="group" aria-labelledby="view-label">
      <button
        v-for="option in VIEWS"
        :key="option.value"
        type="button"
        :class="{ on: view === option.value }"
        :aria-pressed="view === option.value"
        @click="view = option.value"
      >
        {{ t(option.key) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* The label reads across to the buttons because the switch is one line above
   the month rather than a field in a row of fields. */
.switch {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.switch > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

/* Both views edit one month so they share the route. */
.views {
  display: flex;
  gap: 2px;
  background: var(--warm-grey);
  border-radius: var(--radius);
  padding: 3px;
}

.views button {
  border: 0;
  background: none;
  color: var(--smart-blue);
  border-radius: calc(var(--radius) - 3px);
  padding: 7px 15px;
  font-size: 13px;
}

.views button.on {
  background: var(--white);
  font-weight: 700;
}
</style>
