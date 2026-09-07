import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import { readCatalogueFrom } from './index'
const out = process.env.EMIT_DIR
it.skipIf(!out)('parses the April workbook the way the browser will', () => {
  const bytes = new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../Name.Firstname_2026_04_projecttracker_nn.xlsm')))
  const parsed = readCatalogueFrom(bytes)
  writeFileSync(`${out}/upload.json`, JSON.stringify(parsed))
  console.log(`parsed ${parsed.projects.length} projects from the April workbook`)
})
