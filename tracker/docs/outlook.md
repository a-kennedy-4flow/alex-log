# Reading the Outlook calendar into the tracker

The user opens a month and the tracker already knows where the hours went. A
meeting carries a start and an end on a real day. Nothing is ever written back
to Outlook.

The Jira reader is the template. It is a per user consent held by a Lambda of
its own with a screen that groups what it read and fills the month from it.
Everything below is that shape with a second provider behind it. `The Jira file
beside the Outlook one` names the counterpart of every file.

This document costs the connection. It does not justify it. `docs/jira.md`
opens with a probe of the live site and every decision in it rests on that
probe. Nothing equivalent has been run against Outlook. So read `What is
unmeasured` before spending anything.

## Terms

Eight words below could be read more than one way. They are defined here once
for the whole project.

**Tenant.** One Microsoft 365 organisation. Ours is the 4flow one. The tenant id
is not recorded here because nobody has read it yet.

**Graph.** `https://graph.microsoft.com`. One API in front of every Microsoft
365 service. A calendar is one resource of it.

**UPN.** User principal name. The sign in name of one person in the tenant. It
usually reads as an email address and it is not required to be one.

**Delegated permission.** The app reads as the signed in person. It reaches only
what that person reaches.

**Application permission.** The app reads as itself. It reaches every mailbox in
the tenant until a policy narrows it.

**calendarView.** The endpoint returning what a calendar shows between two
instants. It expands a recurring series into one event per occurrence.

**Series master.** The single record behind a recurring meeting. Every
occurrence of it carries `seriesMasterId`.

**Immutable id.** An event id that survives the item moving between folders. It
is returned only under the `Prefer: IdType="ImmutableId"` header. The default id
changes on a move.

## What is unmeasured

Nothing below was probed. `docs/jira.md` can state that Jira holds no hours
because seven tickets were read on 2026-09-07 and every `timespent` came back
null. This table is the same table for Outlook and every row of it is empty.

| Probe | Result |
| --- | --- |
| events in one month | unmeasured |
| how many are occurrences of a series | unmeasured |
| how many carry a category | unmeasured |
| how many name a ticket key in the subject | unmeasured |
| hours the events sum to | unmeasured |
| hours that overlap another event | unmeasured |
| how many are marked private or confidential | unmeasured |
| how many were declined | unmeasured |
| how many are `workingElsewhere` | unmeasured |
| how many sit in a calendar other than the default one | unmeasured |
| whether one month exceeds one page | unmeasured |
| all day out of office blocks in a year | unmeasured |

The probe needs no registration and no code. Graph Explorer at
`developer.microsoft.com/graph/graph-explorer` signs in as a 4flow user and runs
the query below against that user own calendar. An afternoon answers every row.

Run it first. Because a) rows two and three and four decide whether attribution
is possible at all b) row five decides whether the hours are worth reading c) a
registration request to 4flow IT is the slow part of every option here and it
should not be sent for a feature the probe would have killed.

## What a calendar cannot say

Four consequences follow. They hold for every option below.

A calendar records meetings rather than work. Nobody books an appointment with
themselves for the six hours they spend writing code. So a month of events sums
to less than the month and the shortfall is not evenly spread. A person who
attends meetings all week looks busier than the one who delivered.

Two meetings overlap. A double booking is one hour rather than two. So the sum
of event durations is not the time a day held.

A calendar names no project. There is no field for one. Every option below
guesses from a series or a subject or a category.

A subject is not safe to copy. A timesheet leaves the tracker as an export to
backoffice. `Doctor` and `1:1 about performance` and a customer name under
embargo all sit in the same list as the project call.

So Outlook answers the two questions Jira cannot. It says which day and it says
how long. It answers neither of the two Jira answers well. It cannot say what
the work was and it cannot say what to book it against.

## The baseline it has to beat

`/quick` fills a month from a share per project in one press.
`apps/web/src/pages/SimplePage.vue` does it today and it asks for no
registration and no consent and no token. So a calendar reader that leaves a
person answering a picker per meeting is slower than what already ships. That is
what the probe is measuring.

## The query

    GET https://graph.microsoft.com/v1.0/me/calendarView
      ?startDateTime=2026-08-01T00:00:00%2B02:00
      &endDateTime=2026-09-01T00:00:00%2B02:00
      &$select=id,subject,start,end,isAllDay,showAs,categories,sensitivity,type,seriesMasterId,isCancelled,responseStatus
      &$top=250
    Prefer: outlook.timezone="Europe/Berlin"
    Prefer: IdType="ImmutableId"

