// The backoffice upload end to end from a workbook in this repository.
//
// Every other API test seeds from the fixtures. The fixtures are already mapped
// so they cannot catch a mapping the upload leaves out. This sends what the
// admin page sends and then asks the picker for a cost centre.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { catalogue as live, findProject, setCatalogue, type CatalogueInput } from '@tracker/core'
import { readCatalogueFrom, toCatalogueInput } from '@tracker/workbook-reader'

import { createDevServer, DEV_HEADERS } from '../dev-server'
import { MemoryRepository } from '../repository'
import { resetCatalogueCache } from '../handlers'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const workbooks = readdirSync(root).filter((f) => f.endsWith('.xlsm'))

let server: Server
let base: string

const BACKOFFICE: Record<string, string> = {
  origin: 'http://localhost:5173',
  'content-type': 'application/json',
  [DEV_HEADERS.sub]: 'backoffice',
  [DEV_HEADERS.email]: 'backoffice@4flow.com',
  [DEV_HEADERS.firstName]: 'Alexander',
  [DEV_HEADERS.lastName]: 'Kennedy',
  [DEV_HEADERS.groups]: 'backoffice',
}

beforeAll(async () => {
  server = createDevServer({ repository: new MemoryRepository(), now: () => new Date() })
  // Port zero lets the operating system pick so the test never fights the
  // server a developer already has running.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

it('found the workbooks to upload', () => {
  expect(workbooks.length).toBeGreaterThan(0)
})

describe.each(workbooks)('%s', (name) => {
  it('reaches the picker through the upload route', async () => {
    resetCatalogueCache()
    const parsed = readCatalogueFrom(new Uint8Array(readFileSync(join(root, name))))
    const upload = toCatalogueInput(parsed, name)

    const put = await fetch(`${base}/api/admin/catalogue`, {
      method: 'PUT',
      headers: BACKOFFICE,
      body: JSON.stringify(upload),
    })
    expect(put.status).toBe(200)

    const offered = new Set([
      ...parsed.absenceTypes.map((absence) => absence.label),
      ...parsed.projects.map((project) => String(project.workdayId)),
    ])
    expect(((await put.json()) as { projects: number }).projects).toBe(offered.size)

    const response = await fetch(`${base}/api/catalogue`, { headers: BACKOFFICE })
    expect(response.status).toBe(200)
    const stored = (await response.json()) as CatalogueInput

    expect(stored.source?.workbook).toBe(name)
    // The page used to send the formula beside the name so the store held an
    // object where the type says string.
    for (const range of stored.brokenSpecRanges ?? []) {
      expect(typeof range, JSON.stringify(range)).toBe('string')
    }

    setCatalogue(stored)
    expect(live.projects).toHaveLength(offered.size)
    expect(live.locations).toHaveLength(22)
    const first = parsed.projects[0]
    expect(first).toBeDefined()
    expect(findProject(String(first?.workdayId))).not.toBeNull()
    expect(findProject('Vacation or sickness')).not.toBeNull()
  })
})
