<script setup lang="ts">
// Empties every row of the open month.
//
// It asks before it acts. Because a) a filled month is 62 rows and nothing here
// puts them back. b) the button stands in a row of selects where a stray click
// lands easily. c) one more click is a small price for the only control on this
// page that destroys work.
//
// The question replaces the button rather than opening a dialog. A dialog would
// be a third overlay pattern on a page that already carries the wizard and the
// tour and the question is one line long.

import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { clearMonth, monthIsEmpty } from '@/composables/useTimesheet'

const { t } = useI18n()

const asking = ref(false)
const confirm = ref<HTMLButtonElement | null>(null)

/** Focus moves to the answer so the keyboard reaches it without a tab. */
async function ask(): Promise<void> {
  asking.value = true
  await nextTick()
  confirm.value?.focus()
}

function clear(): void {
  clearMonth()
  asking.value = false
}
</script>

<template>
  <div class="clear" @keydown.esc="asking = false">
    <button
      v-if="!asking"
      type="button"
      class="btn"
      :disabled="monthIsEmpty"
      :title="monthIsEmpty ? t('header.clearMonthEmpty') : undefined"
      @click="ask"
    >
      {{ t('header.clearMonth') }}
    </button>

    <template v-else>
      <!-- The question is read out because the button it replaced is gone. -->
      <span class="ask" role="alert">{{ t('header.clearMonthAsk') }}</span>
      <button ref="confirm" type="button" class="btn btn-primary" @click="clear">
        {{ t('header.clearMonthYes') }}
      </button>
      <button type="button" class="btn" @click="asking = false">
        {{ t('common.cancel') }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.clear {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* The question holds one line so the bar does not grow a row while it is up. */
.ask {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

/* Both answers are smaller than a button in a band. The bar is a dense row. */
.clear .btn {
  padding: 6px 13px;
  font-size: 13px;
}
</style>
