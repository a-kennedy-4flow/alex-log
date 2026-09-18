<script setup lang="ts">
const { data } = await useFetch('/api/overview', { key: 'about' })
useHead({ title: 'Methode' })
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header><h1>Woher die Zahlen kommen</h1></header>
      <div class="body">
        <h2>Nährwerte</h2>
        <p>Jede Angabe ist die Angabe die dm veröffentlicht. Nichts wird korrigiert.</p>
        <p>Gezählt wird nur die Spalte je 100 ml des trinkfertigen Erzeugnisses.</p>
        <p>Trinkfertige Artikel und Zweitgebinde derselben Rezeptur fehlen.</p>

        <h2>Preise</h2>
        <p>dm nennt die Artikelnummer selbst. Der Preis steht neben der Deklaration.</p>
        <p>Bei den anderen Händlern entscheidet zuerst der Barcode.</p>
        <p>Ohne Barcodetreffer müssen Marke Altersstufe und Packungsgröße übereinstimmen.</p>
        <p>Eine erklärte Eigenschaft muss auf beiden Seiten stehen. Ziegenmilch ist eine solche.</p>

        <h2>Farbe</h2>
        <p>Die Abweichung vom Median der Altersstufe trägt eine divergierende Rampe.</p>
        <p>Drei Blaustufen stehen unter dem Median und drei Rotstufen darüber.</p>
        <p>Die Marke trägt acht kategoriale Farben in fester Reihenfolge.</p>
        <p>Eine Marke jenseits des achten Rangs trägt das Grau statt eines neunten Farbtons.</p>
        <p>Im Punktdiagramm trägt die Marke gar keinen Farbton. Weil a) dort jeder Punkt neben
           jedem anderen liegen kann b) fünf der achtundzwanzig Paare der acht Farbtöne den
           Abstand für diesen Fall nicht halten c) eine hervorgehobene Marke gegen ein graues
           Feld dieselbe Frage beantwortet.</p>
        <p>Die Altersstufe trägt nie eine Farbe. Weil a) sieben Stufen aus einem Farbton keinen
           Helligkeitsabstand von 0,06 halten b) enger gesetzte Stufen unter Farbfehlsichtigkeit
           zusammenfallen c) die Stufe ohnehin in der Achse oder im Titel steht.</p>
        <p>Jede Grafik hat eine Tabelle als Zwilling. Keine Zahl steckt allein in der Farbe.</p>

        <h2>Lauf</h2>
        <p>{{ data.articles }} Artikel. {{ data.nutrients }} Nährstoffe. {{ data.priced }} mit Preis.</p>
        <p>Stand {{ data.gathered_on }}.</p>
      </div>
    </section>
  </div>
</template>