`calendarView` rather than `/me/events`. Because a) `events` returns a recurring
meeting as one series master carrying a recurrence rule b) a weekly project call
is then one row where the month held four c) expanding that rule in our own code
would reimplement the part of Outlook most likely to hold an exception.

The bounds are absolute rather than relative. The period key already gives both
dates. That is the same reasoning the JQL bounds take in `docs/jira.md`.

### The bounds carry their own offset

Graph states that `startDateTime` and `endDateTime` are read from the offset
inside the value and are not affected by the `Prefer: outlook.timezone` header.
A value with no offset is read as UTC.

So the offset is part of the bound. Without it a Berlin summer month starts at
02:00 on the first and ends at 02:00 on the first of the next. A late meeting
then crosses midnight into the wrong day. Which day an hour books against is the
entire reason for reading a calendar.

The `+` must be sent as `%2B`. A bare `+` in a query string decodes to a space
and the value is then rejected.

The offset is not a constant. Berlin is `+01:00` in January and `+02:00` in
August. It is computed for the first instant of the month from the zone.
`apps/api/src/reminder.ts:66` already reads a local date out of an instant with
`Intl` and a zone so the same call answers the offset.

The `Prefer: outlook.timezone` header governs the times in the answer alone.
Without it every returned instant is UTC. IANA names are accepted so
`Europe/Berlin` is a legal value.

### Which zone

The zone is the user work location rather than one constant. `Berlin` and
`Munich` book different bank holidays today so they can sit in different zones
tomorrow.

No such map exists. `infra/lib/tracker-stack.ts:79` holds one
`REMINDER_TIME_ZONE` of `Europe/Berlin` for the reminder mail.
`packages/core/src/calendar.ts` keys bank holidays and working weekends by
location code and holds no zone of any kind. So a location to zone map is new
work and it is small. One record beside the holiday lists in the catalogue with
`Europe/Berlin` as the fallback.

### The other fields

`$select` names twelve fields. A default event returns over forty including the
body. Naming them is a privacy control rather than a bandwidth one. The body of
an appointment is the most sensitive text in a mailbox and this feature has no
use for it.

`Prefer: IdType="ImmutableId"` is not optional here. A default event id changes
when the item moves between folders. An answer a person set against one meeting
is keyed on that id so the default id would lose the answer on a move and ask
again.

Graph documents no order for `calendarView` so the sort is ours. The overlap
merge needs the starts sorted anyway.

`/me/calendarView` reads the default calendar alone. A person keeping a second
calendar for one project is read as though those meetings never happened.
`/me/calendars/<id>/calendarView` reads one named calendar and
`/me/calendarGroups` lists them. It is listed and not built until the probe says
anyone does this.

Paging is by `@odata.nextLink`. Five meetings a day over twenty working days is
one hundred events so a month is not reliably one page. `$top=250` and the
`nextLink` loop are both taken.

### Which events are dropped

| Property | Dropped when | Why |
| --- | --- | --- |
| `isCancelled` | true | it did not happen |
| `responseStatus.response` | `declined` | it was not attended |
| `showAs` | `free` | a free block is a note to self rather than time spent |
| `type` | `seriesMaster` | `calendarView` returns the occurrences so a master double counts |

Nothing else is dropped. Every remaining event is listed and every one that is
not an all day event contributes its hours.

`type` arrives as one of `singleInstance` and `occurrence` and `exception` and
`seriesMaster`. An `exception` is an occurrence somebody moved or renamed. It is
kept and it carries the `seriesMasterId` of its series so a series answer still
reaches it.

`showAs` arrives as one of `free` and `tentative` and `busy` and `oof` and
`workingElsewhere` and `unknown`. `workingElsewhere` is work and it is kept and
booked. `unknown` is kept and treated as `busy`.

A `tentative` event is kept and marked. Because a) a tentative meeting usually
happened b) dropping it silently loses hours nobody can find again c) the screen
can say which rows are soft and let the person delete them.

Two fields say tentative and neither is the other. `showAs` is `tentative` when
the organiser marked the slot. `responseStatus.response` is
`tentativelyAccepted` when this person did. Either one marks the row.

### A subject is withheld rather than an event dropped

