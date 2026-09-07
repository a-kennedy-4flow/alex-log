// Writes a real export to disk so a spreadsheet application can open it.
// Skipped unless EMIT_DIR is set because a test should not leave files behind.

import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { setCatalogue } from '@tracker/core'
import { loadCatalogue } from '@tracker/fixtures'
import { loadSamples } from '@tracker/fixtures/samples'

import { writeTracker } from './index'

const dir = process.env.EMIT_DIR

describe.skipIf(!dir)('emitting an artefact', () => {
  it('writes the completed sample to EMIT_DIR', async () => {
    setCatalogue(await loadCatalogue())
    const samples = await loadSamples()
    const s = samples.find((x) => x.statusMessage === 'Your project tracker is completed!')
    expect(s).toBeDefined()
    const result = writeTracker({
      firstName: s!.firstName ?? '',
      lastName: s!.lastName ?? '',
      location: s!.location ?? '',
      year: s!.year,
      month: s!.month,
      adjustedWorkDays: s!.adjustedWorkDays,
      halfDays: s!.rows.map((r) => ({
        date: r.date,
        half: ((r.row - 5) % 2) as 0 | 1,
        workdayId: r.workdayId === null ? null : String(r.workdayId),
        specification: r.specification,
        specificationIsDefault: false,
        days: r.days as 0.5 | 1 | null,
        location: r.location,
        tasks: r.tasks === null ? null : String(r.tasks),
      })),
      createdIso: '2026-09-01T00:00:00Z',
    })
    writeFileSync(`${dir}/${result.filename}`, result.bytes)
    console.log(`wrote ${dir}/${result.filename} ${result.bytes.length} bytes`)
  })
})
