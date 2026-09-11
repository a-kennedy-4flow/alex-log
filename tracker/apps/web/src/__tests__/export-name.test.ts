// The name the download lands under.
//
// The API names the workbook in `content-disposition` and the panel names the
// same workbook on the screen before the call. A browser hides that header on a
// cross origin response the API does not expose it on. So the client is handed
// the name the panel shows and falls back to it. These tests hold the fallback
// to that name because the period alone was what it used to be and the period
// is not a name anyone can file.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

const SHOWN = 'Kennedy.Alexander_2026_08_projecttracker_DE.xlsm'

/** Answers the export call with whatever headers the test wants on it. */
function respondWith(headers: Record<string, string>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(new Blob(['workbook']), { status: 200, headers })),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the exported file name', () => {
  it('takes the name the API sets', async () => {
    respondWith({ 'content-disposition': `attachment; filename="${SHOWN}"` })
    const file = await api.export('2026-08', 'ignored.xlsm')
    expect(file.filename).toBe(SHOWN)
  })

  it('falls back to the name the panel shows when the header is hidden', async () => {
    respondWith({})
    const file = await api.export('2026-08', SHOWN)
    expect(file.filename).toBe(SHOWN)
  })
})
