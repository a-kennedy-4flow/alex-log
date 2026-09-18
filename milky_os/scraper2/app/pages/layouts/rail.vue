<script setup lang="ts">
const { data } = await useFetch('/api/articles', { key: 'layout-rail' })
useHead({ title: 'Layout Rail' })
</script>

<template>
  <div v-if="data" class="split">
    <aside class="sheet rail">
      <header><h2>Filter</h2></header>
      <div class="body">
        <div class="field"><label>Suche</label><input placeholder="Marke oder Name"></div>
        <p class="note" style="margin-top:0.8rem">Altersstufe</p>
        <ul class="index">
          <li v-for="s in data.stages" :key="s"><a href="#">{{ s }}</a></li>
        </ul>
        <p class="note" style="margin-top:0.8rem">Marken</p>
        <ul class="index">
          <li v-for="b in data.brands" :key="b.name">
            <i class="chip" :style="{ background: brandFill(b.slot) }" />
            <a href="#">{{ b.name }}</a> <span class="note">{{ b.shown }}</span>
          </li>
        </ul>
      </div>
    </aside>
    <section class="sheet">
      <header><h1>Rail</h1><span class="note">{{ data.rows.length }} Artikel</span></header>
      <div class="body flush"><RegisterRows :rows="data.rows" columns="narrow" /></div>
    </section>
    <OptionCost
      class="full"
      name="Rail"
      what="Die linke Spalte hält Filter und Markenindex dauerhaft sichtbar."
      cost="Kostet 260 px Breite auf jedem Bildschirm. Größe und Brennwert fallen aus der Tabelle."
      holds="Alle Marken offen. Keine Auswahl." />
  </div>
</template>

<style scoped>
.split { display: grid; grid-template-columns: 260px 1fr; gap: var(--gutter); align-items: start; }
.split .full { grid-column: 1 / -1; }
.rail { position: sticky; top: 3rem; }
.index { list-style: none; margin: 0.2rem 0 0; padding: 0; font-size: 0.82rem; }
.index li { padding: 0.15rem 0; border-bottom: 1px solid var(--line); }
.chip { width: 9px; height: 9px; display: inline-block; margin-right: 0.35rem; }
@media (max-width: 860px) { .split { grid-template-columns: 1fr; } .rail { position: static; } }
</style>