`sensitivity` arrives as one of `normal` and `personal` and `private` and
`confidential`. The three that are not `normal` contribute their hours and never
their subject. The row reads `Private appointment` and books like any other.

Dropping the event whole would leave a hole in the day that nothing explains.
Dropping the subject alone loses nothing the timesheet wanted. Because a) the
export carries a Workday ID rather than a subject b) the hours are the whole
contribution of the row c) a hole in a day sends a person back to Outlook to
find out what it was.

`confidential` is the value most easily missed. A control naming `private` and
`personal` alone leaks it.

Most people never set `sensitivity` at all. So this control catches the events
somebody marked and no more. That is why no subject reaches a timesheet under
any setting.

### An all day event

An all day event is not eight hours of one project. It is absence or travel or a
marker somebody dropped on a week. So the duration is ignored and the `showAs`
decides.

`oof` on an all day event is the one unambiguous fact a calendar holds. The
tracker already offers two absence labels from the catalogue upload. They are
`Vacation or sickness` and `Other absence`. An out of office day maps to the
first with no guess of any kind.

Every other all day event is listed and never booked.

The end is the midnight after the last day. Graph requires an all day event to
start and end at midnight in one zone so a single day of leave on the third
reads as `start` the third and `end` the fourth. The last day is the day before
`end` rather than the day of it. A naive read books two days of leave for one.

### Overlap

Two events covering the same minute are one minute. The merge is a sweep over
the sorted starts.

The merged span is then split evenly among the events covering it. Because a) a
day total must never exceed the day b) a person sat in one of the two meetings
and which one is unknowable from the outside c) an even split is the only answer
that needs no guess.

## The join to a tracker user

There is none under a delegated permission. `me` resolves to whoever signed in.
That is simpler than Jira where an account id had to be looked up.

An application permission addresses the mailbox as `/users/<upn>`. Cognito holds
the email from Identity Center. Whether the 4flow UPN is that same string is
unverified and it is question three below.

## The join to a Workday ID

The hard part. An event names no project so four signals are candidates.

**The series.** A weekly project call is the same series every week. Answer it
once. `seriesMasterId` is the key and every later month resolves without a
question.

**A ticket key in the subject.** The pattern is `[A-Z][A-Z0-9]+-[0-9]+`. Then
`resolveCostCentre` in `packages/core/src/jira-cost-centre.ts` answers it
exactly as it answers a Jira row. A meeting titled `PLRS-901 review` books where
the ticket books. This composes with the Jira reader for free.

That pattern also matches `ISO-9001` and `Q4-2026`. A match is looked up rather
than trusted so a key naming no project falls through to the next signal.
`resolveCostCentre` already answers `none` for a project it cannot map.

**A category.** An Outlook category is per user and free text. A person who
already colours their calendar by project has done the mapping. One category to
one Workday ID on the profile.

**The attendees.** An external attendee at a customer domain names the client.
It is listed and not built. Because a) an attendee list is other people data and
mining it to guess a cost centre is disproportionate to what is gained b) a
domain names a company where 4flow runs several projects c) the series answer
already covers every recurring customer call.

### The order the screen resolves in

1. An answer set against this one event. `outlookEvents` on the profile.
2. An answer set against this series. `outlookSeries` on the profile.
3. A ticket key parsed from the subject. Resolved through `resolveCostCentre`.
4. A category mapped on the profile. `outlookCategories`.
5. Nothing. The row is listed and never booked.

That is the four answers in order that `resolveCostCentre` already takes for a
ticket. The reasoning there transfers whole.

An event answer beats a series answer. Because a) it is the only way to correct
one week of a call that ran for a different project b) a series answer is made
once and serves every month after it c) the two rarely compete so the cost of
the rule is nothing.

A chosen answer beats a parsed one. A key in a subject is derived and a person
who set a Workday ID meant it.

### Where an answer is kept

The profile beside `jiraTickets` and `jiraProjects`. Both are already
`Record<string, string>` at `packages/core/src/types.ts:167` and `PUT /api/me`
already holds them. Three more maps are three more of the same shape.

The key of `outlookEvents` is the immutable id. A default id keyed here is an
answer lost the first time the item moves.

The bound is two hundred series and five hundred events. A person holds few
recurring meetings and many one off ones.

### The number that decides the feature

