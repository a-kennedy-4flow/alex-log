// Mount tests. A build that compiles can still fail on the first render so the
// grid and the whole router tree are both mounted here.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/vue-router'

import { i18n } from '@/i18n'
import { routeTree } from '@/router'
import { allSpecifications, catalogue, setCatalogue, specificationsFor } from '@timesheets/core'
import { shortDate } from '@/i18n'
import { loadCatalogue } from '@timesheets/fixtures'
import {
  calendar,
  clearMonth,
  clearRow,
  halfDays,
  issues,
  monthOverride,
  openMonth,
  profile,
  target,
} from '@/composables/useTimesheet'
import MonthGrid from '@/components/MonthGrid.vue'
import SimpleView from '@/components/SimpleView.vue'
import SummaryPanel from '@/components/SummaryPanel.vue'
import AdminUpload from '@/components/AdminUpload.vue'
import MonthProgress from '@/components/MonthProgress.vue'
import TourOverlay from '@/components/TourOverlay.vue'
import SetupForm from '@/components/SetupForm.vue'
import PeriodBar from '@/components/PeriodBar.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
import ExportPanel from '@/components/ExportPanel.vue'
import {
  active as tourActive,
  back as tourBack,
  forgetSeen,
  hasSeen,
  index,
  next as tourNext,
  setPage,
  start as startTour,
  startUnlessSeen,
  steps,
  stop as tourStop,
} from '@/composables/useTour'
import RecentCostCentres from '@/components/RecentCostCentres.vue'
import { switchTo } from '@/composables/useDevUser'

const plugins = [i18n, VueQueryPlugin]

beforeAll(async () => {
  setCatalogue(await loadCatalogue())
  profile.location = '01_DE_Berlin'
  profile.entity = '02_GmbH'
  openMonth(2026, 4)
})

// The store is a module singleton so a test that leaves a booking behind
// changes what the next one sees. Every test starts on an empty April.
beforeEach(() => {
  clearMonth()
  monthOverride.value = null
  profile.workPercent = null
  switchTo('alex')
})

describe('the month grid', () => {
  it('shows one row a day until a day is split', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    expect(wrapper.findAll('tbody tr')).toHaveLength(calendar.value.length)
    // The grid still holds two rows for every day behind the view.
    expect(halfDays.value).toHaveLength(calendar.value.length * 2)
  })

  it('shades the non-working days', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    const shaded = wrapper.findAll('tr.non-working')
    expect(shaded).toHaveLength(calendar.value.filter((d) => d.nonWorking).length)
  })

  it('groups the rows into one block per calendar week', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    const weeks = new Set(calendar.value.map((d) => d.week))
    expect(wrapper.findAll('tbody.week')).toHaveLength(weeks.size)
  })

  it('writes the week number once for the whole week', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    const numbers = wrapper.findAll('.week-number').map((n) => n.text())
    const weeks = [...new Set(calendar.value.map((d) => d.week))].map(String)
    expect(numbers).toEqual(weeks)
  })

  it('spans the week cell over every row it shows', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    const spans = wrapper.findAll('td.col-week').map((n) => Number(n.attributes('rowspan')))
    const perWeek = new Map<number, number>()
    for (const day of calendar.value) perWeek.set(day.week, (perWeek.get(day.week) ?? 0) + 1)
    expect(spans).toEqual([...perWeek.values()])
    // Every row on show is covered exactly once.
    expect(spans.reduce((sum, n) => sum + n, 0)).toBe(wrapper.findAll('tbody tr').length)
  })

  it('offers the specification list once a cost centre is picked', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    const first = halfDays.value[0]
    expect(first).toBeDefined()
    expect(wrapper.find('select:disabled').exists()).toBe(true)

    first!.workdayId = '18019'
    await flushPromises()
    const options = wrapper.findAll('tbody:first-of-type select option')
    expect(options.length).toBeGreaterThan(1)
    first!.workdayId = null
    first!.specification = null
    first!.days = null
  })
})

describe('the other panels', () => {
  it('mounts the quick fill', () => {
    const wrapper = mount(SimpleView, { global: { plugins } })
    expect(wrapper.text()).toContain('100 / n')
  })

  it('mounts the summary', () => {
    const wrapper = mount(SummaryPanel, { global: { plugins } })
    expect(wrapper.findAll('table')).toHaveLength(2)
  })
})

