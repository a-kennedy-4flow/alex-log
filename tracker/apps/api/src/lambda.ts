// The Lambda adapters.
//
// `main` answers the HTTP API. `reminder` is invoked by the schedule. `jira`
// answers the routes under `/api/jira/`. One artefact carries all three so the
// bundle is built once. Each is deployed as its own function so no role gains a
// permission its own work does not need. The API role may not send mail. The
// API role may not read the Jira secret or use the KMS key either.
//
// The JWT authorizer on the route verifies the Cognito token before `main` or
// `jira` runs so the claims there are already trusted.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'

import { DEFAULT_HOURS_FIELDS } from '@tracker/core'

import { CognitoDirectory } from './cognito'
import { handle, problem, type ApiResponse, type Caller } from './handlers'
import { DynamoRepository } from './dynamo'
import { AtlassianJira } from './jira'
import { jiraResponse } from './jira-handlers'
import { KmsCipher, secretReader } from './kms'
import { SesMailer } from './mail'
import { runReminders, type ReminderSummary } from './reminder'

const table = process.env.TABLE_NAME
if (!table) throw new Error('TABLE_NAME is not set')

const repository = new DynamoRepository(table)
const deps = { repository, now: () => new Date() }

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/**
 * The Jira fields searched for an hours figure. In order.
 *
 * Configuration rather than code because which fields carry effort at 4flow is
 * still being settled. Unset falls back to the two Jira holds itself.
 */
function hoursFields(): string[] {
  const raw = process.env.JIRA_HOURS_FIELDS ?? ''
  const named = raw.split(',').map((field) => field.trim()).filter(Boolean)
  return named.length ? named : DEFAULT_HOURS_FIELDS
}

function callerOf(event: APIGatewayProxyEventV2WithJWTAuthorizer): Caller | null {
  const claims = event.requestContext.authorizer?.jwt?.claims
  const sub = claims?.sub
  if (typeof sub !== 'string' || sub === '') return null

  // Cognito sends the groups as a JSON array or as a bracketed string.
  const raw = claims['cognito:groups']
  const groups = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean)
      : []

  return {
    sub,
    email: String(claims.email ?? ''),
    firstName: String(claims.given_name ?? ''),
    lastName: String(claims.family_name ?? ''),
    groups,
  }
}

function requestOf(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    body: event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : (event.body ?? null),
    caller: callerOf(event),
  }
}

function resultOf(response: ApiResponse): APIGatewayProxyResultV2 {
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body,
    isBase64Encoded: response.isBase64 ?? false,
  }
}

export async function main(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  return resultOf(await handle(requestOf(event), deps))
}

/**
 * The Jira routes.
 *
 * The client id is empty on a deployment where no app is registered and every
 * route then answers 404. So the stack can be deployed before the Atlassian
 * side exists.
 */
export async function jira(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const clientId = process.env.JIRA_CLIENT_ID ?? ''
  // Answered before the clients are built. Reading the secret ARN of an
  // unconfigured deployment would throw where a 404 is wanted.
  if (clientId === '') return resultOf(problem(404, 'no such route'))
  return resultOf(
    await jiraResponse(requestOf(event), {
      repository,
      jira: new AtlassianJira(
        clientId,
        secretReader(required('JIRA_SECRET_ARN')),
        required('JIRA_CLOUD_ID'),
        fetch,
        hoursFields(),
      ),
      cipher: new KmsCipher(required('JIRA_KEY_ARN')),
      now: () => new Date(),
      clientId,
      redirectUri: `${required('SITE_URL').replace(/\/$/, '')}/jira/callback`,
    }),
  )
}

/**
 * The scheduled run. The event carries nothing because the run reads the day
 * from the clock rather than from whoever invoked it.
 */
export async function reminder(): Promise<ReminderSummary> {
  // The Jira clients are built only where the app is configured. This is the
  // cost of putting the ticket count in the mail. Two roles then hold the
  // client secret rather than one. See `docs/jira.md`.
  const clientId = process.env.JIRA_CLIENT_ID ?? ''
  const jira =
    clientId === ''
      ? undefined
      : {
          repository,
          jira: new AtlassianJira(
            clientId,
            secretReader(required('JIRA_SECRET_ARN')),
            required('JIRA_CLOUD_ID'),
            fetch,
            hoursFields(),
          ),
          cipher: new KmsCipher(required('JIRA_KEY_ARN')),
          now: () => new Date(),
        }

  const summary = await runReminders({
    repository,
    mailer: new SesMailer(required('MAIL_FROM'), process.env.MAIL_CONFIGURATION_SET),
    directory: new CognitoDirectory(required('USER_POOL_ID')),
    now: () => new Date(),
    timeZone: required('REMINDER_TIME_ZONE'),
    url: required('SITE_URL'),
    ...(jira ? { jira } : {}),
  })
  console.log('reminders', JSON.stringify(summary))
  return summary
}