This only pays if most of a month sits in a series or names a key. A month of
one off meetings each needing its own answer is data entry with a calendar drawn
beside it. It is then slower than `/quick`. Rows two and four of the probe table
measure exactly that fraction.

Nothing here should be funded before those two rows carry a number.

## The screen

A seventh page at `/outlook`. `apps/web/src/router.ts` declares six today and
its opening comment counts them so that comment changes too. The layout is the
three tables of `/jira` because that page already solved the same problem.

A list of the month events. One row each. The day then the subject then the
hours then the Workday ID it books against.

Under the Workday ID in smaller writing is where the attribution came from. One
sentence of five. `You set this for this meeting` and `You set this for the
weekly series` and `PLRS-901 from the subject` and `Your category Project Alpha`
and `Nothing answers this meeting`.

A row nothing answered carries a cost centre picker in place of the figure. It
writes against the series when the event has one and against the event when it
does not. So the recurring call is answered once and never asked again.

The subject is shown and never written to a timesheet. Column M takes a Jira
ticket summary today and a calendar subject is not one. Because a) the export
reaches backoffice and a subject carries names and customers and sometimes a
medical appointment b) `sensitivity` marks only some of what is sensitive
because most people never set it c) the Workday ID is the whole of what the
timesheet needs and the subject only helps the person recognise their own row.

A table grouped by Workday ID summing the hours under it. A table of days under
that. Rounding runs per Workday ID so the rounded total exceeds the measured one
and both figures are shown.

None of that arithmetic is new. `groupByWorkdayId` and `hoursTotals` and
`daysFromHours` in `packages/core/src/hours.ts` already group and total and
round up to the half day. `daysFromHours` at line 135 is the
`ceil(hours / halfDay) / 2` this screen needs. `hoursTotals` already reports the
inflation the rounding added and already separates the rows that map to nothing.
So an Outlook event is converted to the `TicketHours` shape and every figure on
the screen follows.

A button reading **Fill the month timesheet**. It posts to
`PUT /api/timesheets/<period>` which already validates every half day at
`apps/api/src/handlers.ts:359`. The Outlook function never writes a timesheet.

The `/outlook` page and the `/jira` page both propose a month. Nothing merges
them yet. Questions five and seven decide that and both are open.

## Where the hours come from

The events. An event carries a start and an end so the hours are measured rather
than configured. That is the one place this source beats Jira outright.

The measured total still sits under the month. So the hours divide the month
rather than fill it. The share per Workday ID is the same path `/jira` takes and
`allocationsFromGroups` in `hours.ts` hands those shares to
`packages/core/src/distribute.ts`.

Both figures are shown. The hours the calendar measured and the share they imply
of a month that is longer than their sum.

## A function of its own

A fourth Lambda beside `main` and `reminder` and `jira`. `apps/api/src/lambda.ts`
already states the rule. Each handler is its own function so no role gains a
permission it has no use for. The Outlook function is then the only one holding
the Microsoft client secret.

One bundle still carries all four. `build.mjs` bundles `src/lambda.ts` once and
the stack points four functions at four exports.

| Route | Function | Purpose |
| --- | --- | --- |
| `GET /api/outlook/events/<period>` | outlook | the month for one user |
| `GET /api/outlook/link` | outlook | whether this user has linked |
| `POST /api/outlook/link` | outlook | finish a consent |
| `DELETE /api/outlook/link` | outlook | forget the token |

The month is a path segment rather than a query. Because a) neither adapter
passes a query string through to a handler b) `apps/api/src/jira-handlers.ts:179`
already says so about `/api/jira/completed/<period>` c)
`/api/timesheets/<period>` addresses a month the same way.

The repository gains one item shape beside the Jira one.

    USER#<sub>   OUTLOOK   what lets the tracker read the calendar as this user

Caching matches Jira. A closed month for a day. The current month for fifteen
minutes. `TICKET_CACHE_CLOSED_MS` and `TICKET_CACHE_CURRENT_MS` in
`apps/api/src/repository.ts` are the two constants and they are not Jira
specific.

The cache rides inside the `OUTLOOK` item rather than in an item of its own.
`StoredJiraLink.cache` already does exactly this so a read of the link is a read
of the cache. A version field guards a shape change the same way
`TICKET_CACHE_VERSION` does.

`calendarView/delta` would make a second read of a closed month return nothing
at all. It is listed and not built. The cache already answers the same need.

