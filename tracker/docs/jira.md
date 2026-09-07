# Reading Jira into the tracker

The user opens a month and the tracker already lists the tickets they finished
in it. A ticket summary fills tracker column M. A ticket project proposes a
Workday ID. Nothing is ever written back to Jira.

## Terms

Four words below could be read more than one way. They are defined here once for
the whole project.

**Cloud id.** The identifier of one Atlassian site. Ours is
`792ba525-6efc-4a5f-80f4-b9269516a256` for `4flow.atlassian.net`.

**3LO.** Three legged OAuth. The three parties are the tracker and Atlassian and
the user. It is the authorization code grant with an Atlassian consent screen in
front of it.

**Account id.** The identifier Atlassian holds for one person. An email address
is not the key. Mine is `712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c`.

**Consent.** The one time approval a user gives the tracker to read Jira as
themselves. Atlassian records it. A later sign in is a redirect with no screen.

## What the site actually holds

Probed on 2026-09-07 against `4flow.atlassian.net` as `a.kennedy@4flow.com`.

| Probe | Result |
| --- | --- |
| issues completed in August 2026 | seven |
| projects those issues sit in | `PLRS` and `DEVH` |
| worklogs by this user in August 2026 | none |
| `timespent` on those seven issues | null on every one |
| resolution dates | five of the seven fall within two minutes on 13 August |

Three consequences follow. They hold for every option below.

Jira cannot say how long anything took. There are no worklogs and `timespent` is
empty. The user still enters the days.

Jira cannot say which day the work happened on. Five of the seven tickets were
closed in one bulk action. A resolution date records when a ticket was closed.

Jira supplies the text and the project. That is the whole gain. It removes the
typing rather than the judgement.

## The query

One JQL serves every option.

    assignee = currentUser()
    AND statusCategory = Done
    AND resolutiondate >= "2026-08-01"
    AND resolutiondate <  "2026-09-01"
    ORDER BY resolutiondate DESC

The bounds are absolute rather than `startOfMonth(-1)`. Because a) six months of
history are kept so any of them may be reopened. b) the period key already gives
the two dates. c) a relative bound would answer a different question in the
first minute of a new month.

`assignee = currentUser()` becomes `assignee = "<account id>"` under option C
alone.

`statusCategory = Done` was compared against `status changed to (Done, Closed,
Resolved) during (...)`. Both returned the same seven issues. The first is kept.
Because a) it needs no list of status names. b) migrated 4flow projects carry
status names that differ per project. c) the changed form scans the changelog.

`statusCategory changed to Done during (...)` is rejected by Jira as invalid.
Only `status` may be used with `changed`.

The endpoint is the paged search.

    POST https://api.atlassian.com/ex/jira/<cloud id>/rest/api/3/search/jql

The older `/rest/api/3/search` is withdrawn. Paging is by `nextPageToken`.

Name the fields. The default set returns thirteen fields including three blocks
of avatar URLs.

    "fields": ["summary", "project", "resolutiondate", "parent"]

`parent` is worth carrying. Column M takes the ticket summary so the epic is
never written to a timesheet. The screen shows it under each summary as context.
A ticket key alone says nothing about which piece of work it belonged to.

## The join to a tracker user

Cognito holds the email. Identity Center supplies it. See `docs/identity-centre.md`.
Jira keys people by account id.

Options A and B and E need no join at all. The user signs in to Atlassian
themselves so `currentUser()` resolves. Option C must resolve the caller.

    GET /rest/api/3/user/search?query=<email>

That call needs the `Browse users` global permission. It returns nothing for an
address hidden by a profile visibility setting. So option C also needs a stored
mapping for whoever it fails to resolve.

## The join to a Workday ID

A ticket names a Jira project. The tracker books a Workday ID. `PLRS` and `DEVH`
are neither. Three ways to bridge it.

**Backoffice maintains the map.** One row per Jira project key. It rides in the
catalogue upload that already exists. It is one more sheet in the workbook
backoffice already sends.

**A Jira custom field carries the Workday ID.** The truth then sits in Jira. The
tracker reads it as a field. It needs the field created on every project and it
needs somebody to fill it.

**The user remembers their own.** The first time a `PLRS` ticket is booked the
choice is written to the profile. Every later month proposes it.

