// The API Gateway HTTP API adapter.
//
// The JWT authorizer on the route verifies the Cognito token before the
// function runs so the claims here are already trusted.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'

import { handle, type Caller } from './handlers'
import { DynamoRepository } from './dynamo'

const table = process.env.TABLE_NAME
if (!table) throw new Error('TABLE_NAME is not set')

const deps = { repository: new DynamoRepository(table), now: () => new Date() }

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

export async function main(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const response = await handle(
    {
      method: event.requestContext.http.method,
      path: event.rawPath,
      body: event.isBase64Encoded && event.body
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : (event.body ?? null),
      caller: callerOf(event),
    },
    deps,
  )

  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body,
    isBase64Encoded: response.isBase64 ?? false,
  }
}
