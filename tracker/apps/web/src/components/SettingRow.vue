<script setup lang="ts">
// One setting. The label above the control with the hint under it.
//
// Every setting on the form is one of these and the control box is sized here
// rather than by whatever is slotted into it. Because a) a select and a text
// input and a number input each ask for a different height when the browser is
// left to decide. b) a field carrying a unit was narrower than the field beside
// it by the width of that unit. c) one box means one number to change.

withDefaults(
  defineProps<{
    label: string
    /** The line under the control. Empty leaves it out. */
    hint?: string
    /**
     * The element the row is drawn as. A label hands a click on the word to the
     * control it names. The Jira row carries a button instead and a label
     * around a button fires it when the word is clicked so that row is a div.
     */
    as?: 'label' | 'div'
  }>(),
  { hint: '', as: 'label' },
)
</script>

<template>
  <component :is="as" class="field">
    <span class="lab">{{ label }}</span>
    <span class="control"><slot /></span>
    <small v-if="hint" class="muted hint">{{ hint }}</small>
  </component>
</template>

<style scoped>
.field {
  /* The one height every control on the form takes. */
  --field-height: 38px;

  display: grid;
  gap: 3px;
}

.lab {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--grey);
}

.control {
  display: flex;
  align-items: center;
  height: var(--field-height);
}

/*
 * The slotted control fills the box. A checkbox is the toggle and it carries
 * its own size so it is left out and centres in the box instead.
 */
.control :deep(input:not([type='checkbox'])),
.control :deep(select),
.control :deep(.btn) {
  height: 100%;
}

.hint {
  font-size: 11px;
  font-weight: 400;
}
</style>
