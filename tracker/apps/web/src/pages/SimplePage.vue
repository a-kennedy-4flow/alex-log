<script setup lang="ts">
// The quick view. Shares the progress and the reference list with the month
// view because both describe the month rather than the screen.
//
// It is laid out by `.stack` and `.split` in `tokens.css` and so is the month
// view. It carried neither the heading nor a shared layout before so moving
// between the two pages changed the spacing and lost the month name.

import PageTitle from '@/components/PageTitle.vue'
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
  <div>
    <PageTitle />

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
  </div>
</template>
