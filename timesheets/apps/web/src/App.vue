<script setup lang="ts">
// The shell. The cost centre list loads once before anything renders because
// the specification dropdown and the validation both resolve against it.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuery } from '@tanstack/vue-query'
import { Link, Outlet } from '@tanstack/vue-router'

import { setCatalogue } from '@timesheets/core'
import { loadCatalogue } from '@timesheets/fixtures'
import { api, usingApi } from '@/lib/api'
import { loadHistory, loadProfileFromApi, profileComplete } from '@/composables/useTimesheet'
import DevUserSwitch from '@/components/DevUserSwitch.vue'
import TourOverlay from '@/components/TourOverlay.vue'
import { start as startTour } from '@/composables/useTour'
import { canSignOut, identity, isBackoffice, signOut } from '@/composables/useIdentity'

const { t } = useI18n()

/** Applied by the router to the link matching the current route. */
const ACTIVE = { class: 'active' }

// Nothing renders before the catalogue lands because the specification dropdown
// and the validation both resolve against it. With no API configured the
// fixtures stand in so the UI can be worked on alone.
const projects = useQuery({
  queryKey: ['catalogue', usingApi],
  queryFn: async () => {
    setCatalogue(usingApi ? await api.catalogue() : await loadCatalogue())
    await loadProfileFromApi()
    await loadHistory()
    return true
  },
  staleTime: Infinity,
})

const ready = computed(() => projects.isSuccess.value)
</script>

<template>
  <div class="shell">
    <header>
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <div>
          <h1>{{ t('app.title') }}</h1>
          <p class="muted">{{ t('app.subtitle') }}</p>
        </div>
      </div>
      <div v-if="canSignOut" class="who">
        <span>{{ identity.firstName }} {{ identity.lastName }}</span>
        <button type="button" @click="signOut">{{ t('auth.signOut') }}</button>
      </div>
      <DevUserSwitch v-else />
      <nav>
        <Link to="/" :active-props="ACTIVE" :active-options="{ exact: true }">
          {{ t('nav.month') }}
        </Link>
        <Link to="/quick" :active-props="ACTIVE">{{ t('nav.simple') }}</Link>
        <Link to="/settings" :active-props="ACTIVE" :class="{ nudge: !profileComplete }">
          {{ t('nav.setup') }}
        </Link>
        <Link v-if="isBackoffice()" to="/admin" :active-props="ACTIVE" class="admin">
          {{ t('nav.admin') }}
        </Link>
        <button type="button" class="help" :title="t('tour.start')" @click="startTour">
          {{ t('tour.help') }}
        </button>
      </nav>
    </header>

    <main>
      <p v-if="projects.isPending.value" class="card muted">{{ t('picker.loading') }}</p>
      <p v-else-if="projects.isError.value" class="card error">
        {{ projects.error.value?.message }}
      </p>
      <Outlet v-else-if="ready" />
    </main>

    <TourOverlay />
  </div>
</template>

<style scoped>
.shell {
  max-width: 1500px;
  margin: 0 auto;
  padding: 16px;
}

header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap);
  margin-bottom: var(--gap);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
}

.mark {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%);
  box-shadow: inset 0 0 0 3px var(--white), 0 0 0 1px var(--orange-line);
}

.brand p {
  margin: 0;
  font-size: 12px;
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--navy-mid);
}

.who button {
  border: 1px solid var(--navy-line);
  background: var(--white);
  color: var(--navy-mid);
  border-radius: var(--radius);
  padding: 5px 10px;
  font-weight: 500;
}

.who button:hover {
  background: var(--navy-tint);
}

nav {
  display: flex;
  gap: 4px;
  background: var(--white);
  border: 1px solid var(--navy-line);
  border-radius: var(--radius-lg);
  padding: 4px;
  box-shadow: var(--shadow);
}

nav :deep(a) {
  color: var(--navy-mid);
  text-decoration: none;
  border-radius: var(--radius);
  padding: 6px 12px;
  font-weight: 500;
}

nav :deep(a:hover) {
  background: var(--navy-tint);
}

nav :deep(a.active) {
  background: var(--navy);
  color: var(--white);
}

nav :deep(a.nudge) {
  color: var(--orange-dark);
}

/* Only the backoffice group sees this one. */
nav :deep(a.admin) {
  color: var(--orange-dark);
}

nav :deep(a.admin.active) {
  background: var(--orange);
  color: var(--white);
}

.help {
  border: 0;
  background: none;
  color: var(--navy-mid);
  border-radius: var(--radius);
  padding: 6px 10px;
  font-weight: 600;
}

.help:hover {
  background: var(--navy-tint);
}

.error {
  color: var(--error);
}
</style>
