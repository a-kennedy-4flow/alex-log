<script setup lang="ts">
const { data } = await useFetch('/api/articles', { key: 'layout-cards' })
useHead({ title: 'Layout Cards' })
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header><h1>Cards</h1><span class="note">{{ data.rows.length }} Artikel</span></header>
      <div class="body">
        <div class="toolbar">
          <div class="field"><label>Suche</label><input placeholder="Marke oder Name"></div>
        </div>
      </div>
    </section>
    <div class="grid">
      <article v-for="row in data.rows" :key="row.dan" class="card">
        <div class="strip" :style="{ background: brandFill(row.slot) }" />
        <div class="inner">
          <h3><NuxtLink :to="`/article/${row.dan}`">{{ row.brand }} {{ row.variant || row.name }}</NuxtLink></h3>
          <p class="note">{{ row.stage }} · {{ row.size }}</p>
          <dl>
            <div><dt>Preis</dt><dd>{{ euro(row.price) }}</dd></div>
            <div><dt>€ je kg</dt><dd :style="{ background: band(row.price_ratio).fill, color: band(row.price_ratio).ink }">{{ euro(row.kilo_price) }}</dd></div>
            <div><dt>kcal</dt><dd>{{ figure(row.energy, 0) }}</dd></div>
            <div><dt>Händler</dt><dd>{{ row.shops }}</dd></div>
          </dl>
        </div>
      </article>
    </div>
    <OptionCost
      name="Cards"
      what="Eine Karte je Artikel trägt vier Zahlen und die Markenfarbe als Streifen."
      cost="Ein Drittel der Zeilen passt auf den Schirm. Zwei Marken zu vergleichen braucht Scrollen."
      holds="Alle Marken offen. Keine Auswahl." />
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); margin-bottom: var(--gutter); }
.card { background: var(--sheet); display: flex; }
.strip { width: 5px; flex: none; }
.inner { padding: 0.7rem 0.8rem; }
.card h3 { font-size: 0.88rem; }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem 0.8rem; margin: 0.6rem 0 0; font-size: 0.8rem; }
dt { color: var(--quiet); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; }
dd { margin: 0; font-variant-numeric: tabular-nums; display: inline-block; padding: 0 0.2rem; }
</style>
