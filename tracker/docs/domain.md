# Putting Tracker on a public name

The parent domain lives in another AWS account. That account publishes one
record. Everything else is ours.

The work is two deploys with a wait in between. Because ACM proves ownership
over public DNS and it cannot do that until the parent points at our zone.

The host is `tracker.4flow.io`. It is pinned in `infra/bin/app.ts`.

## 1. Build the zone

```sh
cd tracker/infra
npx cdk deploy TrackerDns --profile Admin
```

This creates the hosted zone and nothing else. No certificate is asked for yet.

Read the name servers it made.

```sh
aws cloudformation describe-stacks --profile Admin --region us-east-1 \
  --stack-name TrackerDns \
  --query "Stacks[0].Outputs[?OutputKey=='NameServers'].OutputValue" --output text
```

## 2. Ask the other account for one record

Send them this. Nothing else is needed from them ever again.

> Please add an NS record to the parent zone.
>
> Name `tracker.4flow.io`
> Type `NS`
> Value the four name servers above
>
> This delegates that one subdomain to AWS account 517025126224. It gives us no
> access to anything else in the zone. Every future certificate renewal and
> hostname under it is then ours to make without asking.

A delegation is asked for rather than a single record. Because a) a certificate
renewal needs its own record. b) each new hostname needs another. c) each one
would otherwise be a request to another team.

## 3. Check the delegation is live

```sh
dig +short NS tracker.4flow.io
```

The four name servers must come back. Do not go on until they do. A certificate
requested early leaves CloudFormation waiting for hours before it fails.

## 4. Deploy the name

```sh
cd tracker/infra
DOMAIN_DELEGATED=1 npx cdk deploy --all --profile Admin
pnpm --filter @tracker/infra deploy:site
./verify-auth.sh
```

That issues the certificate and puts the name on the distribution and adds the
alias records. The CloudFront name keeps working beside it so nothing is cut
over in one step.

The host is pinned so only `DOMAIN_DELEGATED` has to be set. Once step 3
answers, change `delegated` in `infra/bin/app.ts` to a plain `true`. A deploy
that forgets the variable would otherwise drop the certificate and take the name
with it.

## 5. All three fields on the Identity Center application

This deploy is also the rename so every field moves. Account `699987295789`
edits all three. `./verify-auth.sh` prints them.

| Field | Value |
| --- | --- |
| Application start URL | `https://tracker.4flow.io/` |
| Application ACS URL | `https://4flow-tracker.auth.eu-central-1.amazoncognito.com/saml2/idpresponse` |
| Application SAML audience | `urn:amazon:cognito:sp:` and the new pool id |

## 6. Remove the old stack

The stack is now called `Tracker`. The deploy builds it beside `Timesheets`
rather than moving it. Delete the old one once the new one serves.

```sh
aws cloudformation delete-stack --profile Admin --stack-name Timesheets
```

Its pool and table and bucket are retained so they outlive the stack. Remove
them by hand. Nothing carries over from them. No timesheet written against the
old stack is readable from the new one.

## Two names and two certificates

| Host | Serves | Certificate region |
| --- | --- | --- |
| `tracker.4flow.io` | the SPA on CloudFront | us-east-1 |
| `api.tracker.4flow.io` | the HTTP API | eu-central-1 |

Two are needed rather than one. Because a) CloudFront reads a certificate only
from us-east-1. b) an HTTP API is regional so it reads one only from its own
region. c) no single certificate satisfies both.

The execute-api name and the CloudFront name both keep working beside the new
ones. Nothing is cut over in one step.

## What this leaves alone

The API paths still begin `/api` so a call reads
`https://api.tracker.4flow.io/api/catalogue`. The host says it twice. Dropping
the prefix touches every route and every call in the SPA so it is left.

The browser still makes a cross origin request because the API is on another
host. CORS is configured for it and the preflight is checked by
`./verify-auth.sh`.
