<script setup lang="ts">
// Reads the Jira month of another Atlassian account. The local server alone.
//
// The same switch `JIRA_AS_USER` sets for the whole server. It is here so the
// account can be changed without a restart. The deployed build never renders it
// because `import.meta.env.DEV` is false there and the deployed API ignores the
// header it sends either way.
//
// The account that developed the feature holds no worklog and no cost centre.
// So the hours path and the cost centre path cannot be seen without borrowing
// an account that has them. `docs/jira.md` holds the ids worth borrowing.
//
// It is not impersonation. The search carries the token of whoever consented on
// this machine so it returns what that person may already browse.

import { computed, ref } from 'vue'

import { ATLASSIAN_ACCOUNT_ID, DEV_JIRA_CLIENT_ID } from '@tracker/core'

import { jiraAsUser } from '@/composables/useDevUser'
import { link, loadLink, loadMonth } from '@/composables/useJira'
import { authEnabled } from '@/lib/auth'

const show = import.meta.env.DEV && !authEnabled

/**
 * True where the double is answering.
 *
 * It serves one fixed month of one fixed account so no account named here
 * changes what comes back. The server refuses the header rather than obeying it
 * and this says so before that happens.
 */
const double = computed(() => link.value?.clientId === DEV_JIRA_CLIENT_ID)

const open = ref(false)
const typed = ref(jiraAsUser.value)

/** Set on an id no Atlassian account could have. Cleared on the next attempt. */
const bad = ref(false)

function start(): void {
  typed.value = jiraAsUser.value
  bad.value = false
  open.value = true
}

/**
 * Reads the month again as whoever was named.
 *
 * The id is checked here as well as on the server. Because a) the server
 * answers 400 and the screen would show that as a failed read. b) the rule is
 * one exported constant so the two cannot disagree. c) a paste that took the
 * surrounding quotes with it is the likely mistake.
 */
async function apply(): Promise<void> {
  const account = typed.value.trim()
  if (account !== '' && !ATLASSIAN_ACCOUNT_ID.test(account)) {
    bad.value = true
    return
  }
  bad.value = false
  open.value = false
  jiraAsUser.value = account
  await read()
}

async function clear(): Promise<void> {
  typed.value = ''
  bad.value = false
  open.value = false
  jiraAsUser.value = ''
  await read()
}

/**
 * Reads the screen again. The link first and the month after it.
 *
 * Both rather than the month alone. Because the server refuses a header naming
 * no account Atlassian could own on every Jira route so the link state is as
 * stale as the month is. `onMounted` on the page does the same two calls.
 */
async function read(): Promise<void> {
  await loadLink()
  if (link.value?.linked) await loadMonth()
}
</script>

<template>
  <div v-if="show" class="dev">
    <span>jira as</span>

    <!-- Shut. The button says whose month is on the screen. -->
    <button v-if="!open" type="button" class="named" @click="start">
      {{ jiraAsUser === '' ? 'the account this server started for' : jiraAsUser }}
    </button>

    <template v-else>
      <input
        v-model="typed"
        type="text"
        placeholder="712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c"
        spellcheck="false"
        @keydown.enter="apply"
        @keydown.esc="open = false"
      />
      <button type="button" class="btn" @click="apply">read</button>
      <button v-if="jiraAsUser !== ''" type="button" class="btn" @click="clear">clear</button>
    </template>

    <span v-if="bad" class="wrong">that is not an Atlassian account id</span>
    <span v-else-if="double" class="wrong">the double answers so this changes nothing</span>
  </div>
</template>

<style scoped>
/* Marked apart from the app so it is not mistaken for a real control. */
.dev {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Aligned with the 26px a `.pad` band carries. The sheet itself carries none. */
  margin: 14px 26px 0;
  padding: 3px 8px 3px 10px;
  border: 1px dashed var(--orange);
  border-radius: var(--radius);
  background: var(--open);
  width: max-content;
  max-width: 100%;
}

.dev > span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--smart-blue);
  white-space: nowrap;
}

/* The account on the screen. It reads as text and behaves as a button. */
.named {
  border: 0;
  background: none;
  padding: 0;
  color: var(--smart-blue);
  font-family: inherit;
  font-size: 12px;
  text-decoration: underline;
  text-decoration-color: var(--orange);
  text-underline-offset: 2px;
}

input {
  width: 44ch;
  max-width: 50vw;
  border: 1px solid var(--orange);
  border-radius: var(--radius);
  background: var(--white);
  padding: 4px 7px;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
}

.btn {
  padding: 3px 10px;
  font-size: 12px;
}

.wrong {
  color: var(--orange);
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  font-size: 11px;
}
</style>
