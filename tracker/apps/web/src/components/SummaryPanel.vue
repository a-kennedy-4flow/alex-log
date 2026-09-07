<script setup lang="ts">
// The two blocks the tracker keeps below the grid. Rows 71 to 88 group by cost
// centre. Rows 92 to 102 split each week into working and non-working days.
//
// The export carries these as values so what shows here is what ships.

import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FlexRender,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type SortingState,
} from '@tanstack/vue-table'

import type { AggregateRow } from '@tracker/core'
import { AGGREGATE_SLOTS } from '@tracker/core'
import {
  booked,
  byProject,
  byWeek,
  otherAbsenceDays,
  target,
  vacationDays,
} from '@/composables/useTimesheet'

const { t } = useI18n()

const sorting = ref<SortingState>([{ id: 'days', desc: true }])
const helper = createColumnHelper<AggregateRow>()

const columns = [
  helper.accessor('workdayId', {
    header: () => t('grid.workdayId'),
    // Null when the row holds a day value but no cost centre.
    cell: (info) => info.getValue() ?? '—',
  }),
  helper.accessor('specification', {
    header: () => t('grid.specification'),
    cell: (info) => info.getValue() ?? '',
  }),
  helper.accessor('customer', {
    header: () => t('summary.customer'),
    cell: (info) => info.getValue() ?? '',
  }),
  helper.accessor('businessLine', {
    header: () => t('summary.businessLine'),
    cell: (info) => info.getValue() ?? '',
  }),
  helper.accessor('days', {
    header: () => t('summary.days'),
    cell: (info) => h('span', { class: 'num' }, String(info.getValue())),
  }),
]

const table = useVueTable({
  get data() {
    return byProject.value
  },
  columns,
  state: {
    get sorting() {
      return sorting.value
    },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

const overflow = computed(() => byProject.value.length > AGGREGATE_SLOTS)
</script>

<template>
  <div class="panels sheet pad">
    <section>
      <h2 class="eyebrow">{{ t('summary.byProject') }}</h2>
      <table class="tight">
        <thead>
          <tr>
            <th
              v-for="header in table.getHeaderGroups()[0]?.headers ?? []"
              :key="header.id"
              :class="{ sortable: header.column.getCanSort(), right: header.id === 'days' }"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
              <span v-if="header.column.getIsSorted()" class="arrow">
                {{ header.column.getIsSorted() === 'desc' ? '▾' : '▴' }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in table.getRowModel().rows"
            :key="row.id"
            :class="{ beyond: index >= AGGREGATE_SLOTS }"
          >
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :class="{ right: cell.column.id === 'days' }"
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </td>
          </tr>
          <tr v-if="table.getRowModel().rows.length === 0">
            <td colspan="5" class="muted">{{ t('grid.empty') }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">{{ t('summary.vacation') }}</td>
            <td class="right num">{{ vacationDays }}</td>
          </tr>
          <tr>
            <td colspan="4">{{ t('summary.otherAbsence') }}</td>
            <td class="right num">{{ otherAbsenceDays }}</td>
          </tr>
          <tr class="grand">
            <td colspan="4">{{ t('summary.total') }}</td>
            <td class="right num">{{ booked }} / {{ target }}</td>
          </tr>
        </tfoot>
      </table>
      <p v-if="overflow" class="muted note">
        {{ t('validation.aggregateOverflow', { count: byProject.length, slots: AGGREGATE_SLOTS }) }}
      </p>
    </section>

    <section>
      <h2 class="eyebrow">{{ t('summary.byWeek') }}</h2>
      <table class="tight">
        <thead>
          <tr>
            <th>{{ t('summary.week') }}</th>
            <th class="right">{{ t('summary.workingDays') }}</th>
            <th class="right">{{ t('summary.nonWorkingDays') }}</th>
            <th class="right">{{ t('summary.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="week in byWeek" :key="week.week">
            <td class="num">{{ week.week }}</td>
            <td class="right num">{{ week.workingDays }}</td>
            <td class="right num" :class="{ flagged: week.nonWorkingDays > 0 }">
              {{ week.nonWorkingDays }}
            </td>
            <td class="right num">{{ week.total }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="grand">
            <td>{{ t('summary.total') }}</td>
            <td class="right num">
              {{ byWeek.reduce((sum, w) => sum + w.workingDays, 0) }}
            </td>
            <td class="right num">
              {{ byWeek.reduce((sum, w) => sum + w.nonWorkingDays, 0) }}
            </td>
            <td class="right num">{{ booked }}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  </div>
</template>

<style scoped>
.panels {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 28px;
  margin-top: 28px;
  padding-top: 26px;
  border-top: 1px solid var(--warm-grey);
  align-items: start;
}

@media (max-width: 1100px) {
  .panels {
    grid-template-columns: 1fr;
  }
}

table.tight {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th {
  text-align: left;
  font-size: 12px;
  color: var(--grey);
  font-weight: 400;
  padding: 0 8px 6px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

th.sortable {
  cursor: pointer;
  user-select: none;
}

th.sortable:hover {
  color: var(--smart-blue);
}

td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--line);
}

.right {
  text-align: right;
}

/* Past the fifteenth row the tracker summary block has nowhere to put it. */
tbody tr.beyond td {
  background: var(--open);
}

tfoot td {
  border-bottom: 0;
  padding-top: 6px;
  color: var(--grey);
}

tfoot tr.grand td {
  color: var(--smart-blue);
  font-weight: 700;
  border-top: 2px solid var(--bright-blue);
}

.flagged {
  font-weight: 700;
}

.arrow {
  margin-left: 4px;
  color: var(--grey);
}

.note {
  margin: 8px 0 0;
  font-size: 12px;
}
</style>
