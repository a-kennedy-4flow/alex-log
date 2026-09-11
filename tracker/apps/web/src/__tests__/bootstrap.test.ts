// The empty deployment.
//
// A stack that has just been deployed holds no catalogue so `/api/catalogue`
// answers 503. Every route sits behind that call. The upload screen is the one
// that has to render anyway because it is what ends the 503.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

// The English catalogue is read rather than quoted. A sentence copied into an
// assertion is a second copy of the wording and it fails on every rewrite of
// the copy rather than on a fault.
const { i18n } = await import('@/i18n')
const { routeTree } = await import('@/router')
const { switchTo } = await import('@/composables/useDevUser')
const { default: en } = await import('@/i18n/messages/en')

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

// The shell and five of the six routes are fetched rather than bundled. They
// are warmed here so a mount resolves them on the same turn as the render.
async function warmChunks(): Promise<void> {
  await Promise.all([
    import('@/components/AdminUpload.vue'),
    import('@/components/SummaryPanel.vue'),
    import('@/pages/SimplePage.vue'),
    import('@/pages/SetupPage.vue'),
    import('@/pages/AdminPage.vue'),
    import('@/pages/JiraPage.vue'),
    import('@/pages/PrivacyPage.vue'),
  ])
}

beforeAll(warmChunks)

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
  // The uploader and the route components are fetched rather than bundled so
  // the shell needs one more turn before they are on the page.
  await flushPromises()
  return wrapper
}

beforeEach(() => switchTo('alex'))

describe('a deployment with no catalogue', () => {
  it('gives backoffice the upload screen instead of the error', async () => {
    switchTo('backoffice')
    const wrapper = await mountApp('/')
    expect(wrapper.find('.drop').exists()).toBe(true)
    expect(wrapper.text()).toContain(en.admin.bootstrap)
    switchTo('alex')
  })

  it('tells an ordinary user to wait and offers them no upload', async () => {
    switchTo('alex')
    const wrapper = await mountApp('/')
    expect(wrapper.find('.drop').exists()).toBe(false)
    expect(wrapper.text()).toContain(en.admin.awaiting)
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
