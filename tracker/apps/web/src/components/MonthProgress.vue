<script setup lang="ts">
// How far through the month the user is.
//
// The bar is the reward for filling the form so it moves smoothly and it lands
// on a clear finish. It never overstates: past the target it keeps filling in a
// second colour rather than sitting at full and hiding the overshoot.

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { booked, byWeek, pastTarget, target, workingDays } from '@/composables/useTimesheet'

const { t } = useI18n()

const remaining = computed(() => Math.round((target.value - booked.value) * 2) / 2)
const over = computed(() => Math.max(0, -remaining.value))
const complete = computed(() => remaining.value === 0 && booked.value > 0)

/** Share of the target that is booked. Held at 100 so the bar cannot overrun. */
const percent = computed(() => {
  if (target.value <= 0) return booked.value > 0 ? 100 : 0
  return Math.min(100, Math.round((booked.value / target.value) * 100))
})

/** The overshoot as a share of the target. Drawn on top of a full bar. */
const overPercent = computed(() => {
  if (target.value <= 0) return 0
  return Math.min(100, Math.round((over.value / target.value) * 100))
})

const state = computed(() => {
  if (over.value > 0) return 'over'
  if (complete.value) return 'complete'
  return 'filling'
})

// A short flash when the month is first completed. It fires on the change
// rather than on the state so reopening a finished month does not flash.
const justFinished = ref(false)
watch(complete, (now, before) => {
  if (!now || before === undefined || before) return
  justFinished.value = true
  window.setTimeout(() => {
    justFinished.value = false
  }, 1200)
})

/** One block per calendar week so the shape of the month is visible. */
const weeks = computed(() =>
  byWeek.value.map((week) => {
    const days = week.total
    return { week: week.week, days, filled: days > 0 }
  }),
)

const headline = computed(() => {
  if (over.value > 0) return t('progress.over', { days: over.value })
  if (complete.value) return t('progress.complete')
  return t('progress.remaining', { days: remaining.value })
})
</script>

<template>
  <section class="progress sheet pad" :class="[state, { flash: justFinished }]" data-tour="progress">
    <header>
      <h2 class="eyebrow">{{ t('progress.title') }}</h2>
      <p class="headline">{{ headline }}</p>
    </header>

    <div class="figure">
      <span class="booked num">{{ booked }}</span>
      <span class="of">/</span>
      <span class="target num">{{ target }}</span>
      <span class="unit">{{ t('header.days') }}</span>
    </div>

    <div
      class="track"
      role="progressbar"
      :aria-valuenow="booked"
      :aria-valuemin="0"
      :aria-valuemax="target"
      :aria-label="t('progress.title')"
    >
      <div class="fill" :style="{ width: `${percent}%` }"></div>
      <div v-if="overPercent > 0" class="overfill" :style="{ width: `${overPercent}%` }"></div>
    </div>

    <ul class="weeks">
      <li v-for="week in weeks" :key="week.week" :class="{ filled: week.filled }">
        <span class="label">{{ week.week }}</span>
        <span class="days num">{{ week.days || '' }}</span>
      </li>
    </ul>

    <p class="muted footnote">
      {{ t('progress.workingDays', { working: workingDays }) }}
    </p>

    <!-- The legend for the wash the grid and the board both draw. -->
    <p v-if="pastTarget.size > 0" class="muted footnote spare">
      {{ t('progress.notRequired') }}
    </p>
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 10px;
}

.headline {
  margin: 0;
  font-weight: 700;
}

.figure {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin: 12px 0;
}

.booked {
  font-size: 44px;
  font-weight: 700;
  line-height: 0.95;
}

.of,
.target {
  font-size: 21px;
  color: var(--grey);
}

.unit {
  font-size: 13px;
  color: var(--grey);
}

.track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: var(--warm-grey);
  overflow: hidden;
}

.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: var(--orange);
  /* Slightly overshoot then settle. That is what makes it satisfying. */
  transition: width 420ms cubic-bezier(0.2, 0.9, 0.2, 1.06), background 300ms ease;
}

/* A finished month is not an alert so it hands the orange back. */
.complete .fill {
  background: var(--smart-blue);
}

/* The overshoot is drawn on top of a full bar rather than hidden by it. */
.overfill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: repeating-linear-gradient(
    45deg,
    var(--orange) 0 6px,
    var(--smart-blue) 6px 12px
  );
  transition: width 420ms cubic-bezier(0.2, 0.9, 0.2, 1.06);
}

/* One pulse when the month lands on its target. */
.flash .track {
  animation: pulse 1200ms ease-out;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(0 38 60 / 55%);
  }

  100% {
    box-shadow: 0 0 0 14px rgb(0 38 60 / 0%);
  }
}

.weeks {
  list-style: none;
  display: flex;
  gap: 4px;
  margin: 14px 0 0;
  padding: 0;
}

.weeks li {
  flex: 1;
  display: grid;
  gap: 1px;
  padding: 4px 0 3px;
  border-radius: var(--radius);
  background: var(--warm-grey);
  text-align: center;
  transition: background 300ms ease;
}

.weeks li.filled {
  box-shadow: inset 0 -3px 0 var(--bright-blue);
}

.complete .weeks li.filled {
  box-shadow: inset 0 -3px 0 var(--smart-blue);
}

/* Grey falls to 3.74 on Warm Grey so a week label takes Smart Blue. */
.weeks .label {
  font-size: 9px;
  letter-spacing: 0.06em;
}

.weeks .days {
  font-size: 13px;
  font-weight: 700;
  min-height: 1.1em;
}

.footnote {
  margin: 12px 0 0;
  font-size: 12px;
}

/* The legend follows the working day count so it sits close under it. */
.spare {
  margin-top: 4px;
}

/* Motion is a reward and not information so it goes when it is unwanted. */
@media (prefers-reduced-motion: reduce) {
  .fill,
  .overfill,
  .booked,
  .weeks li {
    transition: none;
  }

  .flash .track {
    animation: none;
  }
}
</style>
