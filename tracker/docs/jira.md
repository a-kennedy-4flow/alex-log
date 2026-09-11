# Reading Jira into the tracker

The user opens a month and the tracker already lists the tickets they finished
in it. A ticket summary fills tracker column M. A ticket project proposes a
Workday ID. Nothing is ever written back to Jira.

## Terms

Five words below could be read more than one way. They are defined here once for
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

**Specification ticket.** The ticket carrying the `Cost Center Specification` a
work ticket books under. `COMM-23079 iTMS-4s Concept & Development` is one. It
is reached by the parent chain or by a link.

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

    "fields": ["summary", "project", "resolutiondate", "parent", "worklog",
               "issuelinks", "<internal cost center>",
               "<cost center specification>"]

`parent` is worth carrying. Column M takes the ticket summary so the epic is
never written to a timesheet. The screen shows it under each summary as context.
A ticket key alone says nothing about which piece of work it belonged to. The
parent key is carried beside the summary so the screen can link to it.

`worklog` rides along rather than costing a call of its own. See `Where the
hours come from`.

### The second query

A month is two searches rather than one.

    worklogAuthor = currentUser()
    AND worklogDate >= "2026-08-01"
    AND worklogDate <  "2026-09-01"

Neither set contains the other. A ticket closed this month may have been worked
in the one before it. A ticket worked all month may still be open. So both are
read and the union is what the screen receives. The closed set is taken first so
a ticket in both keeps its resolution date.

### The two cost centre fields

`Internal Cost Center` and `Cost Center Specification` are custom fields. They
are matched by name against `/rest/api/3/field` rather than by id. Because a) a
custom field id differs per Atlassian site so an id in the source would serve
one deployment. b) `read:field:jira` is already granted. c) the names are
business terms that outlive any one field.

The lookup runs once per container. A site holding neither field costs that one
call and nothing else.

A 4flow ticket rarely carries either field. The epic above it carries them for
everything beneath. So the parent chain is walked up to five deep and the ticket
the value came from is returned beside it. A user has to know a figure is
inherited before booking against it.

The walk is one search per depth rather than one call per ticket.

    key in (PLRS-900,PLRS-901,DEVH-4000)

So forty tickets under three epics cost one call. A site holding neither field
is not walked at all.

A value arrives as a number on one site and as a select option on another and as
a list of options on a third. All three state the same fact so all three are
read to one string. Blank is nothing rather than an answer.

On `4flow.atlassian.net` the two are `customfield_10084` and `customfield_10085`
as of 2026-09-10. The first is a float. The second is a labels field so every
value it holds is one word.

### The specification ticket a link names

986 issues carry `Cost Center Specification`. They are cost centre epics in
`COMM` and `TMS` and `CUS` and `TREX`. A person writes code in `PLRS` or `TORO`
and books against one of them. So the specification ticket is in a project of
its own and no parent chain of a work ticket reaches it.

The link does. `PLRS-1141 implements ECLIPSE-613` is one. So a ticket the parent
chain left without a specification has its links followed and the first linked
ticket carrying one answers. That ticket own parent chain is walked after it.

The cost centre of that ticket is taken as well where the chain named none.
Because a) a specification names one of the lists its own cost centre allows. b)
a work ticket in `PLRS` carries neither field so both come from the same place.
c) a chain that did name a cost centre keeps it because a ticket is the finer
statement than anything it links to.

A link costs no call of its own. `issuelinks` rides on the search that already
runs and every link of the month is read in one batched `key in (...)`. A month
whose parent chains answered every specification makes no call at all.

Nothing is written back. A link is read and never created.

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

The second and the third are both built. The second wins.

### The order the screen resolves in

`resolveCostCentre` in `packages/core/src/jira-cost-centre.ts` holds it. Four
answers in order.

1. A cost centre set against this one ticket. `jiraTickets` on the profile.
2. The Jira `Internal Cost Center` converted through the catalogue. The ticket
   itself or the nearest ancestor carrying one.
3. The project map on the profile. `jiraProjects`.
4. Nothing. The row is listed and never booked.

A ticket answer beats Jira. Because a) it is the one answer a person made for
that ticket on purpose. b) it is the only way to correct an epic carrying the
wrong cost centre for one ticket beneath it. c) it is set on a ticket Jira says
nothing about so it usually competes with nothing at all.

