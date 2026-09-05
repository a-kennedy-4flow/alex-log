// The development server.
//
// It keeps everything in memory and seeds the catalogue from the fixtures so
// the frontend can work against a real HTTP surface without an AWS account.
//
// The HTTP surface itself lives in `dev-server.ts` so a test can start one
// without seeding fixtures or binding this port. There is no token check. The
// caller is taken from headers so a developer can act as another user or join
// the backoffice group. That is why this refuses to start in production.

// vite-node runs this module again on every edit inside the same process. The
// previous listener therefore has to be closed by hand or the new one fails
// with EADDRINUSE and the old code keeps serving, which reads as the edit never
// having been made. A handle on globalThis is what survives the re-execution.
declare global {
  // eslint-disable-next-line no-var
  var __timesheetsDevServer: import('node:http').Server | undefined
}

import { MemoryRepository } from './repository'
import { createDevServer } from './dev-server'

const PORT = Number(process.env.PORT ?? 8787)

if (process.env.NODE_ENV === 'production') {
  throw new Error('the local server has no authentication and must not run in production')
}

const repository = new MemoryRepository()
const server = createDevServer({ repository, now: () => new Date() })

// The fixtures stand in for a backoffice upload.
const { loadCatalogue } = await import('@timesheets/fixtures')
const data = await loadCatalogue()
const updatedAt = new Date().toISOString()
await repository.putCatalogue({ version: updatedAt, updatedAt, data })

globalThis.__timesheetsDevServer?.close()
globalThis.__timesheetsDevServer = server

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use. Stop the other server first.`)
    process.exit(1)
  }
  throw error
})

server.listen(PORT, () => {
  console.log(`api        http://localhost:${PORT}`)
  console.log(`catalogue  ${data.projects.length} projects seeded from the fixtures`)
  console.log(`caller     set x-dev-sub to change user and x-dev-groups=backoffice for admin`)
})
