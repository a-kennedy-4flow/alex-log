// Autosave.
//
// The month is written as it is edited so these tests are about when a write
// happens rather than about what it carries. The API is faked because the
// question is the timing and the ordering and neither needs a server.
//
// The timer is faked and `flushPromises` is not used with it. A faked
// `setTimeout` would never resolve the one `flushPromises` waits on, so the
// microtask queue is drained by hand instead.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { loadCatalogue } from '@tracker/fixtures'

class FakeApiError extends Error {
  readonly status: number
  readonly codes: string[] = []
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface FakeSheet {
  year: number
  month: number
  location: string
  halfDays: { date: string; half: number; days: number | null }[]
  adjustedWorkDays: number | null
  updatedAt: string
  exportedAt: string | null
}

// Hoisted because `vi.mock` is lifted above the file body.
const state = vi.hoisted(() => ({
  sheets: new Map<string, unknown>(),
  puts: [] as { period: string; booked: number }[],
  gets: [] as string[],
  exports: 0,
  fail: false,
  /** Held open by a test that wants two writes to overlap. */
  gate: null as Promise<void> | null,
  tick: 0,
  /** What the fake API keeps across a write. The real one keeps it too. */
  exportedAt: null as string | null,
}))

/** Later on every call so one write is always newer than the last. */
function stamp(): string {
  state.tick++
  return new Date(Date.UTC(2026, 4, 1, 9, 0, state.tick)).toISOString()
}

vi.mock('@/lib/api', () => ({
  ApiError: FakeApiError,
  usingApi: true,
  API_URL: 'http://localhost:8787',
  download: vi.fn(),
  api: {
    getSheet: (period: string) => {
      state.gets.push(period)
      const sheet = state.sheets.get(period)
      return sheet
        ? Promise.resolve(sheet)
        : Promise.reject(new FakeApiError(404, 'no sheet saved for that month'))
    },
    putSheet: async (period: string, input: FakeSheet) => {
      state.puts.push({
        period,
        booked: input.halfDays.filter((half) => half.days !== null).length,
      })
      if (state.gate) await state.gate
      if (state.fail) throw new FakeApiError(500, 'the write did not land')
      const [year, month] = period.split('-').map(Number) as [number, number]
      const stored: FakeSheet = {
        ...input,
        year,
        month,
        updatedAt: stamp(),
        // The PUT keeps whatever is stored. That is the rule under test in the
        // API suite and the fake has to hold it for the screen to read right.
        exportedAt: state.exportedAt,
      }
      state.sheets.set(period, stored)
      return stored
    },
    listSheets: () => Promise.resolve({ sheets: [] }),
    getProfile: () => Promise.reject(new FakeApiError(404, 'no profile')),
    export: () => {
      state.exports++
      return Promise.resolve({ filename: 'sheet.xlsm', blob: new Blob(['x']) })
    },
  },
}))

const { i18n } = await import('@/i18n')
const store = await import('@/composables/useTimesheet')
const { setCatalogue, specificationsFor } = await import('@tracker/core')
const ExportPanel = (await import('@/components/ExportPanel.vue')).default

const plugins = [i18n]

/**
 * Drains the microtask queue. Ten passes clears the deepest chain here which is
 * the load then the guard then the write.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

/** Books one working day. The smallest thing that counts as an edit. */
function edit(days: 0.5 | 1 = 1): void {
  const row = store.halfDays.value.find((half) => half.half === 0 && half.days === null)!
  row.workdayId = '24112'
  row.specification = specificationsFor('24112').options[0] ?? null
  row.days = days
  row.location = store.profile.location
}

async function openApril(): Promise<void> {
  store.openMonth(2026, 4)
  await settle()
}

beforeAll(async () => {
  setCatalogue(await loadCatalogue())
  store.profile.location = '01_DE_Berlin'
  store.profile.entity = '02_GmbH'
  vi.useFakeTimers()
})

beforeEach(async () => {
  localStorage.clear()
  state.sheets.clear()
  state.puts.length = 0
  state.gets.length = 0
  state.exports = 0
  state.fail = false
  state.gate = null
  state.exportedAt = null
  await openApril()
  state.puts.length = 0
})

describe('the autosave', () => {
  it('stores an edit without a button press', async () => {
    edit()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    expect(state.puts).toEqual([{ period: '2026-04', booked: 1 }])
    expect(store.saveState.value).toBe('saved')
  })

  it('collapses two edits inside the interval into one write', async () => {
    edit()
    await vi.advanceTimersByTimeAsync(1000)
    edit()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    expect(state.puts).toEqual([{ period: '2026-04', booked: 2 }])
  })

  it('stores nothing when a month is only opened', async () => {
    state.sheets.set('2026-05', {
      year: 2026,
      month: 5,
      location: '01_DE_Berlin',
      halfDays: store.halfDays.value.map((half) => ({ ...half })),
      adjustedWorkDays: null,
      updatedAt: '2026-05-02T09:00:00.000Z',
      exportedAt: null,
    })

    store.openMonth(2026, 5)
    await settle()
    await vi.advanceTimersByTimeAsync(5000)
    await settle()

    expect(state.puts).toEqual([])
  })

  it('flushes the pending edit before the month changes', async () => {
    edit()
    // Well inside the interval so the write is still only pending.
    await vi.advanceTimersByTimeAsync(500)
    expect(state.puts).toEqual([])

    store.month.value = 5
    await settle()

    // The snapshot carries its own month so the edit lands on April.
    expect(state.puts).toEqual([{ period: '2026-04', booked: 1 }])

    store.month.value = 4
    await settle()
  })

  it('queues one trailing save behind the write in flight and no more', async () => {
    let release = (): void => {}
    state.gate = new Promise<void>((resolve) => {
      release = resolve
    })

    edit()
    await vi.advanceTimersByTimeAsync(3000)
    expect(state.puts).toHaveLength(1)

    edit()
    await vi.advanceTimersByTimeAsync(3000)
    edit()
    await vi.advanceTimersByTimeAsync(3000)
    // Both are behind the one in flight and the third replaced the second.
    expect(state.puts).toHaveLength(1)

    release()
    await settle()

    expect(state.puts).toEqual([
      { period: '2026-04', booked: 1 },
      { period: '2026-04', booked: 3 },
    ])
  })
})

describe('a write that fails', () => {
  it('leaves the mirror holding the edit', async () => {
    state.fail = true
    edit()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    const mirror = store.loadSheet(2026, 4)
    expect(mirror?.halfDays.filter((half) => half.days !== null)).toHaveLength(1)
  })

  it('shows the failed state and clears it on the retry', async () => {
    state.fail = true
    edit()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()
    expect(store.saveState.value).toBe('failed')

    state.fail = false
    await store.retrySave()
    await settle()

    expect(store.saveState.value).toBe('saved')
    expect(state.puts).toHaveLength(2)
  })
})

describe('the sent marker', () => {
  it('reads a month edited after its download as changed', async () => {
    const downloaded = '2026-04-30T10:00:00.000Z'
    state.exportedAt = downloaded
    state.sheets.set('2026-04', {
      year: 2026,
      month: 4,
      location: '01_DE_Berlin',
      halfDays: store.halfDays.value.map((half) => ({ ...half })),
      adjustedWorkDays: null,
      updatedAt: downloaded,
      exportedAt: downloaded,
    })

    await openApril()
    expect(store.sentState.value).toBe('sent')

    edit()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    // The marker survived the write so the month is muted and changed at once.
    expect(store.exportedAt.value).toBe(downloaded)
    expect(store.sentState.value).toBe('changed')
  })
})

describe('the export', () => {
  it('runs without saving first', async () => {
    let n = 0
    for (const day of store.calendar.value) {
      if (n >= store.target.value) break
      if (day.nonWorking) continue
      const row = store.halfDays.value.find((half) => half.date === day.date && half.half === 0)!
      row.workdayId = '24112'
      row.specification = specificationsFor('24112').options[0] ?? null
      row.days = 1
      row.location = store.profile.location
      n++
    }
    await vi.advanceTimersByTimeAsync(3000)
    await settle()
    expect(state.puts).toHaveLength(1)
    state.puts.length = 0

    const panel = mount(ExportPanel, { global: { plugins } })
    await settle()
    await panel.get('button').trigger('click')
    await settle()

    expect(state.exports).toBe(1)
    expect(state.puts).toEqual([])
  })
})
