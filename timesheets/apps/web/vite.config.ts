import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    // The i18n module reads localStorage and navigator when it loads so the
    // tests need a DOM even for the pure logic files.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
})
