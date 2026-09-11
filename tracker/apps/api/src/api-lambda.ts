// The HTTP API adapter.
//
// Its own bundle so a cold start loads neither the Atlassian client nor the
// directory. Because a) the runtime resolves an SDK client the moment the
// module names it. b) an unused client costs tens of milliseconds of every cold
// start. c) this function calls DynamoDB on almost every route.
//
// The mailer is the exception. The delivery route sends the workbook to the
// user who asked for it so this function does send mail. Its SES client is
// resolved on the first send rather than on the first line. See `mail.ts`.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'

import { DynamoRepository } from './dynamo'
import { handle } from './handlers'
import { requestOf, resultOf, tableName } from './lambda-event'
import { SesMailer } from './mail'

const repository = new DynamoRepository(tableName())

// Unset until the domain is delegated because SES has no identity to send from
// before then. The delivery route answers 503 and every other route is
// untouched. See `docs/mail.md`.
const mailFrom = process.env.MAIL_FROM
const deps = {
  repository,
  now: () => new Date(),
  ...(mailFrom
    ? { mailer: new SesMailer(mailFrom, process.env.MAIL_CONFIGURATION_SET) }
    : {}),
}

export async function main(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  return resultOf(await handle(requestOf(event), deps))
}
