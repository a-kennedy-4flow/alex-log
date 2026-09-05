import { createApp, h } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { RouterProvider } from '@tanstack/vue-router'

import { i18n } from './i18n'
import { router } from './router'
import { authEnabled, establish, takeReturnTo } from './lib/auth'
import SignedOut from './components/SignedOut.vue'
import './styles/tokens.css'

// Identity settles before anything mounts. Because a) the first request the
// shell makes already needs a token. b) a screen built for nobody would have to
// be torn down again. c) the redirect is invisible while the portal session is
// live.
async function start(): Promise<void> {
  let reason: string | null = null
  let present = true

  if (authEnabled) {
    try {
      present = (await establish()) !== null
      // The callback path carries no route. The router is moved off it before
      // it reads the address bar.
      const back = takeReturnTo()
      if (back) router.history.replace(back)
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
      present = false
    }
  }

  const app = createApp({
    render: () =>
      present ? h(RouterProvider, { router }) : h(SignedOut, { reason }),
  })

  app.use(i18n)
  app.use(VueQueryPlugin)
  app.mount('#app')
}

void start()