The third costs nothing and works on the first day. The first is the only one
that helps a new starter. They are not exclusive. Build the third and add the
first when backoffice asks.

## The screen

A page of its own at `/jira`. Not a band of the month sheet. Its layout is H1 of
`mockups/index.html`. It holds three things in one column.

A list of last month tickets. One row each. The key then the summary then the
Workday ID its project maps to then the hours.

A table grouped by Workday ID. One row each. It sums the hours of the tickets
under it.

A table of days under that. It converts each hour total to days and rounds up to
the nearest half day. The rule is `ceil(hours / halfDay) / 2`.

A half day is the working day halved rather than a fixed four hours. The length
is held on the profile. A six hour day makes the half day three. Because a) a
fixed four hours books somebody on a six hour day a whole day for half of one.
b) the number divides the hours of every ticket so it decides what is submitted.
c) nobody but the user knows how long their day is.

A button reading **Fill the month timesheet** closes the page. It copies the
days across and writes each ticket summary into column M.

Rounding up runs per Workday ID rather than once on the total. So the rounded
total is almost always larger than the true one. Two Workday IDs holding one
hour each become one whole day. Both figures are shown. Because a) the user is
answerable for the number they submit. b) the tracker warns when the month
misses its target so a silent inflation would surface later as that warning. c)
rounding down instead would book less time than was worked.

The fill never claims the month is finished. It reports what it booked against
the target and leaves the rest. Under the share it books the whole target
because a share of the month is what was asked for.

Nothing is written without the button. Validation is untouched.

The fill overwrites a half day that is already booked. Because a) a user who
opens this screen has asked for the month to be filled. b) a prompt on every run
would make the fast path the slow one. c) refusing would leave a month half
filled with nothing to say which half. So the button names how many half days it
will replace before it runs.

## Where the hours come from

Jira holds no hours on this site. That was probed and not assumed. There are no
worklogs and `timespent` is null on all seven tickets.

So the hours come from a list of fields searched in order. The first that
answers wins. `JIRA_HOURS_FIELDS` on the Jira function holds the list and it
defaults to `worklog,timespent`.

`worklog` and `timespent` are the two Jira holds itself and both are seconds.
Any other name is a custom field and it is read as hours. A number arrives as a
number and a select field arrives as an object carrying `value`. Both are
accepted.

The list is configuration rather than code. Because a) which field carries
effort at 4flow is still being settled. b) a custom field can be added with one
line of the stack and no code change. c) naming `worklog` in the list is what
buys the extra call it costs so a deployment that drops it pays nothing.

Nothing is typed. Decision 5 of `docs/todo-jira-option-a.md` settled that. The
column shows what Jira reported and it reads empty on every row of this site.
Every value carries which field it came from and the screen names that field.

So the share per Workday ID is what divides the month. The screen opens on it.
Because a) a column nobody may type into cannot divide anything. b) a share
needs no arithmetic the user has to trust. c) `lib/distribute.ts` already takes
one. The hours path is kept and tested because it is what a site with worklogs
would use.

Reading worklogs is not free. A JQL search returns issues rather than the
worklogs under them. `fields=worklog` returns the first twenty per issue and no
more. So a full read costs one further call per issue. Send that only for an
issue the worklog JQL already named. Because that query returned nothing here
the cost today is zero calls.

A list that leaves `worklog` out skips both that query and the account lookup.
So a deployment reading only a custom field costs one call for a whole month.

The screen still offers the hours mode. It books the rounded hours where a
worklog supplied any. On this site it books nothing so the share is the path.

## A function of its own

The Jira reader is a third Lambda beside `main` and `reminder`. It is not a
route on the API function.

`lambda.ts` already states the rule. Each handler is deployed as its own
function so the API role never gains permission to send mail. The same holds
here. The Jira function is the only one that reads the client secret and the
only one that uses the KMS key. The API role gains neither.

One bundle still carries all three. `build.mjs` bundles `src/lambda.ts` once and
the stack points three functions at three exports of it.

API Gateway routes by path. `/api/jira/{proxy+}` takes its own integration
under the JWT authorizer that is already configured. So the claims the function
reads are verified before it runs. That is how `main` gets its caller today.

