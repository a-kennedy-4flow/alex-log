# Timesheets on the Identity Center portal

Sign in runs through the 4flow access portal. Cognito is the service provider.
Identity Center is the identity provider. The protocol is SAML 2.0. Nobody types
a password into this app.

## Terms

Three words below could be read more than one way. They are defined here once
for the whole project.

**Assertion.** The signed statement Identity Center makes about the person who
signed in.

**ACS URL.** The address an assertion is posted to. It belongs to Cognito.

**Audience.** The name Cognito answers to inside an assertion. Identity Center
writes it. Cognito refuses any assertion that names something else.

## Why SAML rather than OAuth 2.0

The app already speaks OAuth 2.0. The browser gets its token from Cognito over
the authorization code grant with PKCE. That leg is OIDC throughout. Only the
leg between Cognito and Identity Center is SAML.

Identity Center offers an OAuth 2.0 application type. It does not sign anybody
in. Setting one up asks for a trusted token issuer which the AWS documentation
defines as "an OAuth 2.0 authorization server that creates signed tokens". So
the OAuth 2.0 type presumes the application already has an authorization server.
That server is Cognito. The type then adds one further ability. The app may
exchange its token for an Identity Center token to read data in an AWS service
as the signed in person. The scopes it offers say the same thing. They name
Redshift and DataZone and Verified Access. None of them name a person.

Identity Center is therefore a SAML identity provider to an application and an
OAuth 2.0 token exchange for AWS services. It is not an OIDC provider that a
third party application may sign a user in against. The documented grant flows
are "only available through AWS managed applications that support the flows".

Choosing OAuth 2.0 here would mean building the same Cognito federation anyway
then adding a token exchange nothing in this app needs. Because a) timesheets
reads DynamoDB through its own Lambda rather than through an AWS service that
propagates identity. b) the tile on the portal behaves the same either way. c)
the SAML application is four fields.

## Who does what

The Identity Center instance is `ssoins-6987c88f50b5768a`. Account
`699987295789` owns it. The timesheets account `517025126224` may read the
identity store. It may not create an application on the instance. So one person
holding Identity Center administrator rights performs step 2. Every other step
is done from the timesheets account.

## 1. The values the administrator needs

Read them from the stack rather than from this page. Because a) the pool
identifier changes if the pool is ever replaced. b) a copied value that has gone
stale fails with a message that names neither side. c) the stack is the only
record that cannot drift.

```sh
aws cloudformation describe-stacks --profile Admin --stack-name Tracker \
  --query 'Stacks[0].Outputs[?OutputKey==`SamlAcsUrl`||OutputKey==`SamlEntityId`||OutputKey==`SiteUrl`]' \
  --output table
```

The stack was deleted and rebuilt on 2026-09-05. It was then renamed to
`Tracker` and moved to `tracker.4flow.io`. An application configured before that
must have all three of its fields corrected. `docs/domain.md` covers the move.

| Field in Identity Center | Value | Changed |
| --- | --- | --- |
| Application ACS URL | `https://4flow-tracker.auth.eu-central-1.amazoncognito.com/saml2/idpresponse` | yes |
| Application SAML audience | read `SamlEntityId` after the deploy | yes |
| Application start URL | read `SiteUrl` after the deploy | yes |
| Relay state | leave empty | no |
| Session duration | leave at the default | no |

The audience is `urn:amazon:cognito:sp:` followed by the identifier of the pool.
The start URL is the domain name of the distribution. Neither exists until the
deploy has run so both are read from the stack rather than written here. The ACS
URL survived because the domain prefix was reclaimed.

## 2. What the administrator creates

`identity-centre-request.md` holds those steps on one page. Send that page. It is
written to be read by somebody who has never seen this project.

## 3. Wiring the metadata in

From `timesheets/infra` with the metadata in hand.

```sh
export SAML_METADATA_URL='https://portal.sso.eu-central-1.amazonaws.com/saml/metadata/Njk5OTg3Mjk1Nzg5X2lucy02OTg3NTU1MjM1YjQwMDQz'
npx cdk deploy --profile Admin
pnpm --filter @tracker/infra deploy:site
```

The URL is repeated at the foot of this page along with what reading it proved.

Use `SAML_METADATA_FILE=<path>` instead when only the downloaded document
exists.

The second command rebuilds the SPA against the deployed stack. It must run
after every `cdk deploy` that changes the pool. Because the client identifier is
compiled into the bundle.

Until the metadata exists the pool keeps its own sign in. That deployment is
usable. It is not the portal.

## 4. The backoffice role

Identity Center cannot carry a group in an assertion for a customer managed
application. The attribute list it offers holds no group value. So the group
lives in Cognito instead. Assignment in Identity Center decides who reaches the
app at all. The Cognito group decides who may replace the project list.

The person signs in once. That creates their profile in the pool. Then grant it.

