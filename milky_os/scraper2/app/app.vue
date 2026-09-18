<script setup lang="ts">
const route = useRoute()
const nav = [
  { to: '/', label: 'Übersicht' },
  { to: '/compare', label: 'Vergleich' },
  { to: '/matrix', label: 'Matrix' },
  { to: '/balance', label: 'Neigung' },
  { to: '/stars', label: 'Sterne' },
  { to: '/prices', label: 'Preise' },
  { to: '/register', label: 'Register' },
  { to: '/layouts', label: 'Layouts' },
  { to: '/about', label: 'Methode' },
]
/* The single file pages are built by the Python tools and served from the same origin so
   a link out of the app and a link back both resolve. */
const pages = [
  { href: '/pages/profiles/index.html', label: 'Nährstoffe' },
  { href: '/pages/views/periods.html', label: 'Perioden' },
  { href: '/pages/views/stars.html', label: 'Sternwand' },
  { href: '/pages/views/index.html', label: 'Optionen' },
  { href: '/pages/index.html', label: 'Liste' },
]
const on = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
const { data: head } = await useFetch('/api/overview', { key: 'shell-overview' })
</script>

<template>
  <div>
    <header class="masthead">
      <div class="wrap">
        <NuxtLink to="/" class="title">Babymilch Register</NuxtLink>
        <span class="strap">Nährwerte und Preise der dm Kategorie Babymilch</span>
        <span class="stamp">Stand {{ head?.gathered_on }}</span>
      </div>
    </header>
    <nav class="mainnav">
      <div class="wrap">
        <NuxtLink v-for="item in nav" :key="item.to" :to="item.to" :class="{ on: on(item.to) }">
          {{ item.label }}
        </NuxtLink>
        <a v-for="one in pages" :key="one.href" :href="one.href" class="out">{{ one.label }}</a>
      </div>
    </nav>
    <main>
      <div class="wrap">
        <NuxtPage />
      </div>
    </main>
    <footer class="footer">
      <div class="wrap">
        <p>
          Jede Zahl einer Packung ist die Angabe die dm veröffentlicht. Jede Zahl der
          Muttermilch und der Kuhmilch stammt aus einer Quelle die der Artikel nennt.
          Nichts wird korrigiert.
          Die Preise stammen von {{ head?.sites?.map((s: any) => s.name).join(' und ') }}.
        </p>
        <p>Server gerendert. Keine Zahl wartet auf eine zweite Anfrage.</p>
      </div>
    </footer>
  </div>
</template>
