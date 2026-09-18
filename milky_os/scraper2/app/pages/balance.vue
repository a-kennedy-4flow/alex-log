<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const view = ref<'chart' | 'table'>('chart')
const held = ref('')
const { data } = await useFetch('/api/balance', { query: computed(() => ({ stage: route.query.stage })) })
useHead({ title: () => `Die Neigung — ${data.value?.stage}` })
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
        <h1>Welche Packungen über dem Feld liegen und welche darunter</h1>
        <span class="note">{{ data.rows.length }} Artikel über {{ data.nutrients }} Nährstoffe</span>
      </header>
      <div class="body">
        <p class="lede">
          Jeder Nährstoff der Stufe fällt in eines der sieben Bänder. Was unter dem Median
          liegt staut sich nach links. Was darüber liegt staut sich nach rechts. Die Zahl
          rechts ist die Neigung in Punkten.
        </p>
        <div class="toolbar">
          <div class="field">
            <label for="stage">Altersstufe</label>
            <select id="stage" :value="data.stage" @change="router.push({ query: { stage: ($event.target as HTMLSelectElement).value } })">
              <option v-for="s in data.stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="field">
            <label for="held">Marke hervorheben</label>
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
        <BandLegend />
      </div>
      <div class="body">
        <LeanBars v-if="view === 'chart'" :rows="data.rows" :widest="data.widest" :held="held" />
        <table v-else>
          <thead>
            <tr>
              <th>Marke</th><th>Rezeptur</th>
              <th class="num">Nährstoffe</th><th class="num">darunter</th>
              <th class="num">im Median</th><th class="num">darüber</th>
              <th class="num">Neigung</th><th class="num">€ je kg</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.rows" :key="row.dan">
              <td><i class="chip" :style="{ background: brandFill(row.slot) }" />{{ row.brand }}</td>
              <td><NuxtLink :to="`/article/${row.dan}`">{{ row.variant }}</NuxtLink></td>
              <td class="num">{{ row.held }}</td>
              <td class="num">{{ row.under }}</td>
              <td class="num">{{ row.counts[3] }}</td>
              <td class="num">{{ row.over }}</td>
              <td class="num">{{ row.lean > 0 ? '+' : '' }}{{ Math.round(row.lean) }}</td>
              <td class="num">{{ euro(row.kilo_price) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="cost">
      <strong>Was diese Ansicht kostet</strong>
      Ein Band zählt einen Nährstoff statt ihn zu wiegen. Vitamin K zählt so viel wie
      Eiweiß. Die Bänder sind grob. Fünf Punkte und vierundzwanzig Punkte landen im selben
      Block. Ein Artikel ohne Angabe wird nicht als niedrig gezählt.
    </div>
  </div>
</template>

<style scoped>
.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
</style>
