// The adapter for the routes under `/api/jira/`.
//
// Its own bundle. It reads the Jira secret and uses the KMS key so it loads
// those two clients. It sends no mail and it lists no users.
//
// The client id is empty on a deployment where no app is registered and every
// route then answers 404. So the stack can be deployed before the Atlassian
// side exists.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'

import { DynamoRepository } from './dynamo'
import { problem } from './handlers'
import { AtlassianJira } from './jira'
import { jiraResponse } from './jira-handlers'
import { KmsCipher, secretReader } from './kms'
import { hoursFields, required, requestOf, resultOf, tableName } from './lambda-event'

const repository = new DynamoRepository(tableName())

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
      // The Atlassian site rather than the tracker one.
      siteUrl: process.env.JIRA_SITE_URL ?? '',
    }),
  )
}