Jira beats the project map. Because a) a cost centre is per ticket and the map
is per project so Jira is the finer answer. b) an epic carries one for
everything beneath it so a whole release books correctly with nobody typing. c)
the map stays the answer for a project Jira says nothing about.

One project is not one cost centre. A 4flow project runs work for several of
them so the project map is a guess for every ticket of it. That is why the
answer offered on an unresolved row is written against the ticket. The project
map is still offered under the table for a whole project at once.

The order is the same before and after a reload. A pick made on the screen used
to outrank Jira until the page was read again and rank third after it. So the
same answer resolved two ways.

### The specification the row books

`resolveSpecification` in `packages/core/src/jira-cost-centre.ts` holds it. The
cost centre is answered first because it owns the list. Three answers follow.

1. The Jira label read into that list. `matchSpecification` does the reading.
2. The first specification the cost centre allows. What a hand typed row starts
   with.
3. Nothing. A cost centre whose range the workbook leaves empty has nothing
   that applies by right so a blank stands.

A label outside the list answers nothing and is reported on the row. Because a)
the cost centre owns the list so a value outside it cannot be booked. b) the
field also holds a cost centre number somebody typed into the wrong box and
`CUS-2479` carries exactly that. c) the nearest entry would be a guess booking
time against work nobody did.

### Reading a label into the workbook list

Jira holds the specification as a labels field so no value carries a space. The
workbook writes the same fact three other ways.

| Jira label | Workbook specification |
| --- | --- |
| `4s_Overheads_Concept_&_development` | `4s_Overheads_Concept & development` |
| `4s_changeRequest` | `4s_Change request` |
| `Overheads` | `Overheads` |

Both sides are lowercased and every character that is not a letter or a digit
is dropped. All three then agree. The 38 specifications the workbook holds stay
distinct under it and a test pins that.

### Grouping by the pair

A group is a Workday ID and a specification rather than a Workday ID. Because
a) a timesheet row holds both so a group holding two specifications could book
only one of them. b) cost centre `21111` runs `4s_Overheads_Concept &
development` and `4s_Overheads_Product operations` and nine more. c) the
specification a group drops is the one nobody would notice was missing.

The share editor keys on the pair for the same reason. The intro still counts
Workday IDs because that is what it says.

### Where an answer is kept

`jiraTickets` on the profile. One ticket key to one Workday ID. `PUT /api/me`
holds it to a ticket key and to a Workday ID the catalogue offers exactly as it
already holds the project map. The bound is five hundred rather than fifty
because a ticket is answered once and kept and a month holds forty of them.

### The conversion

`workdayIdForCostCentre` in `packages/core/src/catalogue.ts` does it. Three keys
are tried in order against the shipped project list.

| Key | Example | Answer |
| --- | --- | --- |
| `costCentre` | `99980100` | `10100` |
| `projectNo` | `99980100` | `10100` |
| the Workday ID itself | `7713022` | `7713022` |

The list carries 1873 distinct cost centres and every one of them resolves.
Eight name more than one Workday ID. The first row wins because XLOOKUP in the
tracker also returns the first match.

`0` and blank are absence rather than a value. 1276 rows carry a cost centre of
`0` and the picker already skips it.

The index is built from every row rather than from the deduplicated ones. The
350 repeated Workday IDs differ only in cost centre and project number so
building it from the kept rows would lose exactly the numbers it exists to find.

A number the catalogue never heard of converts to nothing. The profile map then
answers. Nothing is guessed.

Such a number is reported on the row rather than swallowed. Because a) the
figure the row books against is not the Jira one. b) saying nothing would read
as Jira carrying no cost centre. c) correcting it in Jira is somebody business
and they cannot correct what they cannot see.

### Where it runs

In the browser rather than in the Jira function. That function never loads the
catalogue and `lambda.ts` keeps it that way. So the answer the API returns
carries the Jira cost centre unconverted and `useJira.ts` converts it. The
specification label is carried the same way and matched there.

## The screen

A page of its own at `/jira`. Not a band of the month sheet. Its layout is H1 of
`mockups/index.html`. It holds three things in one column.

A list of last month tickets. One row each. The key then the summary then the
Workday ID it books against then the hours.

