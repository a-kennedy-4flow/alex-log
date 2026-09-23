<script setup lang="ts">
// A count with its two arrows standing inside the box.
//
// `tokens.css` takes the browser spinner off every number field. Because a) the
// browser draws it over a right aligned value. b) Chrome draws it on hover
// alone so the figure appears to move as the pointer crosses it. These arrows
// answer both. The box reserves the width they stand in so they cover no digit
// and they are drawn whether or not a pointer is near.
//
// The up and down keys already step a number field. That belongs to the input
// and not to the arrows, so the keyboard needs nothing added. The arrows are
// what a pointer only user steps the count with.

import { useI18n } from 'vue-i18n'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const { t } = useI18n()

/** Never past either end. An arrow steps the field the way a key does. */
function step(by: number): void {
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, props.modelValue + by)))
}

/** An emptied field reads as the low end rather than as a blank count. */
function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  emit('update:modelValue', raw === '' ? props.min : Number(raw))
}
</script>

<template>
  <span class="wrap">
    <input
      class="num"
      type="number"
      :value="modelValue"
      :min="min"
      :max="max"
      step="1"
      @input="onInput"
    />
    <span class="arrows">
      <button
        type="button"
        :disabled="modelValue >= max"
        :aria-label="t('common.increase')"
        @click="step(1)"
      >
        <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M4.5 0 9 6H0z" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        :disabled="modelValue <= min"
        :aria-label="t('common.decrease')"
        @click="step(-1)"
      >
        <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M4.5 6 9 0H0z" fill="currentColor" />
        </svg>
      </button>
    </span>
  </span>
</template>

<style scoped>
.wrap {
  position: relative;
  display: block;
}

/*
 * The box is 56px tall so the two arrows inside it are 24px each. A target
 * under 24px is one a pointer misses and the browser spinner this replaces was
 * 15px.
 */
input {
  min-height: 56px;
  /* Room for the arrows. The left padding is the 10px every control carries. */
  padding-right: 42px;
  text-align: right;
}

.arrows {
  position: absolute;
  top: 3px;
  right: 3px;
  bottom: 3px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* White on the Warm Grey of the field. The arrow is a raised key rather than a
   mark printed on the box. */
.arrows button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 32px;
  padding: 0;
  border: 0;
  border-radius: calc(var(--radius) - 8px);
  background: var(--white);
  color: var(--smart-blue);
}

.arrows button:hover:not(:disabled) {
  background: var(--smart-blue);
  color: var(--white);
}

/* The end of the count. The arrow stays where it is rather than leaving a hole
   the other one would jump into. */
.arrows button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
