<script setup lang="ts">
/* Every nutrient of one age step as a share of that step median.

   Colour carries the value so the cell holds no number. The table twin under View holds
   every figure. */

interface Cell { nutrient: string; ratio: number | null; text: string | null }
interface Row {
  dan: number; brand: string; slot: number; variant: string; size: string
  kilo_price: number | null; price_ratio: number | null; cells: Cell[]
}
defineProps<{ rows: Row[]; columns: { name: string; unit: string }[] }>()
</script>

<template>
  <div class="matrix">
    <table class="tight">
      <thead>
        <tr>
          <th class="sticky">Artikel</th>
          <th class="turn" v-for="c in columns" :key="c.name"><span><a class="what" :href="profileHref(c.name)">{{ c.name }}</a></span></th>
          <th class="turn"><span>€ je kg</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.dan">
          <th class="sticky article">
            <i class="chip" :style="{ background: brandFill(row.slot) }" />
            <NuxtLink :to="`/article/${row.dan}`">{{ row.brand }} {{ row.variant }}</NuxtLink>
          </th>
          <td
            v-for="cell in row.cells"
            :key="cell.nutrient"
            class="cellbox"
            :style="{ background: band(cell.ratio).fill }"
            :title="`${cell.nutrient} — ${cell.text ?? 'nicht angegeben'} — ${share(cell.ratio)} des Medians`"
          />
          <td class="cellbox" :style="{ background: band(row.price_ratio).fill }"
              :title="`${euro(row.kilo_price)} je kg — ${share(row.price_ratio)} des Medianpreises`" />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.matrix { overflow-x: auto; }
table { table-layout: fixed; width: auto; }
/* The heading holds sideways but never against the page. Because a) the rotated heading is
   nine rem tall b) held against the page it covers the first row c) the grid only needs the
   article column to survive a sideways scroll. */
thead th, thead th.sticky { top: auto; }
thead th:not(.sticky) { position: static; }
.turn { height: 9rem; vertical-align: bottom; padding: 0 !important; width: 15px; }
.turn span {
  display: block; writing-mode: vertical-rl; transform: rotate(180deg);
  font-size: 0.66rem; text-transform: none; letter-spacing: 0; white-space: nowrap;
  padding: 0 0 0.3rem 0;
}
.sticky {
  position: sticky; left: 0; background: var(--sheet); z-index: 2;
  width: 250px; max-width: 250px; text-align: left;
  border-right: 1px solid var(--rule); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
thead .sticky { background: var(--band); z-index: 3; vertical-align: bottom; }
.article { font-weight: 500; font-size: 0.76rem; text-transform: none; letter-spacing: 0; vertical-align: middle; }
.article .chip { width: 9px; height: 9px; display: inline-block; margin-right: 0.35rem; }
/* The cell takes the height of its row so a colour lines up with the name beside it. */
.cellbox { width: 15px; padding: 0 !important; border: 1px solid var(--sheet); }
</style>
