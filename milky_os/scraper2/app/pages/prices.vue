<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const view = ref<'chart' | 'table'>('chart')
const { data } = await useFetch('/api/prices', { query: computed(() => ({ stage: route.query.stage })) })
useHead({ title: 'Preisvergleich' })
const multi = computed(() => (data.value?.rows || []).filter((r: any) => r.offers.filter((o: any) => o).length > 1))
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header>
        <h1>Was drei Händler für dieselbe Packung verlangen</h1>
        <span class="note">{{ multi.length }} Artikel mit mehr als einem Angebot</span>
      </header>
      <div class="body">
        <div class="toolbar">
          <div class="field">
            <label for="stage">Altersstufe</label>
            <select id="stage" :value="data.stage" @change="router.push({ query: { stage: ($event.target as HTMLSelectElement).value } })">
              <option value="alle">alle</option>
              <option v-for="s in data.stages" :key="s" :value="s">{{ s }}</option>
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
        <p class="legend">
          <span class="key" v-for="(site, i) in data.sites" :key="site">
            <i class="chip" :style="{ background: SERIES[i % 3] }" />{{ site }}
          </span>
          <span class="key"><i class="chip faded" />Treffer über den Namen statt über den Barcode</span>
        </p>
      </div>
      <div class="body">
        <PriceBars v-if="view === 'chart'" :rows="multi" :sites="data.sites" />
        <table v-else>
          <thead>
            <tr>
              <th>Marke</th><th>Rezeptur</th><th>Stufe</th><th>Größe</th>
              <th class="num" v-for="site in data.sites" :key="site">{{ site }}</th>
              <th class="num">Spanne je kg</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.rows" :key="row.dan">
              <td><i class="chip" :style="{ background: brandFill(row.slot) }" />{{ row.brand }}</td>
              <td><NuxtLink :to="`/article/${row.dan}`">{{ row.variant }}</NuxtLink></td>
              <td>{{ row.stage }}</td>
              <td>{{ row.size }}</td>
              <td class="num" v-for="(offer, i) in row.offers" :key="i">
                <template v-if="offer">
                  <a :href="offer.url" rel="nofollow noopener" :title="offer.title">{{ euro(offer.price) }}</a>
                  <span class="per">{{ euro(offer.per_kilo) }}/kg</span>
                </template>
                <template v-else>—</template>
              </td>
              <td class="num">{{ row.spread === null ? '—' : euro(row.spread) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="cost">
      <strong>Was dieser Vergleich kostet</strong>
      Nur dm nennt die Artikelnummer. Bei den anderen beiden entscheidet der Barcode oder
      sonst Marke Altersstufe und Packungsgröße. Ein Treffer über den Namen wird blasser
      gezeichnet. Ein Händler ohne Treffer führt die Packung nicht oder nennt sie anders.
    </div>
  </div>
</template>

<style scoped>
.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
.chip.faded { background: #2a78d6; opacity: 0.55; }
.per { display: block; font-size: 0.7rem; color: var(--quiet); }
</style>
