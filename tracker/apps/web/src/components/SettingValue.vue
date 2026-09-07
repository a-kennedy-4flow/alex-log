<script setup lang="ts">
// A setting the user cannot change. Cognito owns the name and the email.
//
// It is a readonly input rather than a line of text so it takes the same box as
// the fields around it. The Warm Grey ground is what says it cannot be typed
// into.

defineProps<{ value: string }>()
</script>

<template>
  <input :value="value" type="text" readonly />
</template>

<style scoped>
input {
  color: var(--grey);
}
</style>
