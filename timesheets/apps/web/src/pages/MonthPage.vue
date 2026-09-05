<script setup lang="ts">
// The detailed view.
//
// The grid is tall and narrow so the space beside it carries the progress and
// the reference list. Both stay in view while the grid scrolls because both are
// about the month as a whole.

import PeriodBar from '@/components/PeriodBar.vue'
import MonthGrid from '@/components/MonthGrid.vue'
import MonthProgress from '@/components/MonthProgress.vue'
import RecentCostCentres from '@/components/RecentCostCentres.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
import SummaryPanel from '@/components/SummaryPanel.vue'
import ExportPanel from '@/components/ExportPanel.vue'

// The tour points at this page.
import { setPage, startUnlessSeen } from '@/composables/useTour'
import { onMounted } from 'vue'

setPage('month')
onMounted(() => startUnlessSeen())
</script>

<template>
  <div class="stack">
    <PeriodBar />
    <div class="split">
      <MonthGrid />
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

/* Below this the grid needs the whole width so the aside goes above it. */
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