describe('the router tree', () => {
  it('renders the month route through the real root layout', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const Host = defineComponent({ render: () => h(RouterProvider, { router }) })
    const wrapper = mount(Host, { global: { plugins } })
    await router.load()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('4flow timesheets')
    expect(wrapper.findAll('nav a')).toHaveLength(3)
  })
})

describe('the cost centre picker', () => {
  async function openPicker() {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await wrapper.find('.picker .trigger').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('narrows the list as characters are typed', async () => {
    const wrapper = await openPicker()
    const count = async (text: string): Promise<number> => {
      await wrapper.find('.picker input[type="search"]').setValue(text)
      await flushPromises()
      return wrapper.findAll('.picker .results li').length
    }
    const wide = await count('2')
    const narrow = await count('2411')
    expect(wide).toBeGreaterThan(0)
    expect(narrow).toBeGreaterThan(0)
    expect(narrow).toBeLessThan(wide)
  })

  it('leads with an id that starts with what was typed', async () => {
    const wrapper = await openPicker()
    await wrapper.find('.picker input[type="search"]').setValue('24')
    await flushPromises()
    expect(wrapper.find('.picker .results li .id').text().startsWith('24')).toBe(true)
  })

  it('takes the highlighted row on Enter', async () => {
    const wrapper = await openPicker()
    const input = wrapper.find('.picker input[type="search"]')
    await input.setValue('24112')
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(halfDays.value[0]?.workdayId).toBe('24112')
    // Taking a row closes the panel.
    expect(wrapper.find('.picker .panel').exists()).toBe(false)
    clearRow(halfDays.value[0]!)
  })

  it('moves the highlight with the arrow keys', async () => {
    const wrapper = await openPicker()
    const input = wrapper.find('.picker input[type="search"]')
    await input.setValue('24')
    await flushPromises()
    const second = wrapper.findAll('.picker .results li .id')[1]?.text()
    await input.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(halfDays.value[0]?.workdayId).toBe(second)
    clearRow(halfDays.value[0]!)
  })

  it('closes on Escape without picking anything', async () => {
    const wrapper = await openPicker()
    await wrapper.find('.picker input[type="search"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('.picker .panel').exists()).toBe(false)
    expect(halfDays.value[0]?.workdayId).toBeNull()
  })

  it('shows every workday id at most once', async () => {
    const wrapper = await openPicker()
    await wrapper.find('.picker input[type="search"]').setValue('2')
    await flushPromises()
    const ids = wrapper.findAll('.picker .results li .id').map((n) => n.text())
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the days dropdown', () => {
  async function pick(wrapper: ReturnType<typeof mount>, row: number, id: string) {
    const pickers = wrapper.findAll('.picker')
    await pickers[row]!.find('.trigger').trigger('click')
    await flushPromises()
    const input = pickers[row]!.find('input[type="search"]')
    await input.setValue(id)
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  function daysOf(row: number): number | null {
    return halfDays.value[row]?.days ?? null
  }

  it('gives the first row of a day the whole day', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pick(wrapper, 0, '24112')
    expect(daysOf(0)).toBe(1)
    clearRow(halfDays.value[0]!)
  })

  it('gives the second row the half the first one leaves', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pick(wrapper, 0, '24112')
    // Asking for a half is what opens the day.
    await wrapper.findAll('td.col-days select')[0]!.setValue('0.5')
    await flushPromises()
    await pick(wrapper, 1, '24111')
    expect(daysOf(0)).toBe(0.5)
    expect(daysOf(1)).toBe(0.5)
  })

  it('offers the second row nothing but a half', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pick(wrapper, 0, '24112')
    await wrapper.findAll('td.col-days select')[0]!.setValue('0.5')
    await flushPromises()
    const options = wrapper
      .findAll('td.col-days select')[1]!
      .findAll('option')
      .map((o) => o.text())
      .filter((t) => t !== '')
    expect(options).toEqual(['0.5'])
  })

  it('takes the second row away when the first takes the whole day back', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pick(wrapper, 0, '24112')
    await wrapper.findAll('td.col-days select')[0]!.setValue('0.5')
    await flushPromises()
    await pick(wrapper, 1, '24111')
    expect(halfDays.value[1]!.workdayId).toBe('24111')

    await wrapper.findAll('td.col-days select')[0]!.setValue('1')
    await flushPromises()
    expect(daysOf(0)).toBe(1)
    // Nothing may be left in a row the user can no longer see.
    expect(halfDays.value[1]!.workdayId).toBeNull()
    expect(daysOf(1)).toBeNull()
  })

  it('does not touch the next day', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pick(wrapper, 0, '24112')
    // Only the upper row of each day is on show so the next picker is the
    // next day rather than the lower row of this one.
    await pick(wrapper, 1, '24111')
    expect(daysOf(0)).toBe(1)
    expect(daysOf(2)).toBe(1)
  })
})

