<script setup lang="ts">
/* One bar per article centred on the median of its own age step.

   Every nutrient the article declares falls into one of the seven bands. What sits below
   the median stacks left. What sits above stacks right. The neutral band straddles the
   centre so half of it goes to each side. */

interface Row {
  dan: number; brand: string; slot: number; variant: string; size: string
  counts: number[]; held: number; under: number; over: number; lean: number
  kilo_price: number | null
}
const props = defineProps<{ rows: Row[]; widest: number; held?: string }>()

const part = (row: Row, i: number) => (row.counts[i] / row.held / props.widest) * 100
/* The left half is laid out in reverse so its first block is the one against the centre.
   The neutral band straddles the centre so half of it leads each side. */
const left = (row: Row) => [
  { i: 3, w: part(row, 3) / 2 }, { i: 2, w: part(row, 2) },
  { i: 1, w: part(row, 1) }, { i: 0, w: part(row, 0) },
]
const right = (row: Row) => [
  { i: 3, w: part(row, 3) / 2 }, { i: 4, w: part(row, 4) },
  { i: 5, w: part(row, 5) }, { i: 6, w: part(row, 6) },
]
const FILL = ['#184f95', '#3987e5', '#86b6ef', '#f0efec', '#eda3a3', '#e06a6a', '#b83232']
const dim = (row: Row) => Boolean(props.held) && row.brand !== props.held
</script>

<template>
  <div class="stacks">
    <div
      v-for="row in rows" :key="row.dan"
      class="stack" :class="{ dim: dim(row) }"
      :title="`${row.brand} ${row.variant} — ${row.held} Nährstoffe — über dem Median bei ${row.over} und darunter bei ${row.under}`"
    >
      <span class="who">
        <i class="chip" :style="{ background: brandFill(row.slot) }" />
        <NuxtLink :to="`/article/${row.dan}`">{{ row.brand }} {{ row.variant }}</NuxtLink>
      </span>
      <span class="bar">
        <span class="half l">
          <i v-for="s in left(row)" :key="'l' + s.i" class="seg"
             :style="{ width: s.w + '%', background: FILL[s.i] }" />
        </span>
        <span class="half r">
          <i v-for="s in right(row)" :key="'r' + s.i" class="seg"
             :style="{ width: s.w + '%', background: FILL[s.i] }" />
        </span>
      </span>
      <span class="val">{{ row.lean > 0 ? '+' : '' }}{{ Math.round(row.lean) }}</span>
    </div>
  </div>
</template>

<style scoped>
.stacks { display: flex; flex-direction: column; }
.stack {
  display: grid; grid-template-columns: 250px 1fr 46px;
  align-items: center; gap: 0.6rem; padding: 0.1rem 0;
}
.stack:hover { background: var(--band); }
.stack.dim { opacity: 0.35; }
.who {
  font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chip { width: 9px; height: 9px; display: inline-block; margin-right: 0.35rem; }
.bar { display: flex; height: 14px; border-left: 1px solid var(--rule); border-right: 1px solid var(--rule); }
.half { display: flex; width: 50%; }
/* The left half fills from the centre outwards so its blocks run in reverse.
   Under row-reverse the start of the main axis is the right edge which is the centre. */
.half.l { flex-direction: row-reverse; justify-content: flex-start; }
.seg { display: block; height: 100%; border-right: 1px solid var(--sheet); }
.half.l .seg { border-right: 0; border-left: 1px solid var(--sheet); }
.val {
  text-align: right; font-size: 0.8rem; font-variant-numeric: tabular-nums; color: var(--quiet);
}
/* The centre line is what every bar is read against. */
.bar { position: relative; }
.bar::after {
  content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px;
  width: 1px; background: var(--ink);
}
</style>
