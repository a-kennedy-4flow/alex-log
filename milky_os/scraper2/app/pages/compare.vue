<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const encoding = ref<'value' | 'price' | 'emphasis'>('value')
const held = ref('')
const view = ref<'chart' | 'table'>('chart')

const { data } = await useFetch('/api/compare', {
  query: computed(() => ({ stage: route.query.stage, nutrient: route.query.nutrient })),
})
const pick = (key: string, value: string) =>
  router.push({ query: { ...route.query, [key]: value } })
useHead({ title: () => `Vergleich — ${data.value?.stage} ${data.value?.nutrient}` })

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
        <h1><a class="what" :href="profileHref(data.nutrient)">{{ data.nutrient }}</a> in der Stufe {{ data.stage }}</h1>
        <span class="note">{{ data.rows.length }} Artikel je 100 ml</span>
      </header>
      <div class="body">
        <div class="toolbar">
          <div class="field">
            <label for="stage">Altersstufe</label>
            <select id="stage" :value="data.stage" @change="pick('stage', ($event.target as HTMLSelectElement).value)">
              <option v-for="s in data.stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label for="nutrient">Nährstoff</label>
            <select id="nutrient" :value="data.nutrient" @change="pick('nutrient', ($event.target as HTMLSelectElement).value)">
              <option v-for="n in data.nutrients" :key="n.name" :value="n.name">{{ n.name }} ({{ n.unit }})</option>
            </select>
          </div>
          <div class="field">
            <label>Farbe</label>
            <div class="switch">
              <button :class="{ on: encoding === 'value' }" @click="encoding = 'value'">Abweichung</button>
              <button :class="{ on: encoding === 'price' }" @click="encoding = 'price'">Preis</button>
              <button :class="{ on: encoding === 'emphasis' }" @click="encoding = 'emphasis'">Marke hervorheben</button>
            </div>
          </div>
          <div class="field" v-if="encoding === 'emphasis'">
            <label for="held">Marke</label>
            <select id="held" v-model="held">
              <option value="">keine</option>
              <option v-for="b in brands" :key="b.name" :value="b.name">{{ b.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Ansicht</label>
            <div class="switch">
              <button :class="{ on: view === 'chart' }" @click="view = 'chart'">Grafik</button>
              <button :class="{ on: view === 'table' }" @click="view = 'table'">Tabelle</button>
            </div>
          </div>
        </div>
      </div>
      <div class="body">
        <BandLegend v-if="encoding === 'value'" />
        <BandLegend v-else-if="encoding === 'price'" what="Anteil am Medianpreis der Altersstufe" />
        <p v-else class="legend">
          <span class="key"><i class="chip" :style="{ background: SERIES[0] }" />{{ held || 'keine Marke gewählt' }}</span>
          <span class="key"><i class="chip ring" />übriges Feld</span>
        </p>
        <DotPlot
          v-if="view === 'chart'"
          :rows="data.rows" :unit="data.unit" :median="data.median"
          :encoding="encoding" :held="held"
        />
        <table v-else>
          <thead>
            <tr>
              <th>Marke</th><th>Rezeptur</th><th>Größe</th>
              <th class="num">Angabe</th><th class="num">Anteil am Median</th><th class="num">€ je kg</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.rows" :key="row.dan">
              <td><i class="chip" :style="{ background: brandFill(row.slot) }" />{{ row.brand }}</td>
              <td><NuxtLink :to="`/article/${row.dan}`">{{ row.variant }}</NuxtLink></td>
              <td>{{ row.size }}</td>
              <td class="num">{{ row.text }}</td>
              <td class="num" :style="{ background: band(row.ratio).fill, color: band(row.ratio).ink }">{{ share(row.ratio) }}</td>
              <td class="num">{{ euro(row.kilo_price) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="body" v-if="data.silent.length">
        <p class="note">
          Ohne Angabe für {{ data.nutrient }}:
          {{ data.silent.map((s: any) => s.brand + ' ' + s.variant).join(' · ') }}
        </p>
      </div>
    </section>

    <div class="cost">
      <strong>Was diese Ansicht kostet</strong>
      Ein Punkt trägt nur eine Zahl. Der Vergleich zweier Nährstoffe braucht zwei Aufrufe.
      Die Marke trägt hier keinen eigenen Farbton. Weil a) auf einer Streuung jeder Punkt
      neben jedem anderen liegen kann b) fünf der achtundzwanzig Paare der acht Farbtöne
      den Abstand für diesen Fall nicht halten c) eine hervorgehobene Marke gegen ein graues
      Feld dieselbe Frage beantwortet.
    </div>
  </div>
</template>

<style scoped>
.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
.chip.ring { background: #ffffff; border: 1.5px solid #8b92a1; }
</style>