Under the Workday ID in smaller writing is where its cost centre was found. One
sentence of five. `Cost centre 99980100 on this ticket` and `Cost centre
99980100 from PLRS-900` and `Cost centre you set on this ticket` and `Cost
centre you set for PLRS` and `No cost centre on this ticket or any epic above
it`. A cost centre read off an epic reads exactly like one written on the ticket
until the screen says which it was.

Beside the Workday ID is the specification the row books. Under it in smaller
writing is where that came from. One sentence of five. `Specification on this
ticket` and `Specification from COMM-23080` and `Default specification of this
cost centre` and `This cost centre names no specification list` and `Jira says
9963711 on CUS-2479 which this cost centre does not allow`.

A turning ring stands beside the line while the month is read. Reading one
costs several searches against Atlassian so the wait is long enough to look
like a dead page. The line alone reads the same whether the request is in
flight or finished. So the turning is what says data is still moving.

`LoadingRing.vue` draws it. The fill button carries the same ring while it
writes. One component rather than a rule per page because the `role` and the
reduced motion rule are what a copy drops.

A row nothing answered carries a cost centre picker in place of the figure. It
writes to the ticket rather than to the project and it saves the moment it is
chosen. So a ticket Jira says nothing about is answered where it is read.

The key opens the ticket at `https://4flow.atlassian.net/browse/<key>`. That
host is answered by `GET /api/jira/link` as `siteUrl` rather than compiled into
the browser bundle. Because a) the screen already takes its client id and its
callback from that route. b) the API host `api.atlassian.com` answers no browse
address so the host a person opens is configuration of its own. c) a deployment
naming no site answers an empty one and every key then stays plain text.

A table grouped by the Workday ID and the specification together. One row each.
It sums the hours of the tickets under it.

A table of days under that. It converts each hour total to days and rounds up to
the nearest half day. The rule is `ceil(hours / halfDay) / 2`.

A half day is the working day halved rather than a fixed four hours. The length
is held on the profile. A six hour day makes the half day three. Because a) a
fixed four hours books somebody on a six hour day a whole day for half of one.
b) the number divides the hours of every ticket so it decides what is submitted.
c) nobody but the user knows how long their day is.

A button reading **Fill the month timesheet** closes the page. It copies the
days across and writes each ticket summary into column M.

Rounding up runs per group rather than once on the total. So the rounded total
is almost always larger than the true one. Two groups holding one hour each
become one whole day. Both figures are shown. Because a) the user is
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

Reading worklogs is nearly free. `fields=worklog` returns the first twenty per
issue with the count of all of them. Twenty covers almost every ticket of a
month so almost every ticket is answered by the search that found it. Only a
ticket holding more costs a call of its own and `MAX_WORKLOG_READS` bounds how
many of those one month may make.

Jira inlines the oldest worklogs first. So a ticket holding more than twenty is
never read from its inline set. Reading it would report the wrong days.

`worklog` in `JIRA_HOURS_FIELDS` now decides where the hours figure comes from
and nothing else. The worklog search and the account lookup both run either way.
Because a) the day breakdown is what the screen shows. b) the union of the two
searches decides which tickets a month holds at all. c) a worklog carries its
author so this user hours cannot be told from anybody else without the account.

### The day breakdown

Every ticket carries the hours this user logged against it keyed by day.

    "days": { "2026-08-03": 3.5, "2026-08-04": 4 }

A worklog somebody else wrote is dropped. So is one outside the month. A shared
ticket would otherwise report the whole team hours as one person own.

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
the eighteen granular scopes of the table below. The authorize URL asks for
`offline_access` as well. That value is not a Jira scope so the console does not
list it. It is what makes Atlassian return a refresh token.

### The scopes

Granular rather than classic. Atlassian recommends classic and is overruled
here. Because a) `read:jira-work` also grants every attachment and comment this
app never reads. b) three calls fix the granular list so it cannot drift. c) the
consent screen then names what is read.

The tracker makes four calls. Each row says which of them the Jira REST API
lists the scope against.

