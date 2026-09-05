<script setup lang="ts">
// Draws the tour.
//
// One element sits over the step target and dims everything else with an
// outward shadow. That keeps the target unobscured and needs no mask. The
// target stays clickable because the overlay does not take pointer events.

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { active, back, index, isLast, next, step, steps, stop } from '@/composables/useTour'

const { t } = useI18n()

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const box = ref<Box | null>(null)
const PADDING = 6

function measure(): void {
  const current = step.value
  if (!active.value || !current) {
    box.value = null
    return
  }
  const element = document.querySelector(`[data-tour="${current.anchor}"]`)
  if (!element) {
    box.value = null
    return
  }
  const rect = element.getBoundingClientRect()
  box.value = {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  }
}

async function reveal(): Promise<void> {
  const current = step.value
  if (!current) return
  const element = document.querySelector(`[data-tour="${current.anchor}"]`)
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  await nextTick()
  measure()
  // The smooth scroll settles after the frame so the box is measured again.
  window.setTimeout(measure, 260)
}

/** The tooltip sits under the target unless that would run off the bottom. */
const tip = computed(() => {
  const current = box.value
  if (!current) return null
  const width = Math.min(340, window.innerWidth - 24)
  const below = current.top + current.height + 10
  const above = current.top - 10
  const room = window.innerHeight - below
  const placeBelow = room > 190
  return {
    left: Math.max(12, Math.min(current.left, window.innerWidth - width - 12)),
    top: placeBelow ? below : undefined,
    bottom: placeBelow ? undefined : window.innerHeight - above,
    width,
  }
})

function onKeydown(event: KeyboardEvent): void {
  if (!active.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    stop()
    return
  }
  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    next()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    back()
  }
}

// Immediate because the overlay can mount while a tour is already running. A
// watcher that only fires on change would leave the first step undrawn.
watch(
  [active, index],
  () => {
    if (active.value) void reveal()
    else box.value = null
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
})
</script>

<template>
  <div v-if="active && box" class="tour" data-tour-overlay>
    <div
      class="spot"
      :style="{
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }"
    ></div>

    <div
      v-if="tip"
      class="tip"
      role="dialog"
      :aria-label="t('tour.title')"
      :style="{
        left: `${tip.left}px`,
        top: tip.top === undefined ? undefined : `${tip.top}px`,
        bottom: tip.bottom === undefined ? undefined : `${tip.bottom}px`,
        width: `${tip.width}px`,
      }"
    >
      <header>
        <span class="count num">{{ index + 1 }} / {{ steps.length }}</span>
        <button type="button" class="skip" @click="stop">{{ t('tour.skip') }}</button>
      </header>

      <h3>{{ t(`tour.steps.${step?.key}.title`) }}</h3>
      <p>{{ t(`tour.steps.${step?.key}.body`) }}</p>

      <footer>
        <button type="button" class="btn" :disabled="index === 0" @click="back">
          {{ t('tour.back') }}
        </button>
        <button type="button" class="btn btn-primary" @click="next">
          {{ isLast ? t('tour.done') : t('tour.next') }}
        </button>
      </footer>
      <p class="muted keys">{{ t('tour.keys') }}</p>
    </div>
  </div>
</template>

<style scoped>
.tour {
  position: fixed;
  inset: 0;
  z-index: 100;
  /* The dimming is drawn by the spot so this layer must not swallow clicks. */
  pointer-events: none;
}

.spot {
  position: fixed;
  border-radius: var(--radius-lg);
  box-shadow:
    0 0 0 9999px rgb(11 37 69 / 58%),
    0 0 0 2px var(--orange);
  transition:
    top 220ms ease,
    left 220ms ease,
    width 220ms ease,
    height 220ms ease;
}

.tip {
  position: fixed;
  pointer-events: auto;
  background: var(--white);
  border: 1px solid var(--navy-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 30px rgb(11 37 69 / 28%);
  padding: 12px 14px 10px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.count {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--navy-soft);
}

.skip {
  border: 0;
  background: none;
  color: var(--navy-soft);
  font-size: 12px;
  text-decoration: underline;
  padding: 0;
}

.skip:hover {
  color: var(--navy);
}

h3 {
  margin: 0 0 4px;
  font-size: 15px;
}

p {
  margin: 0;
}

footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.keys {
  margin: 8px 0 0;
  font-size: 10px;
  text-align: right;
}

@media (prefers-reduced-motion: reduce) {
  .spot {
    transition: none;
  }
}
</style>
