<script setup lang="ts">
/* The diverging bands. A legend is present whenever colour carries meaning. */
defineProps<{ what?: string }>()
const bands = [
  { fill: '#184f95', label: 'unter 60' },
  { fill: '#3987e5', label: '60' },
  { fill: '#86b6ef', label: '85' },
  { fill: '#f0efec', label: '95 bis 105' },
  { fill: '#eda3a3', label: '115' },
  { fill: '#e06a6a', label: '140' },
  { fill: '#b83232', label: 'über 140' },
]
</script>

<template>
  <p class="legend">
    <span>{{ what || 'Anteil am Median der Altersstufe' }}</span>
    <span class="ramp">
      <span v-for="b in bands" :key="b.fill" :style="{ background: b.fill }" :title="b.label + ' %'" />
    </span>
    <span>niedriger&nbsp;&larr;&nbsp;Median&nbsp;&rarr;&nbsp;höher</span>
    <span class="key"><i class="chip" style="background:#ffffff" /> nicht angegeben</span>
  </p>
</template>