| Scope | What needs it |
| --- | --- |
| `read:issue-meta:jira` | nothing today |
| `read:issue:jira` | nothing today |
| `read:issue.property:jira` | nothing today |
| `read:issue-details:jira` | the JQL search |
| `read:issue.time-tracking:jira` | nothing today |
| `read:field:jira` | the JQL search then the field lookup |
| `read:field.default-value:jira` | the JQL search |
| `read:field.option:jira` | the JQL search |
| `read:user:jira` | `myself` then the worklog read |
| `read:application-role:jira` | `myself` |
| `read:avatar:jira` | `myself` then the worklog read then the field lookup |
| `read:group:jira` | `myself` then the JQL search then the worklog read |
| `read:issue-worklog:jira` | the worklog read |
| `read:issue-worklog.property:jira` | the worklog read |
| `read:project-role:jira` | the worklog read |
| `read:field-configuration:jira` | the field lookup |
| `read:project:jira` | the field lookup |
| `read:project-category:jira` | the field lookup |

Fourteen are required. The four that read a single issue by key and its
properties and the site time tracking configuration are called by nothing. A
parent is read through a `key in (...)` search rather than by key so the cost
centre walk did not change that. They are granted so the consent screen never
has to be shown twice. Drop them from `packages/core/src/jira-scopes.ts` and
from the console to shorten it.

The table is derived rather than reasoned about. `ENDPOINT_SCOPES` in
`packages/core/src/jira-scopes.ts` holds what the REST API lists per call and a
test asserts the grant covers all of it. Because the last three rows were learnt
from a 401 in production instead.

A scope list is taken whole for the endpoint that lists it. Three of the five on
`/rest/api/3/field` are named after a project rather than a field. So reading
the name of a call and picking the scope that looks like it is how a grant ends
up short.

Atlassian answers a token short of a scope with 401 rather than 403. The client
reads a 401 as a token that has gone. So the screen says the connection has
expired and offers a relink. A relink cannot add a scope so it succeeds and the
next read fails the same way. Nothing in that loop names the fault. The log line
is the only thing that does.

`avatar` and `group` and `project-role` and `application-role` look unrelated to
a timesheet. They are the expansions Jira attaches to a user it returns. A
worklog carries its author so reading one reads a user.

The authorize URL is then this.

    https://auth.atlassian.com/authorize
      ?audience=api.atlassian.com
      &client_id=wJiihW00HOrSowAzpyBcDjWOj7vUMAXz
      &scope=read%3Aissue-meta%3Ajira%20read%3Aissue%3Ajira%20read%3Aissue.property%3Ajira%20read%3Aissue-details%3Ajira%20read%3Aissue.time-tracking%3Ajira%20read%3Afield%3Ajira%20read%3Afield.default-value%3Ajira%20read%3Afield.option%3Ajira%20read%3Auser%3Ajira%20read%3Aapplication-role%3Ajira%20read%3Aavatar%3Ajira%20read%3Agroup%3Ajira%20read%3Aissue-worklog%3Ajira%20read%3Aissue-worklog.property%3Ajira%20read%3Aproject-role%3Ajira%20read%3Afield-configuration%3Ajira%20read%3Aproject%3Ajira%20read%3Aproject-category%3Ajira%20offline_access
      &redirect_uri=https%3A%2F%2Ftracker.4flow.io%2Fjira%2Fcallback
      &state=<one value bound to this user>
      &response_type=code
      &prompt=consent

The console generates that URL without `offline_access`. Appending it is the one
edit. A refresh token carries the scopes it was granted so a user linked under
the classic pair consents again.

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

A fifth rule was added after the first deployment. Only a refusal that names
`invalid_grant` ends a link. That is what Atlassian answers for a refresh token
which has been spent or revoked. Every other reason on that grant is the client
id and the client secret being rejected so the stored token was never at fault.
Deleting the link then costs the user a consent that fails the same way. The
screen is told 502 with the reason and no relink is offered. `refusedTheTracker`
in `apps/api/src/jira.ts` holds the test.

This was found the hard way. A container that started before the client secret
was corrected holds the old one for its whole life. Every hour it wiped a
working link and the screen asked the user to connect again. A relink through a
newer container then succeeded which made the fault look intermittent rather
than deployed.

The monthly reminder gains the ticket list. That is the strongest argument for
this option. `reminder.ts` already runs on a schedule and already reads every
user.

A user who never consents sees the panel offer to link. A revoked consent
returns 401 and the stored token is dropped on the spot.

A refusal on the exchange is a different thing. The token endpoint returns 400
or 401 for a code already spent. It returns the same for a wrong client secret.
It returns the same again for a redirect the developer console never registered.
None of those is a consent that lapsed because the exchange is the call that
would create one. So the body is read for `error` and `error_description` and
the answer is 400 carrying that reason. The screen prints it under
`jira.consentFailed` and offers no relink. Every refusal is logged either way
because the status alone tells nobody which of the three it was.

