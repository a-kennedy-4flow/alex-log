<script setup lang="ts">
import SetupForm from '@/components/SetupForm.vue'

// The tour points at this page.
import { setPage, startUnlessSeen } from '@/composables/useTour'
import { onMounted } from 'vue'

setPage('settings')
onMounted(() => startUnlessSeen())
</script>

<template>
  <SetupForm />
</template>
