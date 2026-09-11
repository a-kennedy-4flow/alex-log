<script setup lang="ts">
// The month. A stack of sections each carrying its own white surface.
//
// It is laid out by `.stack` and `.split` in `tokens.css` and so is the quick
// fill. One definition serves both because the two pages edit the same month
// and a reader moving between them should see one design.
//
// The middle section is the grid or the board. Both edit one month so both sit
// on this route and only that section changes. The row at the top of the box
// holds everything that reads or acts on the open month. The box is the surface
// so neither view carries one of its own. Because one box holds that row and
// whichever view it names a) each control sits on the thing it acts on and
// b) swapping the view leaves the surface where it was. The space beside it
// carries the progress and the reference list. Both stay in view while the
// month scrolls because both are about the month as a whole.

import PageTitle from '@/components/PageTitle.vue'
import PeriodBar from '@/components/PeriodBar.vue'
import ViewSwitch from '@/components/ViewSwitch.vue'
import SaveState from '@/components/SaveState.vue'
import MonthLegend from '@/components/MonthLegend.vue'
import ClearMonth from '@/components/ClearMonth.vue'
import MonthGrid from '@/components/MonthGrid.vue'
import MonthCalendar from '@/components/MonthCalendar.vue'
import MonthProgress from '@/components/MonthProgress.vue'
import RecentCostCentres from '@/components/RecentCostCentres.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
// The two aggregate tables sit below the grid and carry the table library with
// them. They are fetched after the grid has painted.
const SummaryPanel = defineAsyncComponent(() => import('@/components/SummaryPanel.vue'))
import ExportPanel from '@/components/ExportPanel.vue'

import { view } from '@/composables/useView'

// The tour points at this page.
import { setPage, startUnlessSeen } from '@/composables/useTour'
import { defineAsyncComponent, onMounted } from 'vue'

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
          <div class="month-bar">
            <SaveState />
            <!-- The board is the only view drawing a line per cost centre so it
                 is the only one with a line to name. -->
            <MonthLegend v-if="view === 'board'" />
            <div class="actions">
              <ClearMonth />
              <ViewSwitch />
            </div>
          </div>
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
