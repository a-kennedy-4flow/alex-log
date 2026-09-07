<script setup lang="ts">
// The Jira connection as a setting.
//
// It is a setting because it is turned on and off here. The Jira page offers
// the same button because that is where a user who has never connected arrives
// first. The state it reads is the one that page reads so the two agree.

import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { link, linkError, loadLink, unlink } from '@/composables/useJira'
import { consentError, startLink } from '@/lib/jira'
import SettingRow from '@/components/SettingRow.vue'

const { t } = useI18n()

onMounted(() => void loadLink())

/** One line under the button. It says what the state is or why there is none. */
const hint = computed(() => {
  if (link.value === null) return linkError.value ?? t('jira.loading')
  if (link.value.linked) {
    return t('setup.jiraLinked', { at: (link.value.linkedAt ?? '').slice(0, 10) })
  }
  if (link.value.clientId === '') return t('jira.notConfigured')
  if (consentError.value) return t('jira.consentFailed', { reason: consentError.value })
  return t('setup.jiraHint')
})
</script>

<template>
  <!-- A div rather than a label. `SettingRow` says why a button asks for one. -->
  <SettingRow :label="t('setup.jira')" :hint="hint" as="div">
    <button v-if="link?.linked" type="button" class="btn" @click="unlink()">
      {{ t('jira.unlink') }}
    </button>
    <button
      v-else
      type="button"
      class="btn"
      :disabled="link === null || link.clientId === ''"
      @click="link && startLink(link.clientId, link.redirectUri, '/settings')"
    >
      {{ t('jira.link') }}
    </button>
  </SettingRow>
</template>
