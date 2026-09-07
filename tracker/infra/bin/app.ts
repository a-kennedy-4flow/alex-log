#!/usr/bin/env node
// The CDK entry point.
//
// `cdk synth` renders the template. `cdk deploy` needs credentials and an
// explicit decision.
//
// The Identity Center metadata is pinned rather than read from the environment.
// Because a) a deploy that forgets the variable deletes the provider and takes
// sign in with it. b) the document is public so it is not a secret. c) it names
// the application and moves only if that application is rebuilt.
//
// See `docs/identity-centre.md`.

import { App } from 'aws-cdk-lib'

import { Tags } from 'aws-cdk-lib'

import { CostStack } from '../lib/cost-stack'
import { DnsStack } from '../lib/dns-stack'
import { TrackerStack } from '../lib/tracker-stack'

const app = new App()

const ACCOUNT = '517025126224'
const REGION = 'eu-central-1'

// The public name arrives in two steps because the second one depends on
// another account. The zone is built first and its name servers are handed to
// whoever holds `4flow.io`. The certificate is asked for only once they have
// published them. See `docs/domain.md`.
//
// The host is pinned for the same reason the metadata URL is. A deploy that
// forgot it would take the name off the distribution.
const domainName = process.env.DOMAIN_NAME ?? 'tracker.4flow.io'

// Set `DOMAIN_DELEGATED=1` to pass step 4. Once `dig +short NS tracker.4flow.io`
// answers, replace this line with `const delegated = true` so that a later
// deploy cannot drop the certificate and the name with it.
const delegated = true;

const dns = domainName
  ? new DnsStack(app, 'TrackerDns', {
      // Pinned to us-east-1 because CloudFront reads a certificate from nowhere
      // else. The zone is global so it is unaffected.
      env: { account: ACCOUNT, region: 'us-east-1' },
      crossRegionReferences: true,
      domainName,
      delegated,
    })
  : undefined

// The id is the CloudFormation stack name. Renaming it builds a second stack
// beside the first rather than moving it. That is the intent here. The old
// `Timesheets` stack is deleted once this one serves.
//
// Nothing carries over. A new stack means a new pool and a new table and a new
// distribution. The pool and the table and the bucket of the old stack are
// retained so they outlive it and have to be removed by hand.
new TrackerStack(app, 'Tracker', {
  // Both are pinned. Because a) the CDK CLI sets `CDK_DEFAULT_REGION` from
  // whichever profile it resolved so a synth without `--profile` silently built
  // a us-east-1 template. b) the ACS URL handed to the Identity Center
  // administrator is built from the region. c) a wrong one there fails at sign
  // in with no message naming the region.
  env: { account: ACCOUNT, region: REGION },
  // The certificate is read out of the us-east-1 stack above.
  crossRegionReferences: true,
  // Renamed with the project. A prefix is unique per region so the old stack
  // must have released `4flow-timesheets` before it could be reused anyway.
  cognitoDomainPrefix: process.env.COGNITO_DOMAIN_PREFIX ?? '4flow-tracker',
  // Only once the certificate exists. Until then the site keeps its CloudFront
  // name and nothing about sign in moves.
  ...(dns?.certificate && domainName
    ? { domain: { name: domainName, zone: dns.zone, certificate: dns.certificate } }
    : {}),
  // Behind a guard unlike everything else here. Because a) a forgotten variable
  // drops the localhost callback rather than adding one. b) that is the safe
  // direction. c) the local workflow in the readme never signs in to this pool.
  ...(process.env.ALLOW_LOCAL_ORIGIN === '1' ? { allowLocalOrigin: true } : {}),
  // Not behind a guard. A deploy that forgets the variable must still keep the
  // provider.
  samlMetadataUrl:
    process.env.SAML_METADATA_URL ??
    'https://portal.sso.eu-central-1.amazonaws.com/saml/metadata/Njk5OTg3Mjk1Nzg5X2lucy02OTg3NTU1MjM1YjQwMDQz',
  ...(process.env.SAML_METADATA_FILE ? { samlMetadataFile: process.env.SAML_METADATA_FILE } : {}),
})


// The spend alert. Pinned like everything else that a forgotten variable would
// quietly switch off.
//
// The currency is the one the account is billed in. A budget carrying any other
// currency is refused when it is created rather than compared wrongly.
new CostStack(app, 'TrackerCost', {
  // Budgets is a global service. us-east-1 is where it is conventionally
  // declared and the stack holds nothing regional.
  env: { account: ACCOUNT, region: 'us-east-1' },
  alertEmail: process.env.BUDGET_ALERT_EMAIL ?? 'a.kennedy@4flow.com',
  monthlyLimit: Number(process.env.BUDGET_LIMIT ?? 40),
  currency: process.env.BUDGET_CURRENCY ?? 'USD',
})

// Applied to every resource in every stack. A tag costs nothing and it is the
// only way to split this application out later if the account stops being its
// own. A tag has to be activated for cost allocation in the management account
// before it can filter a report and activation is not backdated.
Tags.of(app).add('Project', 'Tracker')
Tags.of(app).add('ManagedBy', 'cdk')
