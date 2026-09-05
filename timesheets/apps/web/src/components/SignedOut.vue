<script setup lang="ts">
// The only screen shown to nobody.
//
// Reached two ways. The user signed out. Or the callback did not settle. Both
// leave one way forward so the page carries one control.

import { useI18n } from 'vue-i18n'

import { signIn } from '@/lib/auth'

defineProps<{ reason?: string | null }>()

const { t } = useI18n()
</script>

<template>
  <div class="gate">
    <div class="card">
      <h1>{{ reason ? t('auth.failedTitle') : t('auth.signedOutTitle') }}</h1>
      <p v-if="reason" class="error">{{ reason }}</p>
      <p v-else class="muted">{{ t('auth.signedOutBody') }}</p>
      <button type="button" class="primary" @click="signIn">{{ t('auth.signIn') }}</button>
    </div>
  </div>
</template>

<style scoped>
.gate {
  display: flex;
  justify-content: center;
  padding: 80px 16px;
}

.card {
  max-width: 420px;
  text-align: center;
}

h1 {
  font-size: 20px;
  margin: 0 0 8px;
}

.error {
  color: var(--error);
}

button {
  margin-top: 12px;
}
</style>
