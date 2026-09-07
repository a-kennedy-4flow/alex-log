// The empty deployment.
//
// A stack that has just been deployed holds no catalogue so `/api/catalogue`
// answers 503. Every route sits behind that call. The upload screen is the one
// that has to render anyway because it is what ends the 503.

import { beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('@/lib/api', () => ({
  ApiError: FakeApiError,
  usingApi: true,
  API_URL: 'http://localhost:8787',
  api: {
    catalogue: () => Promise.reject(new FakeApiError(503, 'no catalogue has been uploaded yet')),
    me: () => Promise.reject(new FakeApiError(503, 'no catalogue has been uploaded yet')),
    putCatalogue: () => Promise.resolve({}),
    timesheets: () => Promise.resolve({ sheets: [] }),
  },
}))

const { i18n } = await import('@/i18n')
const { routeTree } = await import('@/router')
const { switchTo } = await import('@/composables/useDevUser')

// Matches main.ts. A status means the API answered so nothing is retried.
const vueQuery: [Plugin, VueQueryPluginOptions] = [
  VueQueryPlugin,
  {
    queryClientConfig: {
      defaultOptions: {
        queries: {
          retry: (count: number, error: unknown) => !(error instanceof FakeApiError) && count < 3,
        },
      },
    },
  },
]

const plugins = [i18n, vueQuery]

async function mountApp(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const Host = defineComponent({ render: () => h(RouterProvider, { router }) })
  const wrapper = mount(Host, { global: { plugins } })
  await router.load()
  await flushPromises()
  await flushPromises()
  return wrapper
}

beforeEach(() => switchTo('alex'))

describe('a deployment with no catalogue', () => {
  it('gives backoffice the upload screen instead of the error', async () => {
    switchTo('backoffice')
    const wrapper = await mountApp('/')
    expect(wrapper.find('.drop').exists()).toBe(true)
    expect(wrapper.text()).toContain('No lists have been uploaded yet')
    switchTo('alex')
  })

  it('tells an ordinary user to wait and offers them no upload', async () => {
    switchTo('alex')
    const wrapper = await mountApp('/')
    expect(wrapper.find('.drop').exists()).toBe(false)
    expect(wrapper.text()).toContain('No cost centre lists have been uploaded yet')
  })

  it('never shows the raw 503 to either of them', async () => {
    for (const who of ['backoffice', 'alex'] as const) {
      switchTo(who)
      const wrapper = await mountApp('/')
      expect(wrapper.text(), who).not.toContain('no catalogue has been uploaded yet')
    }
    switchTo('alex')
  })
})