This section is option A and option C. Option B holds no token and writes no
item and adds no route so none of it applies there.

### The token file is generalised rather than copied

`apps/api/src/jira-tokens.ts` becomes `oauth-tokens.ts` taking a provider.
Because a) the four rules guarding the refresh rotation race are the expensive
part of that file and they are not Atlassian specific b) two copies of a
concurrency guard drift and only one of them gets the next fix c) it already
takes its repository and its cipher and its clock as arguments.

Three things in it are Jira shaped and each is one rename. `TokenDeps.jira` is
typed as the `Jira` interface so it becomes a narrower interface carrying the
grant and the refresh alone. `StoredJiraLink.accountId` is Atlassian so it
becomes a nullable provider account field. `getJiraLink` and `putJiraLink` and
`deleteJiraLink` and `putJiraLinkIfUnchanged` and the claim call on `Repository`
each take a provider. That is the whole cost and it is worth paying once.

### Entra does not rotate the way Atlassian does

Microsoft documents that a refresh token replaces itself on every use and that
the old one is not revoked when it is spent. Atlassian disables the one that was
spent and that race is what dominates `docs/jira.md`.

So the guard is cheaper here than it is there. It is still taken because it is
already written and because a revoked token and an expired token both still
arrive.

The lifetime is ninety days for a confidential client. It is twenty four hours
for a redirect URI registered as `spa` and every later token carries that same
expiry forward. So option B needs a full interactive run of the flow once a day
and option A does not.

## The Jira file beside the Outlook one

Option A file by file. It is the answer to whether this can look like the Jira
reader. Nine files gain a counterpart and four are reused untouched and two are
widened and one does not carry over.

| Jira | Outlook |
| --- | --- |
| `packages/core/src/jira-scopes.ts` | `outlook-scopes.ts`. Two scopes rather than fifteen. |
| `packages/core/src/jira-cost-centre.ts` | reused. `resolveCostCentre` answers an event. |
| `packages/core/src/hours.ts` | reused. Grouping and rounding and totals. |
| `packages/core/src/distribute.ts` | reused. The share per Workday ID. |
| `packages/core/src/types.ts` | three maps beside `jiraProjects` and `jiraTickets`. |
| `apps/api/src/jira.ts` | `outlook.ts`. The Graph client and its refusals. |
| `apps/api/src/jira-tokens.ts` | `oauth-tokens.ts`. Shared rather than copied. |
| `apps/api/src/jira-handlers.ts` | `outlook-handlers.ts`. Four routes. |
| `apps/api/src/jira-fake.ts` | `outlook-fake.ts`. The double the probe capture feeds. |
| `apps/api/src/jira-dev.ts` | mostly does not carry over. See below. |
| `apps/api/src/kms.ts` | reused. One more key and one more secret. |
| `apps/api/src/repository.ts` | the `OUTLOOK` item and the provider argument. |
| `apps/web/src/lib/jira.ts` | `lib/outlook.ts`. Plus a PKCE verifier. |
| `apps/web/src/composables/useJira.ts` | `useOutlook.ts`. |
| `apps/web/src/pages/JiraPage.vue` | `OutlookPage.vue`. Three tables. |
| `docs/jira-admin.md` | `docs/outlook-admin.md`. Written. Two ids still blank. |

`jira-dev.ts` reads the month of another Atlassian account using the token of
whoever consented on this machine. The Outlook equivalent is
`/users/<upn>/calendarView` under a delegated token and that answers only where
the other person shared their calendar. So the switch is not worth building and
`outlook-fake.ts` carries the local development on its own.

`lib/outlook.ts` is not `lib/jira.ts` with two strings changed. The Atlassian
flow carries no PKCE at all and `apps/web/src/lib/jira.ts:61` says so where it
keeps a state and no verifier. Option A adds a verifier and an S256 challenge
and the storage of the verifier beside the state. `lib/auth.ts` already runs
PKCE for Cognito so the code to copy is in the repository already.

## Option A. The API holds a per user consent

The Jira shape. One single tenant app registration in Entra ID. The platform is
`Web` so the token endpoint requires the secret. The secret sits in Secrets
Manager beside the Atlassian one and the refresh token is KMS ciphertext in the
table exactly as the Atlassian one is.

    https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize
      ?client_id=<id>
      &response_type=code
      &redirect_uri=https://tracker.4flow.io/outlook/callback
      &response_mode=query
      &scope=offline_access%20Calendars.ReadBasic
      &state=<state>
      &code_challenge=<challenge>
      &code_challenge_method=S256

