<script setup lang="ts">
// The two circles of the wordmark.
//
// The header draws it at 26px and the credits draw it at 84px so the size comes
// from whoever mounts it. `--mark-body` and `--mark-accent` are what a dark
// ground changes. Because a) Smart Blue cannot be seen on the Smart Blue stage.
// b) a custom property crosses a scoped style where a class does not.
</script>

<template>
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect class="body" x="20" y="5" width="8" height="8" rx="4" />
    <circle class="body" cx="24" cy="26" r="16" />
    <path class="link" d="M24 26 35 20" fill="none" stroke-width="5" stroke-linecap="round" />
    <circle class="accent" cx="40" cy="42" r="16" />
  </svg>
</template>

<style scoped>
svg {
  display: block;
}

.body {
  fill: var(--mark-body, var(--smart-blue));
}

.accent {
  fill: var(--mark-accent, var(--orange));
}

.link {
  stroke: var(--mark-accent, var(--orange));
}
</style>
