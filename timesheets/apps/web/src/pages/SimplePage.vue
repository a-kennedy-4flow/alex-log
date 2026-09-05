<script setup lang="ts">
// The quick view. Shares the progress and the reference list with the month
// view because both describe the month rather than the screen.

import PeriodBar from '@/components/PeriodBar.vue'
import SimpleView from '@/components/SimpleView.vue'
import MonthProgress from '@/components/MonthProgress.vue'
import RecentCostCentres from '@/components/RecentCostCentres.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
import SummaryPanel from '@/components/SummaryPanel.vue'
import ExportPanel from '@/components/ExportPanel.vue'

// The tour points at this page.
import { setPage, startUnlessSeen } from '@/composables/useTour'
import { onMounted } from 'vue'

setPage('quick')
onMounted(() => startUnlessSeen())
</script>

<template>
  <div class="stack">
    <PeriodBar />
    <div class="split">
      <SimpleView />
      <aside>
        <MonthProgress />
        <RecentCostCentres />
        <ValidationPanel />
      </aside>
    </div>
    <SummaryPanel />
    <ExportPanel />
  </div>
</template>

<style scoped>
.stack {
  display: grid;
  gap: var(--gap);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--gap);
  align-items: start;
}

aside {
  display: grid;
  gap: var(--gap);
  position: sticky;
  top: var(--gap);
}

@media (max-width: 1200px) {
  .split {
    grid-template-columns: 1fr;
  }

  aside {
    position: static;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}
</style>