| Route | Function | Purpose |
| --- | --- | --- |
| `GET /api/jira/completed?period=2026-08` | jira | the ticket list for one month |
| `GET /api/jira/link` | jira | whether this user has linked |
| `POST /api/jira/link` | jira | begin consent |
| `DELETE /api/jira/link` | jira | forget the token |
| `PUT /api/timesheets/{period}` | main | where the fill writes |

The fill posts to the route that already exists. The Jira function never writes
a timesheet. Because a) that route already validates every half day. b) the
export must never carry a sheet the tracker would reject. c) a second writer
would be a second place for the rules to drift.

The Jira function does not read the catalogue. It answers with Workday IDs and
the SPA resolves the titles from the catalogue it already holds. Because a) the
catalogue is sixty kilobytes gzipped. b) decompressing it would double the cold
start of a function that runs once a month per user. c) the month page already
pays that cost.

The repository gains one item shape next to the four in `repository.ts`.

    USER#<sub>   JIRA    what links this user to Jira

The answer is cached in that item. A closed month is cached for a day. The
current month is cached for fifteen minutes. Because a) a JQL search is one of
the more expensive Jira calls. b) a month that ended a fortnight ago rarely
changes again. c) the screen is reloaded more often than the data moves.

Option D replaces the first route with a write from Jira.

## Option A. The API holds a per user consent

One OAuth 2.0 3LO app is registered at `developer.atlassian.com`. It is granted
`read:jira-work` and `read:jira-user`. The authorize URL asks for
`offline_access` as well. That third value is not a Jira scope so the console
does not list it. It is what makes Atlassian return a refresh token.

Consent is offered on the profile page. The browser is sent to
`auth.atlassian.com/authorize`. That URL carries `audience=api.atlassian.com`
and `response_type=code` and `prompt=consent` and a state value. The callback
lands on an SPA route. That route posts the code to `POST /api/jira/link`. The
API exchanges it. Because the client secret must never reach a browser.

Atlassian Cloud supports no PKCE on this flow. The token endpoint requires the
client secret. So the exchange runs on a server whichever option is built. A
per application flag exists and Atlassian has to be asked to flip it. Do not
plan on it.

`prompt=consent` is a required parameter and `consent` is its only documented
value. So every authorize call shows the screen. Under this option that happens
once for the life of the link.

The client secret lives in Secrets Manager. Only the Jira function may read it.
The refresh token is encrypted with KMS before the put rather than relying on
table encryption alone. Because a table export would otherwise carry a usable
credential.

### Rotation

Atlassian rotates a refresh token. Each use returns a new one valid for ninety
days and disables the one that fetched it. There is no other kind of refresh
token to ask for. A monthly run keeps one alive on its own.

Rotation is the part of this option most likely to break. Two callers that spend
one token race each other. The first wins a new pair and the loser is told
`Unknown or invalid refresh token`. That ends the link and the user has to
consent again. It is the most reported fault against this flow. Atlassian has
acknowledged that its own rotation behaviour did not match the documentation.

The function runs in its own container so a lock held in memory guards nothing.
Two tabs are two containers. The reminder is a third.

Four rules hold it. No one of them is enough on its own.

The access token is cached for its hour. So one user causes at most one refresh
an hour rather than one per request. That removes most of the race rather than
handling it.

A refresh takes a claim on the item before it runs. `claimReminder` in
`repository.ts` already does exactly this with a conditional write and the same
expression serves here. A caller that loses the claim re-reads the item and
takes whatever access token is there by then. It never refreshes.

The previous refresh token is kept beside the current one. Atlassian is reported
to accept an older token for about ten minutes after it rotates. That interval
is not in the documentation so it is a fallback and never the path. A loser that
finds no fresh token tries the previous one once.

A token response sometimes carries no refresh token at all. Write the stored
token only when the response carries one. Because writing null over a working
token ends the link as surely as a race does.

The monthly reminder gains the ticket list. That is the strongest argument for
this option. `reminder.ts` already runs on a schedule and already reads every
user.

A user who never consents sees the panel offer to link. A revoked consent
returns 401 and the stored token is dropped on the spot.

Ask the Atlassian administrator to confirm one thing. External app access rules
must permit a customer OAuth app to read Jira. An administrator can block that
site wide.

## Option B. The browser holds the access token

The API exchanges the code and hands the access token straight back. It stores
nothing. The token lives in a variable for its hour and dies with the tab.

