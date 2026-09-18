<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { data } = await useFetch('/api/stars', {
  query: computed(() => ({ stage: route.query.stage, spokes: route.query.spokes })),
})
useHead({ title: () => `Sterne — ${data.value?.stage}` })

function pick(what: string, value: string) {
  router.push({ query: { ...route.query, [what]: value } })
}

/* The axis counts doublings so an arm at one times the milk sits on the ring and the
   whole range from an eighth to thirty two times fits on one radius. */
const LOW = -3
const HIGH = 5
const RINGS = [0.25, 1, 4, 16]
const SIZE = 620
const MID = SIZE / 2
const SPAN = SIZE / 2 - 82

const reachOf = (ratio: number) =>
  Math.max(0, Math.min(1, (Math.log2(Math.max(1e-9, ratio)) - LOW) / (HIGH - LOW)))

const axes = computed(() => data.value?.axes || [])
const at = (i: number, f: number) => {
  const turn = (i / axes.value.length) * Math.PI * 2 - Math.PI / 2
  return [MID + Math.cos(turn) * SPAN * f, MID + Math.sin(turn) * SPAN * f]
}
const points = (arms: (number | null)[]) =>
  arms.map((r, i) => (r === null ? null : at(i, reachOf(r)).map((v) => v.toFixed(1)).join(',')))
    .filter(Boolean).join(' ')

/* Which plots are drawn. Everything is on until something is turned off. */
const off = ref(new Set<string>())
const milkOn = ref(true)
const isOn = (brand: string) => !off.value.has(brand)
function toggle(brand: string) {
  const next = new Set(off.value)
  next.has(brand) ? next.delete(brand) : next.add(brand)
  off.value = next
}
function all(on: boolean) {
  off.value = on ? new Set() : new Set((data.value?.brands || []).map((b) => b.name))
  milkOn.value = on
}
watch(() => data.value?.stage, () => { off.value = new Set(); milkOn.value = true })

const lifted = ref<number | null>(null)
const shown = computed(() => (data.value?.packs || []).filter((p) => isOn(p.brand)))

/* The milk of this age is a spread rather than one line so it is drawn as a band. */
const milkBand = computed(() => {
  if (!axes.value.length) return ''
  const outer = axes.value.map((a, i) => at(i, reachOf(a.high)).map((v) => v.toFixed(1)).join(','))
  const inner = axes.value.map((a, i) => at(i, reachOf(a.low)).map((v) => v.toFixed(1)).join(',')).reverse()
  return outer.concat(inner).join(' ')
})
</script>

