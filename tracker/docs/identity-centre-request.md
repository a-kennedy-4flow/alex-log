# Timesheets on the portal

What to do in account `699987295789`. Nobody else can do it. It takes about five
minutes.

The application already exists. The project was renamed to Tracker and moved to
its own host so all three of its fields now point at things that are gone.
Correct them.

## 1. Correct two fields

**Applications** then **Customer managed** then **Timesheets** then **Actions**
then **Edit configuration**.

| Field | New value |
| --- | --- |
| Application start URL | `https://tracker.4flow.io/` |
| Application ACS URL | `https://4flow-tracker.auth.eu-central-1.amazoncognito.com/saml2/idpresponse` |
| Application SAML audience | `<PASTE SamlEntityId>` |

The audience is the only one that is not known in advance. It ends with the
identifier of the new pool which the deploy creates. It is sent with this page.

The audience always starts `urn:amazon:cognito:sp:` and ends with the pool
identifier. An identifier on its own is not it. Cognito compares the whole string
against the assertion and refuses anything else.

Leave **Relay state** empty. Leave **Session duration** at the default.

## 2. Check the attribute mappings

**Actions** then **Edit attribute mapping**. Four rows and no more.

| Application attribute | Maps to | Format |
| --- | --- | --- |
| Subject | `${user:subject}` | persistent |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `${user:email}` | basic |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `${user:givenName}` | basic |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `${user:familyName}` | basic |

The names in the left column must be the full URIs. A short name such as `email`
is not matched and sign in then fails with no useful message.

The subject must be `persistent` and not the email address. Because a returning
person is recognised by it and an email address changes.

Rename the display name to `Tracker` while you are there.

## 3. Check the assignment

Assign the people who may use the app. A group is easier to keep than a list of
names.

## 4. Send back

Nothing. The metadata URL was already supplied and has not changed.

Say when it is done. We check it from our side in one command.
