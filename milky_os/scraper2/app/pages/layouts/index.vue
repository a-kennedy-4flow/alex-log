<script setup lang="ts">
useHead({ title: 'Layout Entscheidung' })
const options = [
  {
    to: '/layouts/ledger', name: 'Ledger',
    what: 'Eine Tabelle über die volle Breite. Die Marke ist eine Zeile im Fluss.',
    cost: 'Der Filter steht oben und scrollt weg. Bei 109 Zeilen ist er dann außer Sicht.',
    holds: 'Alle Marken offen. Keine Auswahl.',
  },
  {
    to: '/layouts/rail', name: 'Rail',
    what: 'Eine linke Spalte trägt Filter und Markenindex. Rechts steht die Tabelle.',
    cost: 'Kostet 260 px Breite auf jedem Bildschirm. Zwei Spalten der Tabelle fallen weg.',
    holds: 'Alle Marken offen. Keine Auswahl.',
  },
  {
    to: '/layouts/cards', name: 'Cards',
    what: 'Eine Karte je Artikel in einem Raster mit harten Kanten.',
    cost: 'Ein Drittel der Zeilen passt auf den Schirm. Ein Vergleich zweier Marken braucht Scrollen.',
    holds: 'Alle Marken offen. Keine Auswahl.',
  },
]
</script>

<template>
  <div>
    <section class="sheet">
      <header><h1>Drei Layouts für dasselbe Register</h1></header>
      <div class="body">
        <p class="lede">
          Jede Option liest denselben Datensatz und sitzt in derselben Hülle. Nur die
          Anordnung unterscheidet sich. Jede Seite nennt unten was sie kostet.
        </p>
      </div>
      <div class="body flush">
        <table>
          <thead><tr><th>Option</th><th>Was sie ist</th><th>Was sie kostet</th></tr></thead>
          <tbody>
            <tr v-for="o in options" :key="o.to">
              <td><NuxtLink :to="o.to"><strong>{{ o.name }}</strong></NuxtLink></td>
              <td>{{ o.what }}</td>
              <td>{{ o.cost }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="body">
        <p class="note">
          Keine Option ist gewählt. Die Entscheidung gehört dem Leser dieser Seite.
          Die unterlegenen Optionen bleiben stehen damit die Wahl lesbar bleibt.
        </p>
      </div>
    </section>
  </div>
</template>
