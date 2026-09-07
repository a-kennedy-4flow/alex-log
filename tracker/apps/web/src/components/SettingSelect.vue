<script setup lang="ts">
// A setting picked from a list.
//
// The list is given as values and labels rather than read from the catalogue
// here. Because a) four of these hold four different catalogue shapes. b) the
// wording of an option belongs to the screen that asks the question. c) the
// select is then the root element so the screen can still mark it.

defineProps<{
  modelValue: string | null
  options: { value: string; label: string }[]
  /** The wording for the empty option. Absent leaves it out. */
  none?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value === '' ? null : value)
}
</script>

<template>
  <select :value="modelValue ?? ''" @change="onChange">
    <option v-if="none !== undefined" value="">{{ none }}</option>
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
