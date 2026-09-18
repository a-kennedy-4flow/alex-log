<script setup lang="ts">
const route = useRoute()
const { data } = await useFetch(() => `/api/article/${route.params.dan}`)
useHead({ title: () => `${data.value?.article.brand} ${data.value?.article.variant}` })
const priceBand = computed(() => {
  const a = data.value?.article
  const middle = data.value?.median_price
  if (!a?.kilo_price || !middle) return null
  return a.kilo_price / middle
})
/* A row prints the position its study holds in the list below rather than its key. */
const order = computed(() => new Map(
  (data.value?.cited || []).map((one: { key: string }, i: number) => [one.key, i + 1]),
))
const cite = (key: string) => order.value.get(key) ?? '—'
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header>
        <h1>{{ data.article.brand }} {{ data.article.variant }}</h1>
        <!-- a reference article carries no pack so it carries no size either -->
        <span class="note">
          {{ [data.article.stage, data.article.size, `Artikel ${data.article.dan}`]
              .filter(Boolean).join(' · ') }}
        </span>
      </header>
      <div class="body flush">
        <div class="stats">
          <div class="stat">
            <div class="k">Packungspreis</div><div class="v">{{ euro(data.article.price) }}</div>
            <div class="s">günstigstes der {{ data.article.offers.length }} Angebote</div>
          </div>
          <div class="stat">
            <div class="k">Je Kilogramm</div>
            <div class="v" :style="{ color: band(priceBand).ink === '#ffffff' ? undefined : undefined }">{{ euro(data.article.kilo_price) }}</div>
            <div class="s">{{ share(priceBand) }} des Medians der Stufe</div>
          </div>
          <div class="stat">
            <div class="k">Verglichen mit</div><div class="v">{{ data.peers }}</div>
            <div class="s">Artikeln derselben Stufe</div>
          </div>
          <div class="stat">
            <div class="k">Nicht angegeben</div><div class="v">{{ data.silent.length }}</div>
            <div class="s">von {{ data.rows.length + data.silent.length }} Nährstoffen der Stufe</div>
          </div>
        </div>
      </div>
    </section>

    <section class="sheet warn" v-if="data.warning">
      <header><h2>Nicht für Säuglinge</h2></header>
      <div class="body">
        <p>{{ data.warning.says }}</p>
        <p class="note" v-if="data.warning.cite">
          „{{ data.warning.cite.quote }}"
          <br>{{ data.warning.cite.citation }}
          <a v-if="data.warning.cite.doi" :href="'https://doi.org/' + data.warning.cite.doi"
             rel="nofollow noopener">doi</a>
        </p>
      </div>
    </section>

    <section class="sheet">
      <header><h2>Angebote</h2></header>
      <div class="body flush">
        <table>
          <thead><tr><th>Händler</th><th>Bezeichnung dort</th><th class="num">Preis</th><th class="num">€ je kg</th><th>Treffer</th></tr></thead>
          <tbody>
            <tr v-for="(offer, i) in data.article.offers" :key="offer.site">
              <td><i class="chip" :style="{ background: SERIES[i % 3] }" />{{ offer.site }}</td>
              <td><a :href="offer.url" rel="nofollow noopener">{{ offer.title }}</a></td>
              <td class="num">{{ euro(offer.price) }}</td>
              <td class="num">{{ euro(offer.per_kilo) }}</td>
              <td>{{ { dan: 'Artikelnummer', gtin: 'Barcode', name: 'Name' }[offer.matched] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="sheet">
      <header>
        <h2>Nährwerte gegen den Median der Stufe {{ data.article.stage }}</h2>
        <span class="note">je 100 ml trinkfertig</span>
      </header>
      <div class="body"><BandLegend /></div>
      <div class="body flush">
        <table>
          <thead><tr><th>Nährstoff</th><th class="num">Angabe</th><th class="num">Median</th><th class="num">Anteil</th><th></th><th v-if="data.cited.length" class="num">Quelle</th></tr></thead>
          <tbody>
            <tr v-for="row in data.rows" :key="row.nutrient">
              <td><a class="what" :href="profileHref(row.nutrient)">{{ row.nutrient }}</a></td>
              <td class="num">{{ row.text }}</td>
              <td class="num">{{ figure(row.median, 3) }} {{ row.unit }}</td>
              <td class="num" :style="{ background: band(row.ratio).fill, color: band(row.ratio).ink }">{{ share(row.ratio) }}</td>
              <td class="barcell">
                <span class="axis" />
                <span class="bar"
                      :style="{ background: band(row.ratio).fill,
                                left: (row.ratio < 1 ? Math.max(0, row.ratio * 50) : 50) + '%',
                                width: Math.min(50, Math.abs(row.ratio - 1) * 50) + '%' }" />
              </td>
              <td v-if="data.cited.length" class="num">
                <a v-if="row.source" :href="'#q-' + row.source">{{ cite(row.source) }}</a>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="body" v-if="data.silent.length">
        <p class="note">Ohne Angabe: {{ data.silent.join(' · ') }}</p>
      </div>
    </section>

    <section class="sheet">
      <header>
        <h2>Quellen</h2>
        <span class="note">Jede Zahl nennt die Studie hinter ihr</span>
      </header>
      <div class="body" v-if="data.origin.kind === 'dm'">
        <p>Die Nährwerte sind die Angaben von dm. Erhoben am {{ data.origin.gathered_on }}.
        Nichts wurde korrigiert.
        <a :href="data.article.url" rel="nofollow noopener">Artikelseite bei dm</a>.</p>
      </div>
      <div class="body" v-else>
        <ol class="cites">
          <li v-for="(one, i) in data.cited" :key="one.key" :id="'q-' + one.key">
            {{ one.citation }}
            <a v-if="one.doi" :href="'https://doi.org/' + one.doi" rel="nofollow noopener">doi</a>
            <a v-else-if="one.url" :href="one.url" rel="nofollow noopener">Link</a>
            <span class="detail" v-if="one.table || one.measured || one.period">
              {{ [one.table, one.measured, one.period].filter(Boolean).join(' · ') }}
            </span>
            <span class="detail" v-if="one.quote">„{{ one.quote }}"</span>
            <span class="detail" v-if="one.corrigendum">{{ one.corrigendum }}</span>
            <span class="detail" v-if="one.note">{{ one.note }}</span>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<style scoped>
.warn { border-left: 4px solid var(--accent); }
.what { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--quiet); }
.what:hover, .what:focus { color: var(--accent); border-bottom-color: var(--accent); }
.cites { margin: 0; padding-left: 1.3rem; font-size: 0.85rem; }
.cites li { margin-bottom: 0.6rem; }
.cites li:target { background: var(--band); }
.cites .detail { display: block; color: var(--quiet); font-size: 0.8rem; }

.chip { width: 10px; height: 10px; display: inline-block; margin-right: 0.4rem; }
.barcell { width: 28%; position: relative; height: 22px; }
.barcell .axis { position: absolute; left: 50%; top: 3px; bottom: 3px; width: 1px; background: var(--rule); }
.barcell .bar { position: absolute; top: 6px; height: 9px; }
</style>
