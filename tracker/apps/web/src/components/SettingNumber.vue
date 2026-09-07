<script setup lang="ts">
// A setting typed as a number with its unit.
//
// The unit sits inside the box against the right edge rather than beside it.
// Because a) a unit outside took its width off the field so this one ended up
// shorter than the select above it. b) the box is then the same width as every
// other field on the form. c) the value is right aligned so it reads against
// the unit rather than across a gap.
//
// `tokens.css` is what takes the spinner off a number field. It would sit where
// the unit is.

defineProps<{
  modelValue: number | null
  /** Written against the right edge. One or two characters. */
  unit: string
  min: number
  max: number
  step: number
  /** What the field means when it is left empty. */
  placeholder: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

/**
 * An emptied field reads as null rather than as an empty string. Null is what
 * the profile means by unanswered. An empty string would divide as a zero and
 * `targetDays` would then ask the user for no days at all.
 */
function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  emit('update:modelValue', raw === '' ? null : Number(raw))
}
</script>

<template>
  <span class="wrap">
    <input
      :value="modelValue ?? ''"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :placeholder="placeholder"
      @input="onInput"
    />
    <span class="unit">{{ unit }}</span>
  </span>
</template>

<style scoped>
.wrap {
  position: relative;
  display: block;
  align-self: stretch;
  width: 100%;
}

input {
  height: 100%;
  /* Room for the unit. The left padding is the 10px every control carries. */
  padding-right: 26px;
  text-align: right;
}

/*
 * Smart Blue rather than Grey. The unit sits on the Warm Grey control where
 * Grey falls to 3.74 to 1 and the unit is what the number means.
 */
.unit {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  font-size: 11px;
  pointer-events: none;
}
</style>
