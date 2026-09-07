// The HTTP surface of the development server.
//
// Kept apart from `local.ts` so a test can start one on its own port without
// seeding fixtures or binding 8787. `local.ts` is the entry point that does
// both and listens.
//
// There is no token check here. The caller comes from headers so a developer
// can act as another user or join the backoffice group. `local.ts` is what
// refuses to run outside development.

import { createServer, type Server } from 'node:http'

import { handle, type Caller, type Deps } from './handlers'
import { jiraResponse, type JiraDeps } from './jira-handlers'

/** The headers that stand in for a token. */
export const DEV_HEADERS = {
  sub: 'x-dev-sub',
  email: 'x-dev-email',
  firstName: 'x-dev-first-name',
  lastName: 'x-dev-last-name',
  groups: 'x-dev-groups',
} as const

export function callerOf(headers: Record<string, string | string[] | undefined>): Caller {
  const header = (name: string, fallback: string): string => {
    const value = headers[name]
    const text = Array.isArray(value) ? value[0] : value
    return text && text !== '' ? text : fallback
  }
  return {
    sub: header(DEV_HEADERS.sub, 'dev-user'),
    email: header(DEV_HEADERS.email, 'name.firstname@4flow.com'),
    firstName: header(DEV_HEADERS.firstName, 'Firstname'),
    lastName: header(DEV_HEADERS.lastName, 'Name'),
    // No group by default. Send `x-dev-groups: backoffice` to act as backoffice.
    groups: header(DEV_HEADERS.groups, '').split(',').filter(Boolean),
  }
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * @param jira Absent leaves every `/api/jira/` route answering 404. That is
 *   how the deployed function behaves with no app registered.
 */
export function createDevServer(deps: Deps, jira?: JiraDeps): Server {
  return createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      void (async () => {
        const cors = {
          'access-control-allow-origin': req.headers.origin ?? '*',
          // Whatever the browser asks for is allowed. A fixed list drifts the
          // moment the client sends one more header and the failure then reads
          // as a CORS fault rather than as the missing entry it is.
          'access-control-allow-headers':
            firstValue(req.headers['access-control-request-headers']) ?? 'content-type',
          'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
          // The browser cannot read the file name without this.
          'access-control-expose-headers': 'content-disposition',
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, cors)
          res.end()
          return
        }

        const path = (req.url ?? '/').split('?')[0] ?? '/'
        const request = {
          method: req.method ?? 'GET',
          path,
          body: chunks.length ? Buffer.concat(chunks).toString('utf8') : null,
          caller: callerOf(req.headers),
        }
        // API Gateway routes `/api/jira/{proxy+}` to a function of its own so
        // the split is reproduced here rather than merged into one handler.
        const response =
          path.startsWith('/api/jira/') && jira
            ? await jiraResponse(request, jira)
            : await handle(request, deps)

        res.writeHead(response.status, { ...cors, ...response.headers })
        res.end(response.isBase64 ? Buffer.from(response.body, 'base64') : response.body)
      })().catch((error: unknown) => {
        console.error(error)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'the server failed' }))
      })
    })
  })
}
