<script setup lang="ts">
/* What each shop asks per kilo for the same pack.

   A grouped bar rather than a dot plot. Because a) the reader is comparing three named
   shops rather than a field of articles b) three series clear the colour vision gate on
   every pair c) a bar from zero is honest for a price. */

interface Offer { site: string; per_kilo: number | null; price: number; title: string; score: number; url: string }
interface Row { dan: number; brand: string; variant: string; size: string; stage: string; offers: (Offer | null)[] }
const props = defineProps<{ rows: Row[]; sites: string[] }>()

const LABEL = 250
const WIDTH = 900
const BAR = 9
const GAP = 3
const TOP = 20

const rowHeight = computed(() => props.sites.length * (BAR + GAP) + 10)
const height = computed(() => TOP + props.rows.length * rowHeight.value + 18)
const high = computed(() => Math.max(
  1,
  ...props.rows.flatMap((r) => r.offers.map((o) => o?.per_kilo ?? 0)),
))
const x = (value: number) => (value / high.value) * (WIDTH - LABEL - 70)
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((p) => high.value * p))
</script>

<template>
  <svg class="plot" :viewBox="`0 0 ${WIDTH} ${height}`" role="img">
    <line v-for="(t, i) in ticks" :key="i" class="grid" :x1="LABEL + x(t)" :x2="LABEL + x(t)" :y1="TOP - 8" :y2="height - 16" />
    <text v-for="(t, i) in ticks" :key="'t' + i" class="tick" :x="LABEL + x(t)" :y="height - 4" text-anchor="middle">
      {{ figure(t, 0) }}
    </text>
    <text class="tick" :x="WIDTH - 4" :y="height - 4" text-anchor="end">€ je kg</text>
    <g v-for="(row, r) in rows" :key="row.dan" class="row">
      <text class="label" x="0" :y="TOP + r * rowHeight + 12">
        <title>{{ row.brand }} {{ row.variant }} · {{ row.size }}</title>
        {{ row.brand }} {{ row.variant }}
      </text>
      <text class="tick" x="0" :y="TOP + r * rowHeight + 26">{{ row.stage }} · {{ row.size }}</text>
      <template v-for="(offer, s) in row.offers" :key="s">
        <rect
          v-if="offer && offer.per_kilo"
          :x="LABEL"
          :y="TOP + r * rowHeight + s * (BAR + GAP)"
          :width="Math.max(1, x(offer.per_kilo))"
          :height="BAR"
          :fill="SERIES[s % 3]"
          :opacity="offer.score < 0.8 ? 0.55 : 1"
        >
          <title>{{ sites[s] }} — {{ euro(offer.per_kilo) }} je kg — {{ euro(offer.price) }} — {{ offer.title }}</title>
        </rect>
        <text
          v-if="offer && offer.per_kilo"
          class="tick"
          :x="LABEL + Math.max(1, x(offer.per_kilo)) + 5"
          :y="TOP + r * rowHeight + s * (BAR + GAP) + 8"
        >{{ euro(offer.per_kilo) }}</text>
      </template>
    </g>
  </svg>
</template>