describe('the default specification', () => {
  async function pickCostCentre(wrapper: ReturnType<typeof mount>, row: number, id: string) {
    const pickers = wrapper.findAll('.picker')
    await pickers[row]!.find('.trigger').trigger('click')
    await flushPromises()
    const input = pickers[row]!.find('input[type="search"]')
    await input.setValue(id)
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  it('fills the first of the allowed list when none is given', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickCostCentre(wrapper, 0, '24112')
    const entry = halfDays.value[0]!
    expect(entry.specification).toBe(specificationsFor('24112').options[0])
    expect(entry.specificationIsDefault).toBe(true)
    clearRow(entry)
  })

  it('marks the default apart from a chosen one', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickCostCentre(wrapper, 0, '24112')
    const select = wrapper.findAll('select')[0]!
    expect(select.classes()).toContain('provisional')
    expect(wrapper.find('.col-spec .mark').exists()).toBe(true)
    clearRow(halfDays.value[0]!)
  })

  it('drops the mark once the user picks from the list', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickCostCentre(wrapper, 0, '24112')
    const options = specificationsFor('24112').options
    await wrapper.findAll('select')[0]!.setValue(options[1])
    await flushPromises()
    expect(halfDays.value[0]!.specification).toBe(options[1])
    expect(halfDays.value[0]!.specificationIsDefault).toBe(false)
    expect(wrapper.findAll('select')[0]!.classes()).not.toContain('provisional')
    clearRow(halfDays.value[0]!)
  })

  it('keeps the mark off a row with no cost centre', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    expect(wrapper.find('.col-spec .mark').exists()).toBe(false)
  })

  it('replaces a default that the new cost centre disallows', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickCostCentre(wrapper, 0, 'Vacation or sickness')
    expect(halfDays.value[0]!.specification).toBe('4s_Overheads_Absence')
    await pickCostCentre(wrapper, 0, '24112')
    expect(specificationsFor('24112').options).toContain(halfDays.value[0]!.specification)
    expect(halfDays.value[0]!.specificationIsDefault).toBe(true)
    clearRow(halfDays.value[0]!)
  })

  it('leaves the sheet valid straight after a pick', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickCostCentre(wrapper, 0, '24112')
    // A row is complete only with a cost centre and a specification and a day.
    expect(issues.value.filter((i) => i.code === 'incompleteEntries')).toEqual([])
    clearRow(halfDays.value[0]!)
  })
})

