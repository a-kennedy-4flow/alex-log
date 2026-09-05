<script setup lang="ts">
import AdminUpload from '@/components/AdminUpload.vue'

// The tour points at this page.
import { setPage, startUnlessSeen } from '@/composables/useTour'
import { onMounted } from 'vue'

setPage('admin')
onMounted(() => startUnlessSeen())
</script>

<template>
  <AdminUpload />
</template>
