# What Tracker is allowed to spend

Two budgets and a set of tags. They live in `TrackerCost` which is a stack of
its own so that a rebuild of the application does not take the alerting with it.

## Deploy

```sh
cd tracker/infra
npx cdk deploy TrackerCost --profile Admin
```

Everything is pinned in `infra/bin/app.ts`. Forty euro a month. Alerts to
`a.kennedy@4flow.com`. Override any of it with `BUDGET_ALERT_EMAIL` or
`BUDGET_LIMIT` or `BUDGET_CURRENCY` for a one off.

The currency must be the one the account is billed in. A budget carrying any
other currency is refused when it is created so a mistake here fails the deploy
rather than comparing the wrong number for a month.

Confirm the first alert arrives. An address is not verified when the budget is
made so a typo is silent until the day it should have warned.

## What it creates

| Budget | Ceiling | Warns at |
| --- | --- | --- |
| Tracker monthly | 40 USD | actual 50% then actual 100% then forecast 100% |
| Tracker daily | 4 USD | actual 100% |

The monthly one is the ceiling. The daily one exists because a monthly ceiling
is breached only once and says nothing until it is. A rise that starts on the
third of the month is visible the next day on the daily one.

Forty euro is roughly ten times what this workload should cost while it carries
one department. The first warning at twenty euro is therefore already a signal
that something is wrong rather than a sign of growth.

## Scope

The budget covers the whole account. No tag filter. Because a) account
`517025126224` runs this application and nothing else. b) a tag filter needs
that tag activated for cost allocation in the management account. c) activation
is not backdated so the month it is turned on reports nothing.

Every resource is still tagged `Project=Tracker` and `ManagedBy=cdk`. The tags
cost nothing and they are what makes a split possible later if the account stops
being ours alone.

## A budget does not cap anything

It sends mail. It stops no resource and it refuses no request. Capping needs a
budget action with a role that can detach a policy or stop an instance. That is
not set up and for a serverless application of this size it would do more harm
than the spend it prevents.

## What actually costs money here

| Item | Shape |
| --- | --- |
| Route 53 hosted zone | a fixed monthly charge per zone |
| CloudFront | per request and per byte out |
| API Gateway HTTP API | per million requests |
| Lambda | per request and per millisecond |
| DynamoDB on demand | per read and per write and per byte stored |
| S3 | per byte stored and per request |
| Cognito | per monthly active user above the free allowance |
| ACM | nothing |
| Secrets Manager | a fixed monthly charge per secret |
| KMS | a fixed monthly charge per customer managed key |

Three charges arrive whether or not anybody signs in. The hosted zone. The one
secret holding the Jira client secret at about forty cents a month. The one key
that encrypts a Jira refresh token at about a dollar a month. Everything else
follows use.

The Jira function itself rounds to nothing. It runs when somebody opens the
Jira screen and once more for each user the reminder names. See
`docs/jira.md`.

## One thing to confirm first

A member account can only budget its own spend if the management account lets it
see its own billing data. Check before trusting the alerts.

```sh
aws ce get-cost-and-usage --profile Admin --region us-east-1 \
  --time-period Start=2026-08-01,End=2026-09-06 --granularity MONTHLY \
  --metrics UnblendedCost
```

A figure means the budget works here. An `AccessDenied` means the budget has to
be created in account `699987295789` instead with a cost filter naming this
account. That is a third thing to ask them for so it is worth checking before
asking.