`access_denied: Unauthorized` on the screen is that reason and it means the
exchange rather than the consent. A code came back so the scopes and the app
approval and the access rules are all settled. Atlassian is refusing the client
credentials.

The usual cause is the secret. CDK creates `tracker/jira` with a random
password of its own so an unfilled secret reads as a filled one. Put the console
value in it and force new containers. `secretReader` holds what it read for the
life of the container so a retry alone proves nothing.

Ask the Atlassian administrator to confirm one thing. External app access rules
must permit a customer OAuth app to read Jira. An administrator can block that
site wide.

### Reading another account for a test

The account this was built on holds seven closed August tickets, no worklog and
no cost centre. So the hours path and the cost centre path cannot be seen
against it. `JIRA_AS_USER` on the local server reads the month of another
Atlassian account instead.

    JIRA_CLIENT_ID=wJiihW00HOrSowAzpyBcDjWOj7vUMAXz \
    JIRA_CLOUD_ID=792ba525-6efc-4a5f-80f4-b9269516a256 \
    JIRA_CLIENT_SECRET="$(aws secretsmanager get-secret-value \
      --secret-id tracker/jira --query SecretString --output text)" \
    JIRA_AS_USER=712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c \
    pnpm dev:api

A client secret is what turns the local server from the double to the real
client. Without one `FakeJira` answers and `JIRA_AS_USER` is refused at startup
rather than ignored. Because the double serves one fixed month of one fixed
account so a switch with nothing behind it would answer as though the account it
named looked like that.

### The same switch in the browser

The Jira screen carries a dashed field reading **jira as**. It sets the account
for one request rather than for the whole server so the account can be changed
without a restart. `x-dev-jira-as-user` is the header it sends.

It renders where `import.meta.env.DEV` is true and no user pool is configured.
So the deployed bundle never carries it. The deployed API ignores the header
either way because only the local server reads a caller out of headers at all.

`jira-dev.ts` holds the reading. Nothing in `lambda.ts` imports that file or
`local.ts` so `build.mjs` cannot bundle either.

Three rules sit on it.

An id that is not an account id is refused with 400 rather than dropped.
Because a) a dropped one reads as the switch never having worked. b) the id
reaches JQL inside quotes. c) `ATLASSIAN_ACCOUNT_ID` in `packages/core/src/dev.ts`
is the one copy of the rule so the field and the server cannot disagree.

The header against the double is refused the same way `JIRA_AS_USER` is refused
at startup. The field says so before the request is made.

The stored month is hidden from a read of another account and none is left
behind. Because that cache rides on the link of the caller and it is keyed by
period alone. So the tickets of the account read before would be served again
for the next one and the switch would show the wrong month for up to a day. The
rest of the record still lands because a refresh token that rotated during the
read is the rest of it.

One client is built per account rather than per request. The two cost centre
field ids are looked up once per client so a client per request would spend that
call on every month read.

The field renders above every branch of the screen rather than inside the linked
one. Because a refused header reaches the link route as well and a control the
linked layout alone carried would be the one thing that refusal hid.

The consent screen is the real one. `http://localhost:5173/jira/callback` is a
registered callback on the app so nothing in Atlassian has to change. The link
is held in memory so `vite-node --watch` drops it on every edit and the consent
has to be given again.

An account id is on the profile URL in Jira. `.../jira/people/<account id>`. It
is also on the assignee of any issue the API returns.

The switch is not impersonation and it grants nothing. The search carries the
token of whoever consented on that machine so it returns what that person may
already browse and nothing more. `assignee = currentUser()` becomes
`assignee = "<account id>"` and so does `worklogAuthor`. `/rest/api/3/myself` is
then not called at all because the account is already named and asking would
name the wrong one.

It lives in `apps/api/src/local.ts` and nowhere else. Because a) `build.mjs`
bundles from `lambda.ts` and nothing there reaches that file so no deployment
can carry the switch. b) that file already refuses to run in production. c) a
route or an environment variable on the deployed function would point every user
of one deployment at one account.

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
   rules. The first consent that completes is the proof. `docs/jira-admin.md` is
   the request to send to the administrator.
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