The exchange cannot move into the browser. Atlassian supports no PKCE and the
token endpoint requires the client secret. So one route is needed no matter how
little is kept. This option was drafted as a pure browser flow and that flow
does not exist.

The browser then calls `api.atlassian.com` itself. That host allows cross origin
calls for 3LO. The site host `4flow.atlassian.net` does not and never will.
Because it accepts session cookies so any page could otherwise read Jira as
whoever is signed in.

One line changes in `infra/lib/tracker-stack.ts`. The `connect-src` list gains
`https://api.atlassian.com`. It needs nothing for `auth.atlassian.com` because
the redirect is a navigation and the exchange belongs to the API.

Nothing is stored. No KMS key is needed. No link item is written.

The costs are real. The SPA runs a second OAuth flow beside the Cognito one.
`prompt=consent` is required so a new tab shows the screen again. The reminder
mail cannot carry tickets because no server holds a token.

This is still the smallest thing that proves the panel is worth having.

## Option C. One read only Jira account

A dedicated Atlassian account holds an API token in Secrets Manager. The API
authenticates as that account and queries `assignee = "<account id>"` for the
caller.

It needs `Browse projects` on every project any user might book. It needs
`Browse users` for the email lookup.

No consent and no linking. Every user is served on their first sign in including
a new starter.

The costs are the reason this is not the recommendation. One credential can read
every ticket at 4flow and the tracker becomes the place it lives. A ticket list
is read without the person approving it. The account consumes a Jira licence.
Rotation is manual until somebody automates it.

## Option D. A Forge app pushes from Jira

A Forge app is installed on the site by an administrator. A scheduled trigger
runs on the first of the month. It queries each user and posts the result to the
tracker API.

It runs as the app with scopes an administrator granted once. No Atlassian
credential is held in AWS. Egress to `tracker.4flow.io` is declared in the
manifest.

Two costs stand out. A second build and deploy pipeline appears in Atlassian.
The tracker API needs a machine caller which the Cognito JWT authorizer has no
path for today so that is a new authentication route and a new secret.

This is right only if 4flow already runs Forge apps. Ask before designing it
further.

## Option E. The user pastes their own API token

Two fields on the profile page. The user creates a token at `id.atlassian.com`
and pastes it. It is stored per user and encrypted.

It is listed because it is what a rushed version looks like. Do not ship it. A
basic auth API token carries no scopes. It grants everything its owner can reach
in Atlassian including write. Ours would be read only by intention alone.

## Comparison

| | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| Atlassian credential at rest | refresh token per user | none | one for the site | none | full token per user |
| User consents | once | a screen every tab | never | never | pastes a token |
| Works on a first sign in | after linking | after linking | yes | yes | after pasting |
| Reminder mail can carry the list | yes | no | yes | yes | yes |
| New administrator request | app access rules | app access rules | account and permissions and licence | install and scopes | none |
| CSP change | no | yes | no | no | no |
| New API routes | three | one | one | two | three |
| Reads a ticket list without approval | no | no | yes | yes | no |

## Recommendation

Build option A. Because a) a per user item already exists so the token has a
home. b) no credential is created that can read all of 4flow. c) the monthly
reminder can then carry the list which is where this feature is worth the most.

Option B is the smaller first slice. It still needs the exchange route because
Atlassian requires the client secret there. What it saves is every part that
stores something. Build it first if the panel has to be seen before the rest is
funded.

Options C and D both read a person's ticket list without that person approving
it. At 4flow that is a data protection question rather than an engineering one.
Do not start either until it is answered.

## Open questions

1. Do external app access rules on the site permit a customer OAuth app. The app
   is registered as of 2026-09-07. Registering one proves nothing about the
   rules. The first consent that completes is the proof.
2. Which Workday ID does `PLRS` book against. Which does `DEVH` book against.
3. Should a ticket completed in a project the user cannot book be hidden or
   shown unmapped.

## Closed questions

Column M takes the ticket summary. The epic is read and shown and never
written.

Nothing types an hour. The share per Workday ID divides the month.

The hours come from the fields `JIRA_HOURS_FIELDS` names. Which fields those
should be is still being settled.

A half day is the working day halved. The length sits on the profile and
defaults to eight hours.

The screen is H1 of `mockups/index.html`. Three tables down one sheet.

The fill overwrites a half day that is already booked. It names the count first.

The screen is a fifth page at `/jira` rather than a band of the month.
