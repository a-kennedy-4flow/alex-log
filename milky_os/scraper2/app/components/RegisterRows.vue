<script setup lang="ts">
/* The rows every layout option draws. One renderer so no option drifts from another. */
defineProps<{ rows: any[]; columns?: 'full' | 'narrow' }>()
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Artikel</th><th>Stufe</th>
        <th v-if="columns !== 'narrow'">Größe</th>
        <th class="num" v-if="columns !== 'narrow'">kcal</th>
        <th class="num">Preis</th><th class="num">€ je kg</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.dan">
        <td>
          <i class="chip" :style="{ background: brandFill(row.slot) }" />
          <NuxtLink :to="`/article/${row.dan}`">{{ row.brand }} {{ row.variant || row.name }}</NuxtLink>
        </td>
        <td>{{ row.stage }}</td>
        <td v-if="columns !== 'narrow'">{{ row.size }}</td>
        <td class="num" v-if="columns !== 'narrow'">{{ figure(row.energy, 0) }}</td>
        <td class="num">{{ euro(row.price) }}</td>
        <td class="num" :style="{ background: band(row.price_ratio).fill, color: band(row.price_ratio).ink }">
          {{ euro(row.kilo_price) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
</style>
