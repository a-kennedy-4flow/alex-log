<script setup lang="ts">
const { data } = await useFetch('/api/overview')
useHead({ title: 'Babymilch Register — Übersicht' })
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header><h1>Babymilch der Kategorie 050502</h1></header>
      <div class="body">
        <p class="lede">
          {{ data.articles }} Artikel von {{ data.brands.length }} Marken über
          {{ data.stages.length }} Altersstufen. {{ data.nutrients }} Nährstoffe.
          {{ data.priced }} Artikel tragen einen Preis von {{ data.sites.length }} Händlern.
        </p>
      </div>
      <div class="body flush">
        <div class="stats">
          <div class="stat">
            <div class="k">Artikel</div><div class="v">{{ data.articles }}</div>
            <div class="s">ohne Trinkfertig und ohne Zweitgebinde</div>
          </div>
          <div class="stat">
            <div class="k">Marken</div><div class="v">{{ data.brands.length }}</div>
            <div class="s">größte {{ data.brands[0].name }} mit {{ data.brands[0].articles }}</div>
          </div>
          <div class="stat">
            <div class="k">Nährstoffe</div><div class="v">{{ data.nutrients }}</div>
            <div class="s">je 100 ml trinkfertig</div>
          </div>
          <div class="stat">
            <div class="k">Medianpreis</div><div class="v">{{ euro(data.median_kilo) }}</div>
            <div class="s">je Kilogramm über alle Stufen</div>
          </div>
        </div>
      </div>
    </section>

    <div class="two">
      <section class="sheet">
        <header><h2>Altersstufen</h2><span class="note">Medianpreis je kg</span></header>
        <div class="body flush">
          <table>
            <thead><tr><th>Stufe</th><th class="num">Artikel</th><th class="num">Median € je kg</th><th></th></tr></thead>
            <tbody>
              <tr v-for="stage in data.stages" :key="stage.name">
                <td><NuxtLink :to="`/compare?stage=${encodeURIComponent(stage.name)}`">{{ stage.name }}</NuxtLink></td>
                <td class="num">{{ stage.articles }}</td>
                <td class="num">{{ euro(stage.median_price) }}</td>
                <td class="barcell">
                  <span class="bar" :style="{ width: (stage.median_price / 60 * 100) + '%', background: '#2a78d6' }" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="sheet">
        <header><h2>Marken</h2><span class="note">Farbe entspricht dem Vergleich</span></header>
        <div class="body flush">
          <table>
            <thead><tr><th>Marke</th><th class="num">Artikel</th><th></th></tr></thead>
            <tbody>
              <tr v-for="brand in data.brands" :key="brand.name">
                <td>
                  <i class="chip" :style="{ background: brandFill(brand.slot) }" />
                  <NuxtLink :to="`/register?q=${encodeURIComponent(brand.name)}`">{{ brand.name }}</NuxtLink>
                </td>
                <td class="num">{{ brand.articles }}</td>
                <td class="barcell">
                  <span class="bar" :style="{ width: (brand.articles / data.brands[0].articles * 100) + '%', background: brandFill(brand.slot) }" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="two">
      <section class="sheet">
        <header><h2>Günstigste fünf</h2><span class="note">€ je Kilogramm</span></header>
        <div class="body flush">
          <table>
            <tbody>
              <tr v-for="row in data.cheapest" :key="row.dan">
                <td><NuxtLink :to="`/article/${row.dan}`">{{ row.brand }} {{ row.variant }}</NuxtLink></td>
                <td>{{ row.stage }}</td>
                <td class="num">{{ euro(row.kilo_price) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="sheet">
        <header><h2>Teuerste fünf</h2><span class="note">€ je Kilogramm</span></header>
        <div class="body flush">
          <table>
            <tbody>
              <tr v-for="row in data.dearest" :key="row.dan">
                <td><NuxtLink :to="`/article/${row.dan}`">{{ row.brand }} {{ row.variant }}</NuxtLink></td>
                <td>{{ row.stage }}</td>
                <td class="num">{{ euro(row.kilo_price) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="sheet">
      <header><h2>Händler</h2></header>
      <div class="body">
        <p class="legend">
          <span class="key" v-for="(site, i) in data.sites" :key="site.name">
            <i class="chip" :style="{ background: SERIES[i % 3] }" />{{ site.name }} — {{ site.offers }} Angebote
          </span>
        </p>
        <p class="note">
          dm nennt die Artikelnummer selbst. Die anderen beiden werden über den Barcode gesucht
          und sonst über Marke Altersstufe und Packungsgröße.
          <NuxtLink to="/prices">Zum Preisvergleich</NuxtLink>.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gutter); align-items: start; }
@media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
.barcell { width: 34%; }
.bar { display: block; height: 9px; }
</style>
