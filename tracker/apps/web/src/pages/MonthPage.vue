<script setup lang="ts">
// The month. A stack of sections each carrying its own white surface.
//
// It is laid out by `.stack` and `.split` in `tokens.css` and so is the quick
// fill. One definition serves both because the two pages edit the same month
// and a reader moving between them should see one design.
//
// The middle section is the grid or the board. Both edit one month so both sit
// on this route and only that section changes. The switch between them stands
// inside the same box at the top. The box is the surface so the two views carry
// none of their own. Because one box holds the switch and whichever view it
// names a) the control sits on the thing it acts on and b) swapping the view
// leaves the surface where it was. The space beside it carries the progress and the
// reference list. Both stay in view while the month scrolls because both are
// about the month as a whole.

import PageTitle from '@/components/PageTitle.vue'
import PeriodBar from '@/components/PeriodBar.vue'
import ViewSwitch from '@/components/ViewSwitch.vue'
import MonthGrid from '@/components/MonthGrid.vue'
import MonthCalendar from '@/components/MonthCalendar.vue'
import MonthProgress from '@/components/MonthProgress.vue'
import RecentCostCentres from '@/components/RecentCostCentres.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
import SummaryPanel from '@/components/SummaryPanel.vue'
import ExportPanel from '@/components/ExportPanel.vue'

import { view } from '@/composables/useView'

// The tour points at this page.
import { setPage, startUnlessSeen } from '@/composables/useTour'
import { onMounted } from 'vue'

setPage('month')
onMounted(() => startUnlessSeen())
</script>

<template>
  <div>
    <PageTitle />

    <div class="stack">
      <PeriodBar />
      <div class="split">
        <div class="month sheet pad">
          <ViewSwitch />
          <MonthGrid v-if="view === 'grid'" />
          <MonthCalendar v-else />
        </div>
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
