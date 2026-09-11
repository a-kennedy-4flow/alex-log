// The scheduled run.
//
// Its own bundle. It lists the pool and it sends mail so it loads the Cognito
// client and the SES one. It answers no route so it carries neither the export
// nor the workbook writer.
//
// The event carries nothing because the run reads the day from the clock rather
// than from whoever invoked it.

import { CognitoDirectory } from './cognito'
import { DynamoRepository } from './dynamo'
import { AtlassianJira } from './jira'
import { KmsCipher, secretReader } from './kms'
import { hoursFields, required, tableName } from './lambda-event'
import { SesMailer } from './mail'
import { runReminders, type ReminderSummary } from './reminder'

const repository = new DynamoRepository(tableName())

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