The exchange is `POST https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`
from the Outlook function. The browser carries the code to
`POST /api/outlook/link` and never sees a token. `apps/web/src/lib/jira.ts`
already does precisely this for Atlassian.

PKCE and a secret together. Because a) the browser starts the flow so a stolen
code must be worthless without the verifier b) Entra accepts both on one
request c) `lib/auth.ts` already computes an S256 challenge for Cognito so the
verifier is a copy rather than a design.

`Calendars.ReadBasic` rather than `Calendars.Read`. Because a) `Read` carries
the body of every appointment b) this feature needs a start and an end and a
subject and nothing else c) a consent screen naming less is approved sooner.
Microsoft names three exclusions for `ReadBasic`. They are `body` and
`attachments` and `extensions`. `categories` is not among them so the category
signal survives. The wording is hedged with `such as` so the probe confirms it
in Graph Explorer before the registration is requested.

`Calendars.ReadBasic` is a delegated permission and there is no application form
of it. `Calendars.ReadBasic.All` is the application one and option C is where
that matters.

The redirect URI must match the registration exactly. Entra allows no wildcard.
So `http://localhost:5173/outlook/callback` is registered beside the live one
the way the Atlassian app already registers both.

No CSP change is needed. The consent redirect is a top level navigation which
neither `connect-src` nor `form-action` governs and every call to Graph is made
by the Outlook function. `infra/lib/tracker-stack.ts:244` already says this
about Atlassian.

A KMS signed client assertion could replace the secret. Entra accepts
`private_key_jwt` and KMS can sign one so no credential would exist outside the
key. The Jira function already uses KMS for the cipher. It is listed and not
built because a secret in Secrets Manager is the smaller first cut.

`docs/outlook-admin.md` is the request to send to 4flow IT. Two things are
asked for. The registration itself and the tenant admin consent for the two
delegated permissions. Admin consent granted once means no user ever sees a
consent screen. It offers two routes because whether a 4flow user may register
an app at all is question two below.

## Option B. The browser holds the access token

A second registration with the platform `Single-page application`. Authorisation
code with PKCE and no secret at all. The Entra token endpoint answers cross
origin for that platform so the browser exchanges the code itself.

This is materially cheaper than the same option was for Jira. Atlassian requires
the secret at its token endpoint so that option still needed one API route. Here
there are none. No credential is stored. No KMS key is used. No link item is
written. No Lambda is added.

The cost is in `infra/lib/tracker-stack.ts`. The `connect-src` list gains
`https://graph.microsoft.com` and `https://login.microsoftonline.com`.

A refresh token issued to an `spa` redirect URI expires after twenty four hours
and every token acquired with it carries that same expiry forward. So the flow
is rerun interactively once a day. It is usually a reload rather than a prompt
and it is not always. The reminder mail can carry nothing because no server
holds a token.

This is the smallest thing that proves the screen is worth having. It is not the
Jira shape and it does not become the Jira shape later without the work of
option A being done anyway.

## Option C. One application permission over every mailbox

`Calendars.ReadBasic.All` granted as an application permission with tenant admin
consent. `Calendars.Read` as an application permission would carry every
appointment body in the tenant and nothing here needs one. The function
authenticates as itself with client credentials and reads `/users/<upn>`. No
consent and no linking and a new starter is served on their first sign in.

Exchange Online can narrow it. `New-ApplicationAccessPolicy` restricts an
application permission to the members of one mail enabled security group. So the
blast radius is a group somebody maintains rather than the tenant.

The costs are why this is not the recommendation. One credential reads the
calendar of everyone in that group and the tracker becomes where it lives. A
calendar is read without the person approving it. At a German employer that is a
works council question before it is an engineering one.

## Option D. A flow pushes from Microsoft 365

A scheduled Power Automate flow reads the calendar and posts the month to the
tracker. No Microsoft credential is held in AWS.

Two costs stand out. A flow under a service account needs the same tenant wide
read that option C needs. A flow per user means every user builds one and that
does not ship.

The tracker API also needs a machine caller. The Cognito JWT authorizer has no
path for one today. That is the same wall option D hit in `docs/jira.md`.

## Option E. A published calendar URL

Outlook publishes a calendar as an ICS URL. The tracker fetches it per user.

