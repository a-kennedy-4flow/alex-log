// The update check. A stale tab is found by comparing the shell it was built
// from against the one the deployment now serves.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted because `vi.mock` is lifted above the file body.
const flushSheet = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useTimesheet', () => ({ flushSheet }))

const JS = '/assets/index-Nk_1aw_N.js'
const CSS = '/assets/index-DSN6aaBZ.css'

/** What a built shell leaves behind in the page. The icon is never hashed. */
function declare(js: string, css: string): void {
  document.head.innerHTML =
    '<link rel="icon" href="/logo.svg" type="image/svg+xml">' +
    `<script type="module" crossorigin src="${js}"></script>` +
    `<link rel="stylesheet" crossorigin href="${css}">`
}

function shell(js: string, css: string): string {
  return (
    '<!doctype html><html lang="en"><head>' +
    `<script type="module" crossorigin src="${js}"></script>` +
    `<link rel="stylesheet" crossorigin href="${css}">` +
    '</head><body><div id="app"></div></body></html>'
  )
}

/** What the edge answers for the shell. */
function serve(markup: string, ok = true): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, text: async () => markup })))
}

/** The module holds the answer once it has one so each test imports it afresh. */
async function load() {
  vi.resetModules()
  return import('@/composables/useVersion')
}

beforeEach(() => {
  declare(JS, CSS)
  flushSheet.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
})

describe('the update check', () => {
  it('accepts a shell naming the assets this page runs', async () => {
    serve(shell(JS, CSS))
    const { checkVersion, updateReady } = await load()
    await checkVersion()
    expect(updateReady.value).toBe(false)
  })

  it('demands a reload once the bundle has moved', async () => {
    serve(shell('/assets/index-Nnewhash.js', CSS))
    const { checkVersion, updateReady } = await load()
    await checkVersion()
    expect(updateReady.value).toBe(true)
  })

  // A change to a style alone leaves the bundle where it was.
  it('demands a reload once the stylesheet has moved', async () => {
    serve(shell(JS, '/assets/index-Dnewhash.css'))
    const { checkVersion, updateReady } = await load()
    await checkVersion()
    expect(updateReady.value).toBe(true)
  })

  it('writes the open month before it takes the screen', async () => {
    serve(shell('/assets/index-Nnewhash.js', CSS))
    const { checkVersion } = await load()
    await checkVersion()
    expect(flushSheet).toHaveBeenCalled()
  })

  // A chunk fetched later writes its own preload into the page. Reading the
  // page at each check would take that for a deployment.
  it('ignores a preload written into the page after it loaded', async () => {
    serve(shell(JS, CSS))
    const { checkVersion, updateReady } = await load()
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="modulepreload" href="/assets/chunk-Dlazily.js">',
    )
    await checkVersion()
    expect(updateReady.value).toBe(false)
  })

  it('ignores the development shell', async () => {
    serve('<html lang="en"><head><script type="module" src="/src/main.ts"></script></head></html>')
    const { checkVersion, updateReady } = await load()
    await checkVersion()
    expect(updateReady.value).toBe(false)
  })

  it('ignores an answer the edge refused', async () => {
    serve(shell('/assets/index-Nnewhash.js', CSS), false)
    const { checkVersion, updateReady } = await load()
    await checkVersion()
    expect(updateReady.value).toBe(false)
  })

  it('ignores a request that never landed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const { checkVersion, updateReady } = await load()
    await checkVersion()
    expect(updateReady.value).toBe(false)
  })
})
