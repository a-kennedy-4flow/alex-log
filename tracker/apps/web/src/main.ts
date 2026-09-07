import { createApp, h } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { RouterProvider } from '@tanstack/vue-router'

import { i18n } from './i18n'
import { router } from './router'
import { ApiError } from './lib/api'
import { authEnabled, establish, takeReturnTo } from './lib/auth'
import { consentError, finishLink } from './lib/jira'
import SignedOut from './components/SignedOut.vue'
import './styles/tokens.css'

// Identity settles before anything mounts. Because a) the first request the
// shell makes already needs a token. b) a screen built for nobody would have to
// be torn down again. c) the redirect is invisible while the portal session is
// live.
async function start(): Promise<void> {
  let reason: string | null = null
  let present = true
  /** Where the router should open. Null leaves it on the address bar. */
  let at: string | null = null

  if (authEnabled) {
    try {
      present = (await establish()) !== null
      at = takeReturnTo()
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
      present = false
    }
  }

  // A Jira consent lands on its own path which carries no route. It is finished
  // here rather than in a route because the router would draw its own not found
  // page on that path first. `lib/auth.ts` handles its own callback the same
  // way. It runs outside the branch above because the local build configures no
  // pool and a consent has to finish there as well.
  if (present) {
    try {
      const fromJira = await finishLink(at ?? location.pathname + location.search)
      if (fromJira) at = fromJira
    } catch (error) {
      // The shell still renders. The Jira screen carries the reason and offers
      // the button again.
      consentError.value = error instanceof Error ? error.message : String(error)
      at = '/jira'
    }
  }

  // One move once both callbacks have had their say. The address is the router
  // own from here on.
  if (at) router.history.replace(at)

  const app = createApp({
    render: () =>
      present ? h(RouterProvider, { router }) : h(SignedOut, { reason }),
  })

  app.use(i18n)
  app.use(VueQueryPlugin, {
    queryClientConfig: {
      defaultOptions: {
        queries: {
          // A status means the API answered. Because a) the 503 an empty
          // deployment gives holds until someone uploads a workbook. b) three
          // backoff retries leave the shell on its loading line for seconds
          // first. c) a fetch that threw carries no status so a real wobble
          // still gets its retries.
          retry: (count: number, error: unknown) => !(error instanceof ApiError) && count < 3,
        },
      },
    },
  })
  app.mount('#app')
}

void start()
