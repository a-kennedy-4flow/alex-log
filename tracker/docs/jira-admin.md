# A request to the Jira administrator

The tracker needs one approval from a 4flow Atlassian administrator. Nothing
below asks for an account or a licence or a change to any project permission.

Send this document as it stands. It names the app and the approval and the way
to check that it worked.

## The ask in one line

Approve the OAuth 2.0 app named Tracker under **Connected apps** so a 4flow user
can consent to it reading their own Jira as themselves.

## The app

| Field | Value |
| --- | --- |
| Name | Tracker |
| Type | OAuth 2.0 three legged app. Not a Marketplace app and not a Forge app. |
| App id | `c2f96950-fe5f-40cf-a21b-7483ac8dde10` |
| Client id | `wJiihW00HOrSowAzpyBcDjWOj7vUMAXz` |
| Registered by | `a.kennedy@4flow.com` on 2026-09-07 |
| Site | `4flow.atlassian.net` |
| Callbacks | `https://tracker.4flow.io/jira/callback` and `http://localhost:5173/jira/callback` |
| Hosted by | 4flow on AWS in `eu-central-1` |

## What to do

1. Go to `admin.atlassian.com`. Select the 4flow organisation.
2. Select **Apps**.
3. Select `4flow.atlassian.net` under **Sites** in the sidebar.
4. Select **Connected apps**.
5. Find Tracker and approve it. It is listed by the client id above.
6. Check the **Block user apps** setting on that screen. A 4flow user cannot
   grant any app while it is on. Either turn it off or approve Tracker as the
   exception.

An OAuth app cannot reach any user data on an Atlassian site until a site
administrator has approved it. That is why this request exists at all. A user
who consents before the approval sees the app refused.

## What it reads

Eighteen read scopes. No write scope of any kind is asked for. So the app cannot
create or edit or delete anything in Jira.

| Scope | On the consent screen | Used |
| --- | --- | --- |
| `read:issue-details:jira` | View issue details | yes |
| `read:field:jira` | View fields | yes |
| `read:field.default-value:jira` | View field default values | yes |
| `read:field.option:jira` | View field options | yes |
| `read:group:jira` | View groups | yes |
| `read:user:jira` | View users | yes |
| `read:application-role:jira` | View application roles | yes |
| `read:avatar:jira` | View avatars | yes |
| `read:issue-worklog:jira` | View issue worklogs | yes |
| `read:issue-worklog.property:jira` | View issue worklog properties | yes |
| `read:project-role:jira` | View project roles | yes |
| `read:field-configuration:jira` | Read field configurations | yes |
| `read:project:jira` | View projects | yes |
| `read:project-category:jira` | View project categories | yes |
| `read:issue-meta:jira` | View issue meta | spare |
| `read:issue:jira` | View issues | spare |
| `read:issue.property:jira` | View issue properties | spare |
| `read:issue.time-tracking:jira` | View issue time trackings | spare |

The fourteen marked used are what the Jira REST API requires for the four calls
the tracker makes. The four marked spare are granted and called by nothing. Ask
and they will be removed.

The four calls are the whole integration.

| Call | Purpose |
| --- | --- |
| `GET /rest/api/3/myself` | the account id of whoever consented |
| `POST /rest/api/3/search/jql` | the issues that user closed in one month |
| `GET /rest/api/3/issue/{key}/worklog` | the hours that user logged on one issue |
| `GET /rest/api/3/field` | the id of the cost centre field on this site |

The JQL is fixed in the code and reads one month of one person.

    assignee = currentUser()
    AND statusCategory = Done
    AND resolutiondate >= "<the first of the month>"
    AND resolutiondate <  "<the first of the next month>"

## What it cannot reach

A scope does not override a Jira permission. The app reads as the user who
consented so it sees exactly what that person already sees in Jira. A project
they cannot browse stays unreadable to the tracker.

The app holds no credential of its own on the site. It has no service account.
It cannot read anybody who has not consented.

## What is stored

One refresh token per user. It is encrypted with a customer managed KMS key
before it is written and only the Jira function can decrypt it. No issue text is
kept beyond a cache of one month per user.

A user revokes the grant themselves at `id.atlassian.com/manage-profile/apps`.
That ends the tracker access immediately.

## Why it is needed

The tracker fills a monthly timesheet. A ticket closed in the month supplies the
text of a row and the project it books against. Because a) every person retypes
the same summaries by hand today. b) Jira already holds them. c) the alternative
designs read a colleague ticket list without that colleague approving it and
that is worse.

## How to check it worked

The user presses **Connect Jira** once in the tracker. Atlassian shows the
consent screen listing the scopes above. The user approves. The tracker then
lists their closed tickets.

The administrator sees Tracker under **Connected apps** for the site. The user
sees it under their own apps at `id.atlassian.com/manage-profile/apps`.

## One more thing to check

4flow may hold an Atlassian Guard subscription. A data security policy under it
can carry an app access rule that blocks apps per project. `PLRS` and `DEVH` are
the two projects the tracker has been tested against. Neither may be blocked by
such a rule.

## References

- Your site admin must authorize this app. `https://support.atlassian.com/atlassian-cloud/kb/your-site-admin-must-authorize-this-app-error-in-atlassian-cloud-apps/`
- Manage your organization Marketplace and third party apps. `https://support.atlassian.com/security-and-access-policies/docs/manage-your-users-third-party-apps/`
- Jira scopes for OAuth 2.0 and Forge apps. `https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/`
