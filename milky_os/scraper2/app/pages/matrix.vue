<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const view = ref<'grid' | 'table'>('grid')
const { data } = await useFetch('/api/matrix', { query: computed(() => ({ stage: route.query.stage })) })
useHead({ title: () => `Matrix — ${data.value?.stage}` })
const brands = computed(() => {
  const seen = new Map<string, number>()
  for (const row of data.value?.rows || []) seen.set(row.brand, row.slot)
  return [...seen].map(([name, slot]) => ({ name, slot }))
})
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header>
        <h1>Ganze Tabelle der Stufe {{ data.stage }}</h1>
        <span class="note">{{ data.rows.length }} Artikel über {{ data.columns.length }} Nährstoffe</span>
      </header>
      <div class="body">
        <div class="toolbar">
          <div class="field">
            <label for="stage">Altersstufe</label>
            <select id="stage" :value="data.stage" @change="router.push({ query: { stage: ($event.target as HTMLSelectElement).value } })">
              <option v-for="s in data.stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label>Ansicht</label>
            <div class="switch">
              <button :class="{ on: view === 'grid' }" @click="view = 'grid'">Matrix</button>
              <button :class="{ on: view === 'table' }" @click="view = 'table'">Tabelle</button>
            </div>
          </div>
        </div>
        <BandLegend />
        <BrandLegend :brands="brands" />
      </div>
      <div class="body flush">
        <MatrixGrid v-if="view === 'grid'" :rows="data.rows" :columns="data.columns" />
        <table v-else class="tight">
          <thead>
            <tr><th>Artikel</th><th>Nährstoff</th><th class="num">Angabe</th><th class="num">Anteil</th></tr>
          </thead>
          <tbody>
            <template v-for="row in data.rows" :key="row.dan">
              <tr v-for="cell in row.cells.filter((c: any) => c.ratio !== null)" :key="row.dan + cell.nutrient">
                <td>{{ row.brand }} {{ row.variant }}</td>
                <td><a class="what" :href="profileHref(cell.nutrient)">{{ cell.nutrient }}</a></td>
                <td class="num">{{ cell.text }}</td>
                <td class="num" :style="{ background: band(cell.ratio).fill, color: band(cell.ratio).ink }">{{ share(cell.ratio) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <div class="cost">
      <strong>Was diese Ansicht kostet</strong>
      Die Zelle trägt die Farbe und keine Zahl. Die Angabe erscheint erst im Hinweis oder in
      der Tabelle. Eine Zeile ohne Angabe bleibt weiß und zählt nicht als niedrig.
    </div>
  </div>
</template>
