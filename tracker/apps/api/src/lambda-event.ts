// What every Lambda adapter needs to read an HTTP API event.
//
// The three adapters are bundled separately so nothing a function does not
// call is loaded on its cold start. This module holds only what all of them
// share. It imports no SDK client for that reason.
//
// The JWT authorizer on the route verifies the Cognito token before any adapter
// runs so the claims here are already trusted.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'

import { DEFAULT_HOURS_FIELDS } from '@tracker/core'

import type { ApiResponse, Caller } from './handlers'

/** Reads a variable the function cannot run without. */
export function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** The table every adapter writes to. Read once per container. */
export function tableName(): string {
  return required('TABLE_NAME')
}

/**
 * The Jira fields searched for an hours figure. In order.
 *
 * Configuration rather than code because which fields carry effort at 4flow is
 * still being settled. Unset falls back to the two Jira holds itself.
 */
export function hoursFields(): string[] {
  const raw = process.env.JIRA_HOURS_FIELDS ?? ''
  const named = raw.split(',').map((field) => field.trim()).filter(Boolean)
  return named.length ? named : DEFAULT_HOURS_FIELDS
}

export function callerOf(event: APIGatewayProxyEventV2WithJWTAuthorizer): Caller | null {
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

export function requestOf(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    body: event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : (event.body ?? null),
    caller: callerOf(event),
  }
}

export function resultOf(response: ApiResponse): APIGatewayProxyResultV2 {
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body,
    isBase64Encoded: response.isBase64 ?? false,
  }
}
