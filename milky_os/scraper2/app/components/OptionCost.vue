<script setup lang="ts">
/* Every option page ends with what it is and what it costs. */
defineProps<{ name: string; what: string; cost: string; holds: string }>()
</script>

<template>
  <div class="cost">
    <strong>Option {{ name }}</strong>
    {{ what }} {{ cost }}
    <span class="held">Festgehalten: {{ holds }}</span>
  </div>
</template>

<style scoped>
.held { display: block; margin-top: 0.3rem; color: var(--quiet); font-size: 0.78rem; }
</style>
