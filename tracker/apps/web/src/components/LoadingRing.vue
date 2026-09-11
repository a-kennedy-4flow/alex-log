<script setup lang="ts">
// The turning ring that says a read of the network is still running.
//
// It is not called a spinner because that word already means the arrows a
// browser draws on a number field. `tokens.css` takes those off.
//
// The turning is what carries the meaning. A line of text alone reads the same
// whether the request is in flight or dead so the motion is what says data is
// still moving.
//
// It is one component rather than a rule each page repeats. Because a) the
// `role` and the `aria-hidden` are the part a copy forgets. b) a reduced motion
// rule that lived in two files would drift. c) every wait in the tracker then
// looks like the same wait.

withDefaults(
  defineProps<{
    /** Renders the ring on its own. Set on a button that carries its own text. */
    bare?: boolean
  }>(),
  { bare: false },
)
</script>

<template>
  <span v-if="bare" class="busy" aria-hidden="true"></span>
  <p v-else class="muted waiting" role="status">
    <span class="busy" aria-hidden="true"></span>
    <slot />
  </p>
</template>

<style scoped>
.waiting {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Orange on warm grey holds on white. A ground the arc would vanish against
   sets `--ring-arc` on whatever encloses the ring. A custom property crosses
   the boundary of a scoped stylesheet where a class cannot. */
.busy {
  flex: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--ring-track, var(--warm-grey));
  border-top-color: var(--ring-arc, var(--orange));
  border-radius: 50%;
  animation: turn 700ms linear infinite;
}

@keyframes turn {
  to {
    transform: rotate(1turn);
  }
}

/* The ring stays and only its turning goes. It is what says the wait is not a
   dead screen so it is information rather than a reward. */
@media (prefers-reduced-motion: reduce) {
  .busy {
    animation: none;
  }
}
</style>