describe('the second row of a day', () => {
  async function pickRow(wrapper: ReturnType<typeof mount>, row: number, id: string) {
    const pickers = wrapper.findAll('.picker')
    await pickers[row]!.find('.trigger').trigger('click')
    await flushPromises()
    const input = pickers[row]!.find('input[type="search"]')
    await input.setValue(id)
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  async function halveFirst(wrapper: ReturnType<typeof mount>) {
    await wrapper.findAll('td.col-days select')[0]!.setValue('0.5')
    await flushPromises()
  }

  it('is hidden while the first row of that day is empty', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    expect(wrapper.findAll('.picker')).toHaveLength(calendar.value.length)
  })

  it('stays hidden while the first row holds a whole day', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    expect(halfDays.value[0]!.days).toBe(1)
    expect(wrapper.findAll('.picker')).toHaveLength(calendar.value.length)
  })

  it('appears once the first row is set to a half', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    await halveFirst(wrapper)
    expect(wrapper.findAll('.picker')).toHaveLength(calendar.value.length + 1)
    // The new row belongs to the same day.
    const dates = wrapper.findAll('td.col-date')
    expect(dates).toHaveLength(calendar.value.length)
    expect(dates[0]!.attributes('rowspan')).toBe('2')
  })

  it('goes again when the first row is emptied', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    await halveFirst(wrapper)
    clearRow(halfDays.value[0]!)
    await flushPromises()
    expect(wrapper.findAll('.picker')).toHaveLength(calendar.value.length)
  })

  it('grows the week cell with the row it gains', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    const before = Number(wrapper.findAll('td.col-week')[0]!.attributes('rowspan'))
    await pickRow(wrapper, 0, '24112')
    await halveFirst(wrapper)
    const after = Number(wrapper.findAll('td.col-week')[0]!.attributes('rowspan'))
    expect(after).toBe(before + 1)
    // The span still covers every row on show.
    const spans = wrapper.findAll('td.col-week').map((n) => Number(n.attributes('rowspan')))
    expect(spans.reduce((sum, n) => sum + n, 0)).toBe(wrapper.findAll('tbody tr').length)
  })
})

describe('the admin page', () => {
  it('refuses an ordinary user', () => {
    switchTo('alex')
    const wrapper = mount(AdminUpload, { global: { plugins } })
    expect(wrapper.text()).toContain('Only the backoffice group')
    expect(wrapper.find('.drop').exists()).toBe(false)
  })

  it('opens for the backoffice group', () => {
    switchTo('backoffice')
    const wrapper = mount(AdminUpload, { global: { plugins } })
    expect(wrapper.find('.drop').exists()).toBe(true)
    expect(wrapper.find('input[type="file"]').attributes('accept')).toBe('.xlsm,.xlsx')
    switchTo('alex')
  })

  it('is hidden from the nav for an ordinary user', async () => {
    switchTo('alex')
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const Host = defineComponent({ render: () => h(RouterProvider, { router }) })
    const wrapper = mount(Host, { global: { plugins } })
    await router.load()
    await flushPromises()
    expect(wrapper.findAll('nav a')).toHaveLength(3)
  })

  it('is offered to the backoffice group', async () => {
    switchTo('backoffice')
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const Host = defineComponent({ render: () => h(RouterProvider, { router }) })
    const wrapper = mount(Host, { global: { plugins } })
    await router.load()
    await flushPromises()
    expect(wrapper.findAll('nav a')).toHaveLength(4)
    switchTo('alex')
  })
})

describe('copying the last filled row', () => {
  async function pickRow(wrapper: ReturnType<typeof mount>, row: number, id: string) {
    const pickers = wrapper.findAll('.picker')
    await pickers[row]!.find('.trigger').trigger('click')
    await flushPromises()
    const input = pickers[row]!.find('input[type="search"]')
    await input.setValue(id)
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  /** Every copy button carries the row it would take. */
  function copyButtons(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('button[data-copy-from]')
  }

  function clearAll() {
    for (const row of halfDays.value.filter((h) => h.workdayId !== null)) clearRow(row)
  }

  it('offers nothing while the month is empty', () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    expect(copyButtons(wrapper)).toHaveLength(0)
  })

  it('offers the one filled row to every empty row below it', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    const buttons = copyButtons(wrapper)
    expect(buttons.length).toBeGreaterThan(20)
    // Every one of them points at the only filled row there is.
    for (const button of buttons) expect(button.attributes('data-copy-from')).toBe('24112')
    clearAll()
  })

  it('reaches back over the empty rows between two working days', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')

    // A day several rows below with nothing but empty rows in between.
    const later = calendar.value[4]!.date
    const target = halfDays.value.find((h) => h.date === later && h.half === 0)!
    expect(target.workdayId).toBeNull()

    const row = wrapper.findAll('tbody tr').find((tr) => tr.text().includes(shortDate('en', later)))
    expect(row, later).toBeDefined()
    await row!.find('button[data-copy-from]').trigger('click')
    await flushPromises()
    expect(target.workdayId).toBe('24112')
    clearAll()
  })

  it('takes the nearest filled row and not the first one', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')

    // A later day takes a different cost centre.
    const third = calendar.value[2]!.date
    const thirdRow = halfDays.value.find((h) => h.date === third && h.half === 0)!
    thirdRow.workdayId = '24111'
    thirdRow.specification = specificationsFor('24111').options[0] ?? null
    thirdRow.days = 1
    await flushPromises()

    // Every button below that day now points at it.
    const buttons = copyButtons(wrapper)
    expect(buttons.at(-1)!.attributes('data-copy-from')).toBe('24111')
    // The one above it still points at the first row.
    expect(buttons[0]!.attributes('data-copy-from')).toBe('24112')
    clearAll()
  })

  it('carries the specification and its default mark', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    const source = halfDays.value[0]!
    expect(source.specificationIsDefault).toBe(true)

    await copyButtons(wrapper)[0]!.trigger('click')
    await flushPromises()
    const copied = halfDays.value.filter((h) => h.workdayId !== null)[1]!
    expect(copied.specification).toBe(source.specification)
    expect(copied.specificationIsDefault).toBe(true)
    clearAll()
  })

  it('takes the half a split day leaves', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    await wrapper.findAll('td.col-days select')[0]!.setValue('0.5')
    await flushPromises()

    // The lower row of the same day is now on show and copies into it.
    await copyButtons(wrapper)[0]!.trigger('click')
    await flushPromises()
    expect(halfDays.value[1]!.workdayId).toBe('24112')
    expect(halfDays.value[0]!.days).toBe(0.5)
    expect(halfDays.value[1]!.days).toBe(0.5)
  })
})