Take the pool from the stack rather than from a note. Because a) the pool is
recreated whenever its schema changes. b) a retained pool from an earlier deploy
answers to the same commands and grants nothing anyone signs into. c) the id is
already published as an output and `verify-auth.sh` reads the same one.

```sh
POOL=$(aws cloudformation describe-stacks --profile Admin --region eu-central-1 \
  --stack-name Tracker --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

aws cognito-idp list-users --profile Admin --user-pool-id $POOL \
  --filter 'email = "projecttracker@4flow.com"' --query 'Users[].Username' --output text

aws cognito-idp admin-add-user-to-group --profile Admin --user-pool-id $POOL \
  --username '<the username from above>' --group-name backoffice
```

Check it took.

```sh
aws cognito-idp admin-list-groups-for-user --profile Admin --user-pool-id $POOL \
  --username '<the username>' --query 'Groups[].GroupName' --output text
```

The group reaches the app on the next sign in. Because the group is read from
the token and the token was issued before the grant.

## 5. Checking it works

1. Open the portal at `https://4flow.awsapps.com/start`.
2. The Timesheets tile appears for an assigned person only.
3. The tile opens the site. The site redirects through Cognito to Identity
   Center. The portal session is already live so nothing is asked. The month
   view renders.
4. The header shows the name from the directory rather than a sample name.
5. `Cost centres` appears in the navigation for a member of the backoffice
   group alone.

## What is deliberately not done

IdP initiated sign in is off. The portal tile opens the app rather than posting
an assertion at it. Because a) Cognito cannot tell a solicited assertion from a
forged one. b) turning it on forbids every non SAML provider on the client for
good. c) the tile reaches the same place with the guard left in place.

No refresh token is written to browser storage. A reload redirects instead. The
portal session makes that redirect invisible.


# What the administrator returned

The application exists as of 2026-09-05. Only the first of the four is needed.
Cognito reads the other three out of it.

| Name in the console | Value |
| --- | --- |
| SAML metadata file | `https://portal.sso.eu-central-1.amazonaws.com/saml/metadata/Njk5OTg3Mjk1Nzg5X2lucy02OTg3NTU1MjM1YjQwMDQz` |
| Sign-in URL | `https://portal.sso.eu-central-1.amazonaws.com/saml/assertion/Njk5OTg3Mjk1Nzg5X2lucy02OTg3NTU1MjM1YjQwMDQz` |
| Sign-out URL | `https://portal.sso.eu-central-1.amazonaws.com/saml/logout/Njk5OTg3Mjk1Nzg5X2lucy02OTg3NTU1MjM1YjQwMDQz` |
| SAML issuer URL | `https://portal.sso.eu-central-1.amazonaws.com/saml/assertion/Njk5OTg3Mjk1Nzg5X2lucy02OTg3NTU1MjM1YjQwMDQz` |

The trailing text decodes to `699987295789_ins-6987555235b40043`. That names the
owning account followed by the application instance.

The document was read on 2026-09-05. It answers on the public internet with no
credential. It carries a signing certificate. It offers the redirect binding and
the post binding for sign in. It offers a logout endpoint so `idpSignout` on the
provider has somewhere to call. Its name identifier format is `persistent` which
is what the subject mapping in section 2 asks for.


# Why the stack was rebuilt

The first deploy of the federation failed. Cognito answered
`Invalid AttributeDataType input, consider using the provided AttributeDataType
enum` and the stack settled in `UPDATE_ROLLBACK_FAILED`.

The cause is that the schema of a user pool may only be set while the pool is
created. The `email` attribute had been created as immutable. Cognito rewrites
every mapped attribute on each federated sign in so an immutable one fails that
write. Correcting it needs a new pool. Because a) `UpdateUserPool` refuses any
request carrying a schema at all. b) the change set had reported the edit as an
in place update so the refusal appeared only at deploy time. c) the message
names a data type rather than the schema so it reads as unrelated.

The stack was then deleted and deployed again from nothing. It held no users and
no timesheets so nothing was lost.

## What the delete left behind

The pool and the table and the bucket all carry a retain policy so they outlive
the stack. Their names are generated so a fresh deploy collides with none of
them. They are litter and not a hazard. The first pool is `eu-central-1_LdMfDNAOu`.

```sh
aws cognito-idp delete-user-pool --profile Admin --user-pool-id eu-central-1_LdMfDNAOu
```

The domain prefix is the one name that is not generated. It was released with
the old domain so the new pool takes `4flow-timesheets` again. That is why the
ACS URL did not move.

The distribution carries no retain policy so the rebuilt stack serves from a new
domain name. That is why the start URL did move.

## The rule this leaves

The construct id of the pool is `Pool`. Changing that id is how a schema change
is made. Editing the schema of a pool that exists fails the same way every
time.
