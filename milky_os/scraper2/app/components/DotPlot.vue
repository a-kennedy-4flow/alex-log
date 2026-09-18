<script setup lang="ts">
/* One age step and one nutrient on one scale.

   A dot plot rather than bars. Because a) the declared values of a step sit in a narrow
   regulated band b) bars drawn from zero would read as one block c) position on a scale
   that starts where the data starts shows the difference. */

interface Row {
  dan: number; brand: string; slot: number; variant: string; size: string
  value: number; text: string; ratio: number | null
  kilo_price: number | null; price_ratio: number | null
}
const props = defineProps<{
  rows: Row[]; unit: string; median: number | null
  encoding: 'value' | 'price' | 'emphasis'; held?: string
}>()

const LABEL = 250
const RIGHT = 56
const WIDTH = 900
const ROW = 22
const TOP = 26

const span = computed(() => {
  const values = props.rows.map((r) => r.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = (high - low) * 0.08 || Math.abs(high) * 0.05 || 1
  return { low: low - pad, high: high + pad }
})
const height = computed(() => TOP + props.rows.length * ROW + 18)
const x = (value: number) => {
  const { low, high } = span.value
  return LABEL + ((value - low) / (high - low || 1)) * (WIDTH - LABEL - RIGHT)
}
const ticks = computed(() => {
  const { low, high } = span.value
  return [0, 0.25, 0.5, 0.75, 1].map((part) => low + (high - low) * part)
})
const paint = (row: Row) => {
  if (props.encoding === 'emphasis') {
    // One brand in the accent hue and the field in grey. Because a) a picked pair of the
    // eight slots can fall under the separation the scatter gate needs b) every other mark
    // then carries no hue at all c) the question is one brand against the field.
    return row.brand === props.held
      ? { fill: SERIES[0], ring: SERIES[0] }
      : { fill: '#ffffff', ring: DEEMPH }
  }
  return band(props.encoding === 'price' ? row.price_ratio : row.ratio)
}
</script>

<template>
  <svg class="plot" :viewBox="`0 0 ${WIDTH} ${height}`" role="img">
    <line v-for="(t, i) in ticks" :key="i" class="grid" :x1="x(t)" :x2="x(t)" :y1="TOP - 8" :y2="height - 16" />
    <text v-for="(t, i) in ticks" :key="'t' + i" class="tick" :x="x(t)" :y="height - 4" text-anchor="middle">
      {{ figure(t, 3) }}
    </text>
    <text class="tick" :x="WIDTH - 4" :y="height - 4" text-anchor="end">{{ unit }}</text>
    <template v-if="median !== null">
      <line class="axis" :x1="x(median)" :x2="x(median)" :y1="TOP - 14" :y2="height - 16" stroke-dasharray="3 3" />
      <text class="tick" :x="x(median)" :y="TOP - 18" text-anchor="middle">Median {{ figure(median, 3) }}</text>
    </template>
    <g v-for="(row, i) in rows" :key="row.dan" class="row">
      <text
        class="label"
        :class="{ quiet: encoding === 'emphasis' && row.brand !== held }"
        x="0" :y="TOP + i * ROW + 4"
      >
        <title>{{ row.brand }} {{ row.variant }} · {{ row.size }} · {{ row.text }}</title>
        {{ row.brand }} {{ row.variant }}
      </text>
      <line class="grid" :x1="LABEL" :x2="WIDTH - RIGHT" :y1="TOP + i * ROW" :y2="TOP + i * ROW" />
      <circle class="gap" :cx="x(row.value)" :cy="TOP + i * ROW" r="8" />
      <circle
        class="mark" :cx="x(row.value)" :cy="TOP + i * ROW" r="6"
        :fill="paint(row).fill" :stroke="paint(row).ring"
      >
        <title>{{ row.brand }} {{ row.variant }} — {{ row.text }} — {{ share(row.ratio) }} des Medians</title>
      </circle>
      <text class="tick" :x="WIDTH - 4" :y="TOP + i * ROW + 4" text-anchor="end">{{ figure(row.value, 3) }}</text>
    </g>
  </svg>
</template>

<style scoped>
.label.quiet { fill: #5c6270; }
</style>
