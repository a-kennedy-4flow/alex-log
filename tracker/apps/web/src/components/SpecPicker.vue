<script setup lang="ts">
// The specification list depends on the workday id. The tracker resolves the
// range as `spec_<businessLine>_<object>` so this offers exactly that range.
// A range missing from the workbook falls back to the full list and says so.
//
// A cost centre that names its own list must be given one of them so no blank
// is offered and the first is filled in. A cost centre whose list the workbook
// leaves empty starts blank and may take anything from the full list.
//
// Three states are marked apart from the plain one. A default the user has not
// confirmed reads as provisional. A specification the cost centre disallows is
// an error. A value chosen off the full list is a warning.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { specificationsFor } from '@tracker/core'

const props = defineProps<{
  modelValue: string | null
  workdayId: string | null
  invalid?: boolean
  /** True when the value was filled in rather than chosen. */
  isDefault?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const { t } = useI18n()

const spec = computed(() => specificationsFor(props.workdayId))
const disabled = computed(() => props.workdayId === null)

/** A blank stands only where the cost centre names no list of its own. */
const blankAllowed = computed(() => disabled.value || !spec.value.hasOwnList)

// An error outranks the two softer marks so only one shows at a time.
const provisional = computed(
  () => !props.invalid && !disabled.value && props.isDefault === true && spec.value.hasOwnList,
)
const unverified = computed(
  () =>
    !props.invalid &&
    !disabled.value &&
    !spec.value.hasOwnList &&
    props.modelValue !== null,
)

const hint = computed(() => {
  if (provisional.value) return t('grid.defaultSpecification')
  if (unverified.value) return `${t('grid.unverifiedSpecification')} (${spec.value.range})`
  return undefined
})

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value === '' ? null : value)
}
</script>

<template>
  <div class="wrap">
    <select
      :value="props.modelValue ?? ''"
      :disabled="disabled"
      :class="{ invalid: props.invalid, provisional, unverified }"
      :title="hint"
      @change="onChange"
    >
      <!--
        A blank is offered for a row with no cost centre and for one whose cost
        centre names no list. Where a list exists the field always holds one of
        its values so there is nothing to prompt for.
      -->
      <option v-if="blankAllowed" value=""></option>
      <option v-for="option in spec.options" :key="option" :value="option">{{ option }}</option>
    </select>
    <span v-if="provisional" class="mark" :title="hint" aria-hidden="true">default</span>
    <span v-if="provisional" class="visually-hidden">{{ hint }}</span>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
}

select {
  min-height: 30px;
}

select:disabled {
  background: var(--tint);
  border: 1px dashed var(--dash);
}

select.invalid {
  border-color: var(--orange);
  background: var(--open);
}

/*
 * A default is not a fault so it stays out of the orange and the amber those
 * two states own. Dashed and muted reads as provisional.
 */
select.provisional {
  border-style: dashed;
  border-color: var(--grey);
  background: var(--warm-grey);
  color: var(--smart-blue);
  font-style: italic;
}

select.unverified {
  border-color: var(--orange);
  background: var(--open);
}

.mark {
  position: absolute;
  top: -6px;
  right: 6px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--grey);
  color: var(--white);
  font-size: 9px;
  font-style: normal;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  pointer-events: none;
}
</style>