describe('the progress panel', () => {
  async function pickRow(wrapper: ReturnType<typeof mount>, row: number, id: string) {
    const pickers = wrapper.findAll('.picker')
    await pickers[row]!.find('.trigger').trigger('click')
    await flushPromises()
    const input = pickers[row]!.find('input[type="search"]')
    await input.setValue(id)
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  it('reads nothing booked on an empty month', () => {
    const wrapper = mount(MonthProgress, { global: { plugins } })
    expect(wrapper.find('.booked').text()).toBe('0')
    expect(wrapper.find('.fill').attributes('style')).toContain('width: 0%')
    expect(wrapper.classes()).toContain('filling')
  })

  it('carries the numbers a screen reader needs', () => {
    const wrapper = mount(MonthProgress, { global: { plugins } })
    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe(String(target.value))
  })

  it('grows as days are booked', async () => {
    const grid = mount(MonthGrid, { global: { plugins } })
    await pickRow(grid, 0, '24112')
    const wrapper = mount(MonthProgress, { global: { plugins } })
    expect(wrapper.find('.booked').text()).toBe('1')
    const width = Number(
      /width: ([\d.]+)%/.exec(wrapper.find('.fill').attributes('style') ?? '')?.[1] ?? '0',
    )
    expect(width).toBeGreaterThan(0)
    expect(width).toBeLessThan(100)
    clearRow(halfDays.value[0]!)
  })

  it('reports a finished month and never fills past full', async () => {
    // Book exactly the target.
    for (const row of halfDays.value) clearRow(row)
    let booked = 0
    for (const day of calendar.value) {
      if (booked >= target.value) break
      if (day.nonWorking) continue
      const upper = halfDays.value.find((h) => h.date === day.date && h.half === 0)!
      upper.workdayId = '24112'
      upper.specification = specificationsFor('24112').options[0] ?? null
      upper.days = 1
      booked++
    }
    await flushPromises()
    const wrapper = mount(MonthProgress, { global: { plugins } })
    expect(wrapper.classes()).toContain('complete')
    expect(wrapper.find('.fill').attributes('style')).toContain('width: 100%')
    expect(wrapper.find('.overfill').exists()).toBe(false)
    for (const row of halfDays.value) clearRow(row)
  })

  it('shows an overshoot rather than hiding it at full', async () => {
    for (const row of halfDays.value) clearRow(row)
    // One day past the target is enough. Booking the whole month is slow and
    // says nothing more.
    const spec = specificationsFor('24112').options[0] ?? null
    let booked = 0
    for (const day of calendar.value) {
      if (booked > target.value) break
      const upper = halfDays.value.find((h) => h.date === day.date && h.half === 0)!
      upper.workdayId = '24112'
      upper.specification = spec
      upper.days = 1
      booked++
    }
    await flushPromises()
    const wrapper = mount(MonthProgress, { global: { plugins } })
    expect(wrapper.classes()).toContain('over')
    expect(wrapper.find('.overfill').exists()).toBe(true)
    for (const row of halfDays.value) clearRow(row)
  })

  it('marks one block per calendar week', () => {
    const wrapper = mount(MonthProgress, { global: { plugins } })
    const weeks = new Set(calendar.value.map((d) => d.week))
    expect(wrapper.findAll('.weeks li')).toHaveLength(weeks.size)
  })
})

describe('the reference list', () => {
  it('says so while nothing has been booked', () => {
    for (const row of halfDays.value) clearRow(row)
    const wrapper = mount(RecentCostCentres, { global: { plugins } })
    expect(wrapper.find('.empty').exists()).toBe(true)
  })

  it('lists what the month uses ordered by days', async () => {
    for (const row of halfDays.value) clearRow(row)
    const days = calendar.value.filter((d) => !d.nonWorking)
    // Two days on one cost centre and one on another.
    for (const [index, id] of [
      [0, '24112'],
      [1, '24112'],
      [2, '24111'],
    ] as const) {
      const upper = halfDays.value.find((h) => h.date === days[index]!.date && h.half === 0)!
      upper.workdayId = id
      upper.specification = specificationsFor(id).options[0] ?? null
      upper.days = 1
    }
    await flushPromises()
    const wrapper = mount(RecentCostCentres, { global: { plugins } })
    const ids = wrapper.findAll('li .id').map((n) => n.text())
    expect(ids.slice(0, 2)).toEqual(['24112', '24111'])
    for (const row of halfDays.value) clearRow(row)
  })

  it('holds no more than five', async () => {
    for (const row of halfDays.value) clearRow(row)
    const ids = ['24112', '24111', '24141', '24041', '24241', '18019']
    const days = calendar.value.filter((d) => !d.nonWorking)
    ids.forEach((id, index) => {
      const upper = halfDays.value.find((h) => h.date === days[index]!.date && h.half === 0)!
      upper.workdayId = id
      upper.specification = specificationsFor(id).options[0] ?? null
      upper.days = 1
    })
    await flushPromises()
    const wrapper = mount(RecentCostCentres, { global: { plugins } })
    expect(wrapper.findAll('li')).toHaveLength(5)
    for (const row of halfDays.value) clearRow(row)
  })

  it('books on the next free working day when clicked', async () => {
    for (const row of halfDays.value) clearRow(row)
    const first = calendar.value.find((d) => !d.nonWorking)!
    const seed = halfDays.value.find((h) => h.date === first.date && h.half === 0)!
    seed.workdayId = '24112'
    seed.specification = specificationsFor('24112').options[0] ?? null
    seed.days = 1
    await flushPromises()

    const wrapper = mount(RecentCostCentres, { global: { plugins } })
    await wrapper.find('li button').trigger('click')
    await flushPromises()

    // The first day was taken so it lands on the second working day.
    const second = calendar.value.filter((d) => !d.nonWorking)[1]!
    const landed = halfDays.value.find((h) => h.date === second.date && h.half === 0)!
    expect(landed.workdayId).toBe('24112')
    expect(wrapper.find('.landed').exists()).toBe(true)
    for (const row of halfDays.value) clearRow(row)
  })

  it('never books a non-working day while a working one is free', async () => {
    for (const row of halfDays.value) clearRow(row)
    const first = calendar.value.find((d) => !d.nonWorking)!
    const seed = halfDays.value.find((h) => h.date === first.date && h.half === 0)!
    seed.workdayId = '24112'
    seed.specification = specificationsFor('24112').options[0] ?? null
    seed.days = 1
    await flushPromises()

    const wrapper = mount(RecentCostCentres, { global: { plugins } })
    await wrapper.find('li button').trigger('click')
    await flushPromises()
    const nonWorking = new Set(calendar.value.filter((d) => d.nonWorking).map((d) => d.date))
    for (const row of halfDays.value.filter((h) => h.workdayId !== null)) {
      expect(nonWorking.has(row.date), row.date).toBe(false)
    }
    for (const row of halfDays.value) clearRow(row)
  })
})

describe('the tour', () => {
  beforeEach(() => {
    forgetSeen()
    setPage('month')
  })

  it('does nothing until it is started', () => {
    const wrapper = mount(TourOverlay, { global: { plugins } })
    expect(wrapper.find('[data-tour-overlay]').exists()).toBe(false)
  })

  it('only offers steps whose element is on the page', () => {
    // Nothing is mounted so no anchor exists.
    setPage('settings')
    startTour()
    expect(steps.value).toEqual([])
    expect(tourActive.value).toBe(false)
  })

  it('walks the steps of the page that is mounted', async () => {
    mount(SetupForm, { global: { plugins }, attachTo: document.body })
    setPage('settings')
    startTour()
    await flushPromises()
    expect(steps.value.map((s) => s.key)).toEqual([
      'location',
      'entity',
      'businessLine',
      'contract',
    ])
    expect(tourActive.value).toBe(true)
  })

  it('points at the element the step names', async () => {
    mount(SetupForm, { global: { plugins }, attachTo: document.body })
    setPage('settings')
    startTour()
    const overlay = mount(TourOverlay, { global: { plugins }, attachTo: document.body })
    await flushPromises()
    expect(overlay.find('.spot').exists()).toBe(true)
    expect(overlay.find('.tip h3').text()).not.toBe('')
    expect(overlay.find('.count').text()).toBe('1 / 4')
  })

  it('moves forward and back and closes on the last step', async () => {
    mount(SetupForm, { global: { plugins }, attachTo: document.body })
    setPage('settings')
    startTour()
    await flushPromises()
    expect(index.value).toBe(0)
    tourBack()
    // The first step has nowhere to go back to.
    expect(index.value).toBe(0)
    tourNext()
    expect(index.value).toBe(1)
    tourBack()
    expect(index.value).toBe(0)
    for (let i = 0; i < steps.value.length; i++) tourNext()
    expect(tourActive.value).toBe(false)
  })

  it('shows itself once and then waits to be asked', async () => {
    mount(SetupForm, { global: { plugins }, attachTo: document.body })
    setPage('settings')
    startUnlessSeen()
    await flushPromises()
    expect(tourActive.value).toBe(true)
    tourStop()
    expect(hasSeen('settings')).toBe(true)

    startUnlessSeen()
    expect(tourActive.value).toBe(false)
    // Asking directly still works.
    startTour()
    expect(tourActive.value).toBe(true)
    tourStop()
  })

  it('closes when the page changes under it', async () => {
    mount(SetupForm, { global: { plugins }, attachTo: document.body })
    setPage('settings')
    startTour()
    await flushPromises()
    expect(tourActive.value).toBe(true)
    setPage('month')
    expect(tourActive.value).toBe(false)
  })

  it('names an anchor for every step of every page', () => {
    // A step pointing at an attribute nobody wrote would be skipped in
    // silence so the two lists are compared here instead.
    const anchored = new Set(
      [MonthGrid, SetupForm, SimpleView, AdminUpload].flatMap((component) => {
        switchTo('backoffice')
        const wrapper = mount(component, { global: { plugins }, attachTo: document.body })
        const found = wrapper
          .findAll('[data-tour]')
          .map((node) => node.attributes('data-tour') ?? '')
        return found
      }),
    )
    for (const page of ['month', 'quick', 'settings', 'admin'] as const) {
      setPage(page)
      startTour()
      for (const step of steps.value) expect(anchored.has(step.anchor), step.anchor).toBe(true)
      tourStop()
    }
    switchTo('alex')
  })
})

describe('a month with no office set', () => {
  /** The state a user reaches by filling the month before opening settings. */
  function fillMonth() {
    const spec = specificationsFor('24112').options[0] ?? null
    let n = 0
    for (const day of calendar.value) {
      if (n >= target.value) break
      if (day.nonWorking) continue
      const row = halfDays.value.find((h) => h.date === day.date && h.half === 0)!
      row.workdayId = '24112'
      row.specification = spec
      row.days = 1
      n++
    }
  }

  it('says why rather than only disabling the button', async () => {
    profile.location = null
    fillMonth()
    await flushPromises()

    const checks = mount(ValidationPanel, { global: { plugins } })
    expect(checks.text()).toContain('Set your office')

    const download = mount(ExportPanel, { global: { plugins } })
    expect(download.find('button').attributes('disabled')).toBeDefined()
    // The panel used to disable the button and give no reason at all.
    expect(download.text()).toContain('Fix the errors above')

    profile.location = '01_DE_Berlin'
  })

  it('marks the office field itself', async () => {
    profile.location = null
    await flushPromises()
    const bar = mount(PeriodBar, { global: { plugins } })
    expect(bar.find('select.missing').exists()).toBe(true)

    profile.location = '01_DE_Berlin'
    await flushPromises()
    const set = mount(PeriodBar, { global: { plugins } })
    expect(set.find('select.missing').exists()).toBe(false)
  })

  it('marks a missing entity as a warning in the settings', async () => {
    profile.entity = null
    await flushPromises()
    const form = mount(SetupForm, { global: { plugins } })
    expect(form.find('select.incomplete').exists()).toBe(true)
    profile.entity = '02_GmbH'
  })

  it('lets the download through once the office is set', async () => {
    profile.location = '01_DE_Berlin'
    fillMonth()
    await flushPromises()
    expect(issues.value.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('the specification dropdown', () => {
  async function pickRow(wrapper: ReturnType<typeof mount>, row: number, id: string) {
    const pickers = wrapper.findAll('.picker')
    await pickers[row]!.find('.trigger').trigger('click')
    await flushPromises()
    const input = pickers[row]!.find('input[type="search"]')
    await input.setValue(id)
    await flushPromises()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  /** The options of one row rather than of every row on the page. */
  function options(wrapper: ReturnType<typeof mount>, row = 0) {
    return wrapper
      .findAll('td.col-spec select')[row]!
      .findAll('option')
      .map((o) => o.attributes('value') ?? '')
  }

  /**
   * The workbook leaves the list of this one empty. Resolved inside the test
   * because the catalogue is loaded by beforeAll and not at import time.
   */
  function noList() {
    const found = catalogue.projects.find(
      (p) => p.businessLine === 'Corporate Services' && p.objectKey === 'cc',
    )
    expect(found, 'no cost centre with a missing list to test against').toBeDefined()
    return found!
  }

  it('offers no blank for a cost centre that names its own list', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, '24112')
    expect(halfDays.value[0]!.specification).toBe(specificationsFor('24112').options[0])
    expect(options(wrapper)).not.toContain('')
  })

  it('starts blank for a cost centre with no list and offers the blank back', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, noList().workdayId)
    expect(halfDays.value[0]!.specification).toBeNull()
    expect(options(wrapper)).toContain('')
  })

  it('offers that cost centre the whole list', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, noList().workdayId)
    const values = options(wrapper).filter((v) => v !== '')
    expect(values.length).toBeGreaterThan(10)
    expect(values[0]).toBe(allSpecifications()[0])
  })

  it('does not mark a blank as a default', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, noList().workdayId)
    expect(halfDays.value[0]!.specificationIsDefault).toBe(false)
    expect(wrapper.find('td.col-spec .mark').exists()).toBe(false)
  })

  it('leaves that row complete with nothing chosen', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, noList().workdayId)
    await flushPromises()
    expect(issues.value.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('warns once a value is chosen off the whole list', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, noList().workdayId)
    await wrapper.findAll('td.col-spec select')[0]!.setValue(allSpecifications()[0])
    await flushPromises()
    expect(issues.value.map((i) => i.code)).toContain('specificationUnverified')
    expect(issues.value.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('replaces the blank with a default when the cost centre gains a list', async () => {
    const wrapper = mount(MonthGrid, { global: { plugins } })
    await pickRow(wrapper, 0, noList().workdayId)
    expect(halfDays.value[0]!.specification).toBeNull()
    await pickRow(wrapper, 0, '24112')
    expect(halfDays.value[0]!.specification).toBe(specificationsFor('24112').options[0])
    expect(halfDays.value[0]!.specificationIsDefault).toBe(true)
  })
})
