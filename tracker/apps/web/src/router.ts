// Routes are declared in code rather than generated from files. Five screens
// do not warrant a generator.
//
// `/jira/callback` is absent on purpose. `lib/jira.ts` handles it before the
// router mounts which is how `lib/auth.ts` already handles `/auth/callback`.

import { createRootRoute, createRoute, createRouter } from '@tanstack/vue-router'

import RootLayout from './App.vue'
import MonthPage from './pages/MonthPage.vue'
import SimplePage from './pages/SimplePage.vue'
import SetupPage from './pages/SetupPage.vue'
import AdminPage from './pages/AdminPage.vue'
import JiraPage from './pages/JiraPage.vue'

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

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
})

export const routeTree = rootRoute.addChildren([
  monthRoute,
  simpleRoute,
  jiraRoute,
  setupRoute,
  adminRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/vue-router' {
  interface Register {
    router: typeof router
  }
}
