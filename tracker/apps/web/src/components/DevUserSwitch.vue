<script setup lang="ts">
// Stands in for sign in where no user pool is configured.
//
// The deployed build reads the Cognito token so this never renders there.

import { DEV_USERS, devUser, switchTo } from '@/composables/useDevUser'
import { authEnabled } from '@/lib/auth'
import { usingApi } from '@/lib/api'
import { loadProfileFromApi, openMonth, month, year } from '@/composables/useTimesheet'

const show = import.meta.env.DEV && !authEnabled

async function onChange(event: Event): Promise<void> {
  switchTo((event.target as HTMLSelectElement).value)
  if (!usingApi) return
  // The new caller owns different data so both are read again.
  await loadProfileFromApi()
  openMonth(year.value, month.value)
}
</script>

<template>
  <label v-if="show" class="dev">
    <span>signed in as</span>
    <select :value="devUser.sub" @change="onChange">
      <option v-for="user in DEV_USERS" :key="user.sub" :value="user.sub">
        {{ user.firstName }} {{ user.lastName }}
        <template v-if="user.groups.length"> — {{ user.groups.join(' ') }}</template>
      </option>
    </select>
  </label>
</template>

<style scoped>
/* Marked apart from the app so it is not mistaken for a real control. */
.dev {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 10px;
  border: 1px dashed var(--orange);
  border-radius: var(--radius);
  background: var(--open);
}

.dev > span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--smart-blue);
  white-space: nowrap;
}

select {
  width: auto;
  border-color: var(--orange);
  background: var(--white);
}
</style>