<template>
  <div v-if="data">
    <section class="sheet">
      <header>
        <h1>Sterne der Stufe {{ data.stage }}</h1>
        <span class="note">
          Ein Arm ist das Vielfache der {{ data.reference }} desselben Alters ·
          {{ data.windows.length }} {{ data.windows.length === 1 ? 'Referenz' : 'Laktationsfenster' }} · {{ data.packs.length }} Packungen
        </span>
      </header>
      <div class="body">
        <div class="controls">
          <label class="control"><span>Altersstufe</span>
            <select :value="data.stage" @change="pick('stage', ($event.target as HTMLSelectElement).value)">
              <option v-for="s in data.stages" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="control"><span>Speichen</span>
            <select :value="data.spokes" @change="pick('spokes', ($event.target as HTMLSelectElement).value)">
              <option v-for="g in data.groups" :key="g.key" :value="g.key">{{ g.label }}</option>
            </select>
          </label>
          <button type="button" @click="all(true)">Alle an</button>
          <button type="button" @click="all(false)">Alle aus</button>
        </div>
      </div>
    </section>

    <section class="sheet">
      <div class="body flush wrapplot">
        <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" role="img"
             :aria-label="`Sterne der Stufe ${data.stage} gegen ${data.reference} desselben Alters`">
          <defs>
            <!-- The reference carries a texture rather than a ninth hue. Because a) the
                 palette names eight slots and a ninth would collide with one of them
                 b) the navy measures 1,56 to 1 against the purple slot c) a hatch is a
                 channel no hue uses. -->
            <pattern id="milkhatch" width="6" height="6" patternUnits="userSpaceOnUse"
                     patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--band)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--quiet)" stroke-width="1.4" opacity="0.5" />
            </pattern>
          </defs>
          <polygon v-for="r in RINGS" :key="r" :class="r === 1 ? 'one' : 'web'"
                   :points="axes.map((a, i) => at(i, reachOf(r)).map((v) => v.toFixed(1)).join(',')).join(' ')" />
          <line v-for="(a, i) in axes" :key="a.name" class="spoke"
                :x1="MID" :y1="MID" :x2="at(i, 1)[0].toFixed(1)" :y2="at(i, 1)[1].toFixed(1)" />
          <polygon v-if="milkOn" class="milkband" :points="milkBand" fill="url(#milkhatch)" />
          <polygon v-for="p in shown" :key="p.dan" class="plot"
                   :class="{ lift: lifted === p.dan, dim: lifted !== null && lifted !== p.dan }"
                   :points="points(p.arms)" :stroke="brandFill(p.slot)"
                   @pointerover="lifted = p.dan" @pointerout="lifted = null">
            <title>{{ p.brand }} {{ p.variant }}</title>
          </polygon>
          <text v-for="(a, i) in axes" :key="'t' + a.name" class="axis"
                :x="at(i, 1.1)[0].toFixed(1)" :y="(at(i, 1.1)[1] + 3).toFixed(1)"
                :text-anchor="Math.abs(at(i, 1.1)[0] - MID) < 8 ? 'middle' : (at(i, 1.1)[0] > MID ? 'start' : 'end')">
            {{ a.name }}
          </text>
          <text v-for="r in RINGS" :key="'r' + r" class="ring"
                :x="MID + 3" :y="(MID - SPAN * reachOf(r)).toFixed(1)">
            {{ r === 1 ? data.reference : r + '×' }}
          </text>
        </svg>
      </div>
      <div class="body">
        <p class="note">
          Die schraffierte Fläche ist die {{ data.reference }} dieses Alters vom
          niedrigsten bis zum höchsten Wert. Sie trägt eine Schraffur und keine Farbe, weil eine neunte
          Farbe neben den acht Markenfarben nicht mehr zu unterscheiden wäre. Außerhalb
          des Rings gibt die Packung mehr an und innerhalb weniger. Eine Marke ohne eigene
          Farbe steht jenseits des achten Rangs.
        </p>
      </div>
    </section>

    <section class="sheet">
      <header><h2>Marken</h2><span class="note">Anklicken schaltet eine Marke ab</span></header>
      <div class="body">
        <div class="keys">
          <button type="button" class="key" :class="{ out: !milkOn }" @click="milkOn = !milkOn">
            <i class="chip milk" /> {{ data.reference }}<span>{{ data.windows.length }}</span>
          </button>
          <button v-for="b in data.brands" :key="b.name" type="button" class="key"
                  :class="{ out: !isOn(b.name) }" @click="toggle(b.name)">
            <i class="chip" :style="{ background: brandFill(b.slot) }" />
            {{ b.name }}<span>{{ b.packs }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="sheet">
      <header><h2>Jede Packung als Vielfaches der {{ data.reference }}</h2></header>
      <div class="body flush">
        <table>
          <thead>
            <tr>
              <th>Packung</th>
              <th v-for="a in axes" :key="a.name" class="num">
                <a class="what" :href="profileHref(a.name)">{{ a.name }}</a>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in data.windows" :key="w.dan" class="milkrow">
              <th scope="row">{{ data.reference }} {{ w.variant }}</th>
              <td v-for="(r, i) in w.arms" :key="i" class="num">{{ r === null ? '—' : figure(r, 2) + '×' }}</td>
            </tr>
            <tr v-for="p in shown" :key="p.dan">
              <th scope="row"><i class="chip" :style="{ background: brandFill(p.slot) }" />
                <NuxtLink :to="`/article/${p.dan}`">{{ p.brand }} {{ p.variant }}</NuxtLink></th>
              <td v-for="(r, i) in p.arms" :key="i" class="num">{{ r === null ? '—' : figure(r, 2) + '×' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="sheet">
      <header><h2>Was die Ansicht kostet</h2></header>
      <div class="body">
        <p>Zwölf Speichen von vierzig, also ist die Form eine Auswahl und nicht die ganze
        Deklaration. Die Reihenfolge der Speichen um den Kreis ändert jede Form auf dem
        Bild. Ein Arm über dem Zweiunddreißigfachen liegt auf dem Rand.</p>
        <p v-if="data.noneOfIt.length">Die Referenz gibt {{ data.noneOfIt.join(' und ') }}
        gar nicht an, also lässt sich dafür kein Vielfaches bilden und die Speiche fehlt.</p>
        <p>Von den acht Farbplätzen bleibt einer ungenutzt. Die Referenz hält einen Platz
        über die ganze Seite hinweg, wird hier aber als Schraffur gezeichnet.
        Deshalb tragen in dieser Stufe sieben Marken eine Farbe und fünf das Grau. Der Platz
        wandert nicht, weil eine Marke sonst auf jeder Seite anders aussähe.</p>
        <p class="note">Eine Zahl vielfach der Referenz sagt nichts darüber, wie viel
        davon aufgenommen wird. Die
        <a class="what" :href="profileHref('Eisen')">Eisen</a> Seite zeigt den Unterschied.</p>
      </div>
    </section>

  </div>
</template>

<style scoped>
.wrapplot { display: flex; justify-content: center; }
svg { width: 100%; max-width: 640px; height: auto; display: block; }
.web { fill: none; stroke: var(--rule); }
.one { fill: none; stroke: var(--ink); stroke-dasharray: 4 3; opacity: 0.6; }
.spoke { stroke: var(--rule); }
.milkband { stroke: var(--ink); stroke-width: 1.4; stroke-dasharray: 5 3; opacity: 0.85; }
.plot { fill: none; stroke-width: 2; opacity: 0.85; cursor: pointer; }
.plot.lift { stroke-width: 3.4; opacity: 1; }
.plot.dim { opacity: 0.18; }
.axis { fill: var(--quiet); font-size: 11px; }
.ring { fill: var(--quiet); font-size: 10px; }
.controls { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: end; }
.keys { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.key { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.5rem;
  border: 1px solid var(--rule); background: var(--sheet); font: inherit; font-size: 0.82rem;
  cursor: pointer; }
.key:hover { background: var(--band); }
.key.out { color: var(--quiet); text-decoration: line-through; }
.key.out .chip { opacity: 0.25; }
.key span { color: var(--quiet); font-size: 0.75rem; }
.chip { width: 10px; height: 10px; display: inline-block; }
.chip.milk { background: repeating-linear-gradient(45deg, var(--band), var(--band) 2px, var(--quiet) 2px, var(--quiet) 3px); border: 1px solid var(--ink); }
.milkrow th, .milkrow td { background: var(--band); }
.what { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--quiet); }
.what:hover { color: var(--accent); }
</style>
