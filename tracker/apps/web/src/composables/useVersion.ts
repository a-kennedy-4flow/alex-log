// Finds a deployment made while the page was open.
//
// The shell is the only file a running page can read fresh. Because a) the
// deploy serves `index.html` with `no-cache`. b) every asset beside it is
// hashed and immutable. c) a build moves the hash of whatever it changed. So
// the asset names the shell carries are the version.
//
// A stale tab has no other sign to go on. The routes are imported statically so
// there is one bundle and no later request that could fail on a name the
// deployment has dropped.

import { ref } from 'vue'

import { flushSheet } from '@/composables/useTimesheet'

/** How often the shell is read. */
const EVERY_MS = 10 * 60 * 1000

const ASSET = /\/assets\/[\w.-]+/g

/** True once the served shell names an asset this page is not running. */
export const updateReady = ref(false)

/**
 * The hashed assets named in a shell. Sorted because the order they appear in
 * is not part of the version.
 */
function assetsIn(markup: string): string {
  return (markup.match(ASSET) ?? []).sort().join(' ')
}

function declared(): string {
  const elements = [...document.querySelectorAll('script[src], link[href]')]
  return assetsIn(elements.map((element) => element.outerHTML).join(' '))
}

/**
 * The shell this page was built from. Taken as the bundle loads rather than at
 * each check. Because a `modulepreload` written into the page for a chunk
 * fetched later would otherwise read as a version the deployment never served.
 */
const RUNNING = typeof document === 'undefined' ? '' : declared()

/**
 * Reads the shell and compares it. Silent about a failure because a) an offline
 * tab is not a new version. b) CloudFront answers 403 for the moment an
 * invalidation takes. c) the next read is the retry.
 */
export async function checkVersion(): Promise<void> {
  if (updateReady.value) return
  let served = ''
  try {
    const response = await fetch('/index.html', { cache: 'no-store' })
    if (!response.ok) return
    served = assetsIn(await response.text())
  } catch {
    return
  }
  // Neither side names a hashed asset in development so there is nothing to
  // compare and nothing to demand.
  if (!served || !RUNNING || served === RUNNING) return
  updateReady.value = true
  // The edit is written before the demand takes the grid away. The mirror in
  // localStorage holds it even when the PUT fails so the reload cannot cost it.
  await flushSheet()
}

// Only a built page carries a version. A mounted test has no server behind it
// either.
if (import.meta.env.PROD) {
  setInterval(() => void checkVersion(), EVERY_MS)
  // A tab put aside for a week is the one most likely to be stale.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkVersion()
  })
}