Do not ship it. The URL is an unauthenticated bearer credential for a whole
calendar and it carries every subject in full. It cannot be scoped to a month.
Revoking it means republishing for every consumer.

Published at the availability only level it carries times without subjects. That
removes the leak and removes every signal attribution needs. So it is safe and
useless in the same move.

## Comparison

| | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| Microsoft credential at rest | refresh token per user and one secret | none | one for the tenant | one for the tenant | a URL per user |
| Refresh token life | ninety days | twenty four hours | none held | none held | none held |
| User consents | once or never under admin consent | once then a run of the flow every day | never | never | publishes a calendar |
| Works on a first sign in | after linking | after linking | yes | yes | after publishing |
| Reminder mail can carry the month | yes | no | yes | yes | yes |
| New administrator request | registration and admin consent | registration | permission and consent and an access policy | licence and consent and a flow | none |
| CSP change | no | yes | no | no | no |
| New API routes | four | none | two | two | two |
| New Lambda | yes | no | yes | no | yes |
| Reads a calendar without approval | no | no | yes | yes | no |
| Looks like the Jira reader | yes | no | part | no | no |

## Recommendation

Run the probe. Nothing else starts until rows two and four and five of that
table carry numbers. Because a) the whole feature rests on attributing meetings
to projects and no measurement says that is possible b) the slow cost of every
option is a request to 4flow IT and that request should not be sent twice c)
Graph Explorer costs an afternoon and no approval.

Then option A. It is the Jira reader with a second provider behind it. The
token rotation is written. So is the KMS cipher. So is the per user link item.
So are the three tables of the screen. Because a) the reminder mail can
only carry a month where a server holds a token and option A is the only
delegated option that holds one for longer than a day b) option B needs an
interactive run of the flow every twenty four hours and that is a worse
experience than the one time consent c) the work option B saves is the four
routes and one of the two registrations and it saves none of the screen.

Build the absence half of option A first. An all day `oof` block maps to
`Vacation or sickness` with no guessing anywhere in the path. It needs no
category and no series answer and no subject. It is the only part of this
document that cannot be wrong. It is also the part a person most often forgets
to enter. The transport under it is option A either way so nothing is thrown
away.

Then the attribution half only if the probe says it lands. If rows two and four
come back low then the absence half ships alone and the meeting list is read
only.

Options C and D read a calendar without the person approving it. That is a
different conversation and it is not an engineering one.

`docs/todo-outlook-option-a.md` is the build order.

## Open questions

1. What does a month actually hold. Run the probe. Every other question is
   cheaper than this one.
2. Does the tenant let a user consent to an app or does 4flow IT hold that. It
   changes who sends `docs/outlook-admin.md` and not what it asks for.
3. Is the 4flow UPN the email address Identity Center sends. Option C needs it
   and options A and B do not.
4. Which zone does each work location sit in. `Europe/Berlin` is the fallback
   and the catalogue upload is where the map would live.
5. A meeting titled `PLRS-901 review` and the ticket `PLRS-901` both propose
   time for the same work. Merged or double counted or does one win.
6. Where does a non all day `oof` event go. Half a day of absence is a thing
   the tracker can express and nothing here decides it.
7. One page per source or one page merging Jira and Outlook. Question five has
   to be answered first.
8. Does anybody keep a second calendar. It changes `/me/calendarView` into a
   loop over `/me/calendars`.

## Closed questions

Does `Calendars.ReadBasic` return `categories`. It excludes `body` and
`attachments` and `extensions`. `categories` is not one of them. The probe
confirms it because the documented wording is hedged.

Does an Entra confidential client refresh token survive being spent. Yes.
Microsoft documents that a refresh token replaces itself on every use and that
the old one is not revoked.

Does `Prefer: outlook.timezone` set the zone of the bounds. No. It sets the zone
of the answer alone and a bound with no offset is read as UTC.

Is the month a query parameter or a path segment. A path segment. No adapter
passes a query string to a handler.

A subject is shown and never written to a timesheet.

A private or personal or confidential event contributes its hours and withholds
its subject. It is not dropped.

The hours are measured and they still divide the month rather than fill it.
A calendar undercounts a month so it cannot fill one.

Two overlapping events are merged for the day total and split evenly between
themselves.

An all day event contributes no duration. Its `showAs` decides what it means.

Nothing is ever written back to Outlook.
