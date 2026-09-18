<script setup lang="ts">
/* Eight slots in their documented order. A brand past the eighth rank takes the grey.

   The list is sorted by slot rather than by the order the rows arrived. Because a) the slot
   comes from the rank across the whole dataset b) a legend that reorders between two pages
   reads as two palettes c) colour follows the brand and never its position in a filter. */
const props = defineProps<{ brands: { name: string; slot: number }[] }>()
const named = computed(() =>
  props.brands.filter((b) => b.slot < SERIES.length).sort((a, b) => a.slot - b.slot))
const rest = computed(() => props.brands.filter((b) => b.slot >= SERIES.length))
</script>

<template>
  <p class="legend">
    <span class="key" v-for="b in named" :key="b.name">
      <i class="chip" :style="{ background: brandFill(b.slot) }" />{{ b.name }}
    </span>
    <span v-if="rest.length" class="key" :title="rest.map((b) => b.name).join(' · ')">
      <i class="chip" :style="{ background: DEEMPH }" />Übrige {{ rest.length }}
    </span>
  </p>
</template>
