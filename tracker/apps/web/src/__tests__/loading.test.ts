// The wait before the first screen.
//
// Every route sits behind `/api/catalogue` and the list is about a megabyte so
// the wait is long enough to look like a dead page. The catalogue below never
// answers so the shell is held on that one line.

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Plugin } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/vue-router'

class FakeApiError extends Error {
  readonly status: number
  readonly codes: string[] = []
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A promise nobody settles. It holds the query in its pending state. */
const forever = () => new Promise<never>(() => {})

vi.mock('@/lib/api', () => ({
  ApiError: FakeApiError,
  usingApi: true,
  API_URL: 'http://localhost:8787',
  api: {
    catalogue: forever,
    me: forever,
    putCatalogue: () => Promise.resolve({}),
    timesheets: () => Promise.resolve({ sheets: [] }),
  },
}))

// The English catalogue is read rather than quoted. A sentence copied into an
// assertion is a second copy of the wording and it fails on every rewrite of
// the copy rather than on a fault.
const { i18n } = await import('@/i18n')
const { routeTree } = await import('@/router')
const { switchTo } = await import('@/composables/useDevUser')
const { default: en } = await import('@/i18n/messages/en')

const vueQuery: [Plugin, VueQueryPluginOptions] = [
  VueQueryPlugin,
  { queryClientConfig: { defaultOptions: { queries: { retry: false } } } },
]

const plugins = [i18n, vueQuery]

beforeAll(async () => {
  await import('@/components/SummaryPanel.vue')
  switchTo('alex')
})

async function mountApp() {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  const Host = defineComponent({ render: () => h(RouterProvider, { router }) })
  const wrapper = mount(Host, { global: { plugins } })
  await flushPromises()
  return wrapper
}

describe('while the cost centre list is loading', () => {
  it('turns a ring beside the line that says so', async () => {
    const wrapper = await mountApp()
    const waiting = wrapper.find('.waiting')
    expect(waiting.exists()).toBe(true)
    expect(waiting.text()).toContain(en.picker.loading)
    expect(waiting.find('.busy').exists()).toBe(true)
  })

  it('says it is a status so a reader who cannot see the ring is told', async () => {
    const wrapper = await mountApp()
    expect(wrapper.find('.waiting').attributes('role')).toBe('status')
    // The ring carries no text of its own so it is hidden from the reader.
    expect(wrapper.find('.busy').attributes('aria-hidden')).toBe('true')
  })
})
