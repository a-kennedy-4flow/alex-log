<script setup lang="ts">
const { data } = await useFetch('/api/articles', { key: 'layout-ledger' })
useHead({ title: 'Layout Ledger' })
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header><h1>Ledger</h1><span class="note">{{ data.rows.length }} Artikel</span></header>
      <div class="body">
        <div class="toolbar">
          <div class="field"><label>Suche</label><input placeholder="Marke Name oder Artikelnummer"></div>
          <div class="field"><label>Altersstufe</label>
            <select><option>alle</option><option v-for="s in data.stages" :key="s">{{ s }}</option></select>
          </div>
        </div>
      </div>
      <div class="body flush"><RegisterRows :rows="data.rows" /></div>
    </section>
    <OptionCost
      name="Ledger"
      what="Eine Tabelle über die volle Breite trägt jede Spalte."
      cost="Der Filter steht oben und scrollt nach der zwanzigsten Zeile weg."
      holds="Alle Marken offen. Keine Auswahl." />
  </div>
</template>
