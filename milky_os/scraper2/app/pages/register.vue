<script setup lang="ts">
/* The full register. This is the page the layout options are drawn from. */
const route = useRoute()
const router = useRouter()
const { data } = await useFetch('/api/articles', {
  query: computed(() => ({ q: route.query.q, stage: route.query.stage })),
})
useHead({ title: 'Register' })
const set = (key: string, value: string) =>
  router.push({ query: { ...route.query, [key]: value || undefined } })
const grouped = computed(() => {
  const out = new Map<string, any[]>()
  for (const row of data.value?.rows || []) {
    if (!out.has(row.brand)) out.set(row.brand, [])
    out.get(row.brand)!.push(row)
  }
  return [...out].sort((a, b) => b[1].length - a[1].length)
})
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header>
        <h1>Register</h1>
        <span class="note">{{ data.rows.length }} von {{ data.total }} Artikeln</span>
      </header>
      <div class="body">
        <div class="toolbar">
          <div class="field">
            <label for="q">Suche</label>
            <input id="q" :value="route.query.q" placeholder="Marke Name oder Artikelnummer"
                   @input="set('q', ($event.target as HTMLInputElement).value)">
          </div>
          <div class="field">
            <label for="stage">Altersstufe</label>
            <select id="stage" :value="route.query.stage || ''" @change="set('stage', ($event.target as HTMLSelectElement).value)">
              <option value="">alle</option>
              <option v-for="s in data.stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="body flush">
        <table>
          <thead>
            <tr>
              <th>Artikel</th><th>Stufe</th><th>Größe</th>
              <th class="num">kcal je 100 ml</th><th class="num">Eiweiß</th>
              <th class="num">Preis</th><th class="num">€ je kg</th><th class="num">Händler</th>
            </tr>
          </thead>
          <template v-for="[brand, rows] in grouped" :key="brand">
            <tbody>
              <tr class="brandrow">
                <th colspan="8">
                  <i class="chip" :style="{ background: brandFill(rows[0].slot) }" />
                  {{ brand }} <span class="note">{{ rows.length }}</span>
                </th>
              </tr>
              <tr v-for="row in rows" :key="row.dan">
                <td><NuxtLink :to="`/article/${row.dan}`">{{ row.variant || row.name }}</NuxtLink></td>
                <td>{{ row.stage }}</td>
                <td>{{ row.size }}</td>
                <td class="num">{{ figure(row.energy, 0) }}</td>
                <td class="num">{{ figure(row.protein) }}</td>
                <td class="num">{{ euro(row.price) }}</td>
                <td class="num" :style="{ background: band(row.price_ratio).fill, color: band(row.price_ratio).ink }">
                  {{ euro(row.kilo_price) }}
                </td>
                <td class="num">{{ row.shops }}</td>
              </tr>
            </tbody>
          </template>
        </table>
      </div>
    </section>
    <BandLegend what="Preis je kg als Anteil am Medianpreis der Altersstufe" />
  </div>
</template>

<style scoped>
.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
.brandrow th { background: var(--band); text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid var(--rule); font-size: 0.8rem; text-transform: none; letter-spacing: 0; position: static; }
</style>
