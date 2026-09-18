export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  // Every route is rendered on the server. Because a) the figures are published numbers
  // that never change between two readers b) a crawler and a reader then see one document
  // c) the first paint carries the whole table so no chart waits on a request.
  ssr: true,
  nitro: { preset: 'node-server' },
  devtools: { enabled: false },
  css: ['~/assets/theme.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
})
