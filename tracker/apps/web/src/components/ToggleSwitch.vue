<script setup lang="ts">
// A toggle. On or off with no third state.
//
// It is a checkbox rather than a `role="switch"` button. Because a) the profile
// is written by the Save button so this is a form control and not an immediate
// action. b) `appearance: none` on the input keeps the label click and the
// space key and the focus ring without a wrapper. c) `role="switch"` on top of
// the checkbox is what tells a screen reader it reads on or off rather than
// ticked or unticked.

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <input v-model="model" class="toggle" type="checkbox" role="switch" />
</template>

<style scoped>
/*
 * The track. Smart Blue when on rather than Vibrant Orange because that colour
 * is reserved for the primary action and for the one figure that is off target.
 */
.toggle {
  appearance: none;
  flex: none;
  margin: 2px 0 0;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--warm-grey);
  border: 1px solid transparent;
  position: relative;
  cursor: pointer;
  transition: background 120ms ease;
}

.toggle:checked {
  background: var(--smart-blue);
}

/* The knob. White on both grounds so it reads either way round. */
.toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--white);
  transition: transform 120ms ease;
}

.toggle:checked::after {
  transform: translateX(18px);
}

/* The knob on the off track needs its own edge. White on Warm Grey is faint. */
.toggle:not(:checked)::after {
  box-shadow: inset 0 0 0 1px var(--dash);
}

.toggle:hover:not(:checked) {
  border-color: var(--dash);
}
</style>
