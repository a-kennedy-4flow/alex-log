#!/usr/bin/env node
// The CDK entry point.
//
// `cdk synth` renders the template. `cdk deploy` needs credentials and an
// explicit decision.
//
// Set `SAML_METADATA_URL` once the Identity Center application exists. Until
// then the pool keeps its own sign in and the portal tile has nothing to point
// at. See `docs/identity-centre.md`.

import { App } from 'aws-cdk-lib'

import { TimesheetsStack } from '../lib/timesheets-stack'

const app = new App()

new TimesheetsStack(app, 'Timesheets', {
  env: {
    account: '517025126224',
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
  },
  cognitoDomainPrefix: process.env.COGNITO_DOMAIN_PREFIX ?? '4flow-timesheets',
  ...(process.env.SAML_METADATA_URL ? { samlMetadataUrl: process.env.SAML_METADATA_URL } : {}),
})
