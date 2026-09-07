<script setup lang="ts">
// The shell. The cost centre list loads once before anything renders because
// the specification dropdown and the validation both resolve against it.

import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuery } from '@tanstack/vue-query'
import { Link, Outlet } from '@tanstack/vue-router'

import { setCatalogue } from '@tracker/core'
import { loadCatalogue } from '@tracker/fixtures'
import { ApiError, api, usingApi } from '@/lib/api'
import { loadHistory, loadProfileFromApi, profileComplete } from '@/composables/useTimesheet'
import AdminUpload from '@/components/AdminUpload.vue'
import DevUserSwitch from '@/components/DevUserSwitch.vue'
import SetupWizard from '@/components/SetupWizard.vue'
import TourOverlay from '@/components/TourOverlay.vue'
import { start as startTour, startUnlessSeen } from '@/composables/useTour'
import { armWizard, wizardOpen } from '@/composables/useWizard'
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

// The wizard is told when to decide rather than working it out for itself. The
// profile has landed by the time the catalogue query settles. Because a) the
// questions write their answers to the same profile the decision reads. b) a
// self derived reading completes itself on the location step. c) the dialog
// would then vanish before the last two questions.
watch(ready, (settled) => {
  if (settled) armWizard()
})

// An empty deployment answers 503 until backoffice uploads a workbook. The
// upload screen is the one thing that has to render without a catalogue.
// Because a) it is what fixes the 503. b) it lives behind the same gate as
// every other route so the gate locks the only person who can open it out. c)
// it already treats a missing catalogue as an ordinary state.
const catalogueMissing = computed(
  () => projects.error.value instanceof ApiError && projects.error.value.status === 503,
)

// The page mounted behind the wizard so its own tour was refused. Offer it once
// the wizard is out of the way rather than making the user find the button.
watch(wizardOpen, (open) => {
  if (!open) startUnlessSeen()
})
</script>

<template>
  <div class="shell">
    <header>
      <div class="bar">
        <span class="brand">
          <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="20" y="5" width="8" height="8" rx="4" fill="var(--smart-blue)" />
            <circle cx="24" cy="26" r="16" fill="var(--smart-blue)" />
            <path
              d="M24 26 35 20"
              fill="none"
              stroke="var(--orange)"
              stroke-width="5"
              stroke-linecap="round"
            />
            <circle cx="40" cy="42" r="16" fill="var(--orange)" />
          </svg>
          <span class="wordmark">{{ t('app.title') }}</span>
        </span>

        <nav>
          <Link to="/" :active-props="ACTIVE" :active-options="{ exact: true }">
            {{ t('nav.month') }}
          </Link>
          <Link to="/quick" :active-props="ACTIVE">{{ t('nav.simple') }}</Link>
          <Link to="/jira" :active-props="ACTIVE">{{ t('nav.jira') }}</Link>
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

        <div v-if="canSignOut" class="who">
          <span>{{ identity.firstName }} {{ identity.lastName }}</span>
          <button type="button" @click="signOut">{{ t('auth.signOut') }}</button>
        </div>
        <DevUserSwitch v-else />
      </div>
    </header>

    <main>
      <p v-if="projects.isPending.value" class="sheet pad muted">{{ t('picker.loading') }}</p>
      <Outlet v-else-if="ready" />
      <template v-else-if="catalogueMissing">
        <div v-if="isBackoffice()" class="bootstrap">
          <p class="sheet pad muted">{{ t('admin.bootstrap') }}</p>
          <AdminUpload />
        </div>
        <p v-else class="sheet pad muted">{{ t('admin.awaiting') }}</p>
      </template>
      <p v-else-if="projects.isError.value" class="sheet pad">
        {{ projects.error.value?.message }}
      </p>
    </main>

    <TourOverlay />
    <SetupWizard v-if="ready && wizardOpen" />
  </div>
</template>

<style scoped>
.shell {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 28px 60px;
}

/* The header is a white bar sitting on the Warm Grey canvas. */
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  background: var(--white);
  border-radius: var(--radius);
  padding: 12px 20px;
  margin-bottom: 26px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
}

.mark {
  width: 26px;
  height: 26px;
  flex: none;
}

.wordmark {
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.01em;
}

.who {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  font-size: 13px;
  color: var(--grey);
}

.who button {
  border: 1px solid var(--warm-grey);
  background: var(--white);
  color: var(--smart-blue);
  border-radius: var(--radius);
  padding: 6px 14px;
}

.who button:hover {
  background: var(--warm-grey);
}

nav {
  display: flex;
  gap: 2px;
}

nav :deep(a) {
  color: var(--smart-blue);
  text-decoration: none;
  border-radius: var(--radius);
  padding: 7px 14px;
}

nav :deep(a:hover) {
  background: var(--warm-grey);
}

nav :deep(a.active) {
  background: var(--smart-blue);
  color: var(--white);
}

/*
 * A nudge and the backoffice link both need to stand out from their
 * neighbours. Vibrant Orange cannot carry text at this size so the mark is a
 * rule under the word.
 */
nav :deep(a.nudge),
nav :deep(a.admin) {
  box-shadow: inset 0 -3px 0 var(--orange);
}

nav :deep(a.admin.active) {
  background: var(--smart-blue);
  color: var(--white);
}

.help {
  border: 0;
  background: none;
  color: var(--grey);
  border-radius: var(--radius);
  padding: 7px 12px;
  font-weight: 700;
}

.help:hover {
  background: var(--warm-grey);
  color: var(--smart-blue);
}
</style>
