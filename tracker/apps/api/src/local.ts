// The development server.
//
// It keeps everything in memory and seeds the catalogue from the fixtures so
// the frontend can work against a real HTTP surface without an AWS account.
//
// The HTTP surface itself lives in `dev-server.ts` so a test can start one
// without seeding fixtures or binding this port. There is no token check. The
// caller is taken from headers so a developer can act as another user or join
// the backoffice group. That is why this refuses to start in production.
//
// Jira is the double unless a client secret says otherwise. `jiraOf` below
// holds that decision and the switch that reads the month of another Atlassian
// account. Neither exists anywhere a deployment can reach.

// vite-node runs this module again on every edit inside the same process. The
// previous listener therefore has to be closed by hand or the new one fails
// with EADDRINUSE and the old code keeps serving, which reads as the edit never
// having been made. A handle on globalThis is what survives the re-execution.
declare global {
  var __timesheetsDevServer: import('node:http').Server | undefined
}

import { MemoryRepository } from './repository'
import { createDevServer } from './dev-server'
import { ConsoleMailer } from './mail'
import { DEFAULT_HOURS_FIELDS, DEV_JIRA_AS_USER, DEV_JIRA_CLIENT_ID } from '@tracker/core'

import { AtlassianJira, type Jira } from './jira'
import { jiraPerRequest } from './jira-dev'
import { FakeJira, PlainCipher } from './jira-fake'

const PORT = Number(process.env.PORT ?? 8787)

if (process.env.NODE_ENV === 'production') {
  throw new Error('the local server has no authentication and must not run in production')
}

/**
 * A variable the real client cannot start without.
 *
 * The three lines are `lambda.ts` again rather than an import of it. Importing
 * that module here would build the Dynamo client and the KMS client and read
 * the table name none of which this server has.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/**
 * The client secret out of whatever the environment holds.
 *
 * The secret is filled by hand so `tracker/jira` holds either the bare value or
 * a JSON object with the console field name in it. Both are accepted here for
 * the reason `secretReader` in `kms.ts` accepts both. Because the command that
 * reads it prints what is stored and a JSON object handed over as a secret is
 * refused by Atlassian with `access_denied` which the screen then blames on the
 * consent.
 *
 * The four lines are not shared with `kms.ts`. Importing that module would load
 * the AWS SDK into a server that reaches no AWS account.
 */
function clientSecret(raw: string): string {
  if (raw === '') return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed.clientSecret ?? parsed.client_secret ?? raw
  } catch {
    return raw
  }
}

/**
 * The Jira this server answers with.
 *
 * `FakeJira` unless a client secret is in the environment. With one the real
 * client answers instead so the consent screen and the search and the worklogs
 * are the real ones. `http://localhost:5173/jira/callback` is already a
 * registered callback on the app so Atlassian needs no change to allow it.
 *
 * `JIRA_AS_USER` names the account whose month is read rather than the account
 * of whoever linked. The switch is here and nowhere else. Because a)
 * `build.mjs` bundles from `lambda.ts` and nothing there reaches this file so
 * no deployment can carry it. b) this file already refuses to run in
 * production. c) the account that developed the feature holds no worklog and
 * no cost centre so the hours path cannot be seen without borrowing an account
 * that does.
 *
 * `clientFor` is the same switch per account so a header can name one without
 * this server restarting. The browser holds a field for it. `jira-dev.ts` reads
 * that header and this file never sees it.
 *
 * It is not impersonation. The search carries the token of whoever consented on
 * this machine so it returns what that person may already browse.
 *
 * The secret is read from the environment rather than from Secrets Manager and
 * the refresh token is kept in memory unencrypted. Both are why this is the
 * local server alone. `docs/jira.md` holds the command.
 */
function jiraOf(): {
  jira: Jira
  clientId: string
  mode: string
  /** Null where the double is answering. It reads one account and no other. */
  clientFor: ((account: string) => Jira) | null
} {
  const secret = clientSecret(process.env.JIRA_CLIENT_SECRET ?? '')
  const asUser = process.env.JIRA_AS_USER ?? ''
  // The double serves one fixed month of one fixed account. So a switch with
  // no real client behind it would answer as though the account it names looked
  // like that and the test would prove nothing.
  if (asUser !== '' && secret === '') {
    throw new Error('JIRA_AS_USER needs JIRA_CLIENT_SECRET. The double serves one fixed month.')
  }
  if (secret === '') {
    // The double returns the seven real August tickets with no hours on any of
    // them. That is what a linked user actually sees. See `jira-fake.ts`.
    return {
      jira: new FakeJira(),
      clientId: DEV_JIRA_CLIENT_ID,
      mode: 'the double. Seven August tickets and no hours',
      clientFor: null,
    }
  }
  const clientId = required('JIRA_CLIENT_ID')
  const cloudId = required('JIRA_CLOUD_ID')
  const named = (process.env.JIRA_HOURS_FIELDS ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
  const clientFor = (account: string | null): Jira =>
    new AtlassianJira(
      clientId,
      async () => secret,
      cloudId,
      fetch,
      named.length ? named : DEFAULT_HOURS_FIELDS,
      account,
    )
  return {
    jira: clientFor(asUser === '' ? null : asUser),
    clientId,
    mode: asUser === '' ? '4flow.atlassian.net as whoever consents' : `4flow.atlassian.net as ${asUser}`,
    clientFor,
  }
}

const repository = new MemoryRepository()
const now = () => new Date()
const atlassian = jiraOf()
// Nothing is sent from here. The console names what a deployment would send so
// the delivery button is testable with no AWS account.
const server = createDevServer(
  { repository, now, mailer: new ConsoleMailer() },
  jiraPerRequest(
    {
      repository,
      jira: atlassian.jira,
      cipher: new PlainCipher(),
      now,
      clientId: atlassian.clientId,
      redirectUri: 'http://localhost:5173/jira/callback',
      // The double answers the real August tickets of the real site so both
      // modes browse to the same host.
      siteUrl: process.env.JIRA_SITE_URL ?? 'https://4flow.atlassian.net',
    },
    atlassian.clientFor,
  ),
)

// The fixtures stand in for a backoffice upload.
const { loadCatalogue } = await import('@tracker/fixtures')
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
  console.log(`mail       printed here rather than sent. Set x-dev-email to change the address`)
  // The link lives in memory so every edit this server reloads on drops it and
  // the consent has to be given again.
  console.log(`jira       ${atlassian.mode}`)
  // The browser sends it from a field on the Jira screen. Curl may send it too.
  if (atlassian.clientFor) {
    console.log(`jira user  set ${DEV_JIRA_AS_USER} to read the month of another account`)
  }
})
