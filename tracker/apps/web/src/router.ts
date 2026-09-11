// Routes are declared in code rather than generated from files. Seven screens
// do not warrant a generator.
//
// `/jira/callback` is absent on purpose. `lib/jira.ts` handles it before the
// router mounts which is how `lib/auth.ts` already handles `/auth/callback`.

import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/vue-router'

import RootLayout from './App.vue'
import MonthPage from './pages/MonthPage.vue'

// The month grid is what the entry opens on so it stays in the entry. The rest
// arrive when their link is followed.
const SimplePage = lazyRouteComponent(() => import('./pages/SimplePage.vue'))
const SetupPage = lazyRouteComponent(() => import('./pages/SetupPage.vue'))
const AdminPage = lazyRouteComponent(() => import('./pages/AdminPage.vue'))
const JiraPage = lazyRouteComponent(() => import('./pages/JiraPage.vue'))
const PrivacyPage = lazyRouteComponent(() => import('./pages/PrivacyPage.vue'))
const CreditsPage = lazyRouteComponent(() => import('./pages/CreditsPage.vue'))

const rootRoute = createRootRoute({ component: RootLayout })

const monthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: MonthPage,
})

const simpleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quick',
  component: SimplePage,
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SetupPage,
})

const jiraRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jira',
  component: JiraPage,
})

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: PrivacyPage,
})

const creditsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/credits',
  component: CreditsPage,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
})

// An address matching no route goes to the month grid. Seven screens do not
// warrant a page for a typo.
const missingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})

export const routeTree = rootRoute.addChildren([
  monthRoute,
  simpleRoute,
  jiraRoute,
  setupRoute,
  adminRoute,
  privacyRoute,
  creditsRoute,
  missingRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/vue-router' {
  interface Register {
    router: typeof router
  }
}
