# Todo — Outlook option A

Option A of `docs/outlook.md`. Each user consents once. A Lambda of its own
holds their refresh token and reads the calendar of the month they are filling.
A screen at `/outlook` groups those events and fills the month from them. Its
layout is the three tables of `/jira`. The terms are defined in that page and
not again here.

It is the Jira reader with a second provider behind it. `The Jira file beside
the Outlook one` in `docs/outlook.md` names the counterpart of every file. Where
a step below is the Jira step with two names changed it says so.

The order below is the build order. Section 1 can invalidate the whole plan so
it runs first. Sections 7 and 8 ship the absence half on their own. Section 9
onwards is the attribution half and section 1 decides whether it is built at
all.

## 1. What must be true first

- [ ] Run the probe in Graph Explorer at
      `developer.microsoft.com/graph/graph-explorer`. Sign in as a 4flow user
      and run the `calendarView` query of `docs/outlook.md` against one closed
      month. Fill every row of the unmeasured table in that document. Nothing
      below is funded until it carries numbers.
- [ ] Read the two rows that decide the feature. How many events sit in a series
      and how many name a ticket key. A month of one off meetings each needing
      its own answer is slower than `/quick` which already ships. Stop at the
      absence half if those rows come back low.
- [ ] Confirm in the same probe that `categories` comes back. The documented
      exclusions of `Calendars.ReadBasic` are `body` and `attachments` and
      `extensions` and the wording is hedged with `such as`. A missing category
      means asking for `Calendars.Read` instead and `$select` still never names
      a body.
- [ ] Confirm in the same probe that the bounds behave as documented. Send
      `2026-08-01T00:00:00%2B02:00` and then send `2026-08-01T00:00:00` and
      compare the first and last event of each. The second is read as UTC so it
      should differ by two hours at both ends.
- [ ] Ask 4flow IT whether a user may consent to an app registration themselves
      or whether the tenant requires admin consent. It changes who sends
      `docs/outlook-admin.md` and not what it asks for.
- [ ] Ask which work locations exist and which zone each sits in. `Europe/Berlin`
      is the fallback. One record in the catalogue upload holds the map.
- [ ] Confirm nobody objects to the tracker holding a token that reads a
      calendar as the user. The scope is read only and the user grants it
      themselves. Ask anyway. Because a) a calendar is more personal than a
      ticket list b) `docs/mail.md` set the same expectation for what the
      application may do on its own c) the answer is cheap now and expensive
      after the build.
- [ ] Do not ask for an application permission. Option C reads a calendar
      without the person approving it and that is a works council question
      rather than an engineering one. `docs/outlook.md` says why.

## 2. The Entra app

- [ ] Register one single tenant app in Entra ID. Name it Tracker.
- [ ] Set the platform to `Web`. Not `Single-page application`. The `Web`
      platform is what makes the token endpoint require the secret so no token
      ever reaches the browser.
- [ ] Add two redirect URIs. `https://tracker.4flow.io/outlook/callback` and
      `http://localhost:5173/outlook/callback`. Entra allows no wildcard so both
      are listed exactly as the Atlassian app already lists both.
- [ ] Add two delegated permissions and no more. `Calendars.ReadBasic` and
      `offline_access`. A write permission must never appear.
- [ ] Do not add `User.Read`. `me` resolves from the token and nothing here
      reads a profile.
- [ ] Request tenant admin consent for the two. Granted once it means no user
      ever sees a consent screen.
- [ ] Create one client secret. Record its expiry. Entra caps a secret at two
      years so the expiry is a diary entry rather than a surprise.
- [x] Written. `docs/outlook-admin.md` in the shape of `docs/jira-admin.md`.
      It names the registration. It names the two permissions. It names the
      three tenant settings that can block it. Send it as it stands.
- [ ] Send it. Two routes are offered in it. Either 4flow IT grants the
      Application Developer role and we register the app or they register it and
      make us an owner. Admin consent is theirs either way.
- [ ] Paste the tenant id and the client id into the two blank rows of
      `docs/outlook-admin.md`. Neither is a secret. Nobody has read either yet.
      Then copy both into `infra/lib/tracker-stack.ts` beside `JIRA_CLOUD_ID`.

## 3. The function and the stack

The reader is a fourth function beside `main` and `reminder` and `jira`.
`docs/outlook.md` says why. Every step here is the section 3 step of
`docs/todo-jira-option-a.md` with `jira` read as `outlook`.

- [ ] Export `outlook` from `apps/api/src/lambda.ts`. One bundle still carries
      every handler. `build.mjs` bundles `src/lambda.ts` once.
- [ ] Answer 404 from every route where `OUTLOOK_CLIENT_ID` is empty. So the
      stack deploys before the Entra side exists. The `jira` export at
      `lambda.ts` already does exactly this.
- [ ] Add the fourth function in `infra/lib/tracker-stack.ts`. It points at the
      same asset and the `outlook` export.
- [ ] Add the route `/api/outlook/{proxy+}` with its own integration under the
      JWT authorizer that is already built.
- [ ] Give it the same short timeout the Jira function takes. It waits on Graph
      rather than on the browser.
- [ ] Add a Secrets Manager secret named `tracker/outlook`. Write no value to it
      from CDK. A secret written by CDK sits in the template and in every
      CloudFormation event.
- [ ] Put the client secret in it by hand after the first deploy. Then read the
      first characters back and check it is the Entra value rather than the
      random one CDK generated.

          aws secretsmanager put-secret-value --secret-id tracker/outlook \
            --secret-string '<the client secret from Entra>'
          aws secretsmanager get-secret-value --secret-id tracker/outlook \
            --query SecretString --output text | cut -c1-6

- [ ] Force new containers after filling it. `secretReader` holds the value for
      the life of the container so a retry can fail on a secret already fixed.
- [ ] Add a second customer managed KMS key. It encrypts the Microsoft refresh
      token. A key of its own rather than the Jira one. Because a) the two
      functions are separate so neither role may decrypt what the other holds
      b) revoking one provider must not touch the other c) a key is about a
      dollar a month.
- [ ] Grant the secret and the key to the Outlook function alone. The API role
      and the Jira role must gain neither.
- [ ] Grant the Outlook function read and write on the table. It touches the
      `OUTLOOK` item and nothing else.
- [ ] Add the environment variables. `OUTLOOK_CLIENT_ID` then `OUTLOOK_TENANT_ID`
      then `OUTLOOK_SECRET_ARN` then `OUTLOOK_KEY_ARN`.
- [ ] Keep the client id in the stack rather than in the SPA bundle. Serve it
      from `GET /api/outlook/link` the way `GET /api/jira/link` already serves
      the Atlassian one.
- [ ] Change no line of the content security policy. The consent redirect is a
      top level navigation which neither `connect-src` nor `form-action`
      governs. Every Graph call is made by the function. Extend the comment at
      `infra/lib/tracker-stack.ts:244` so it names Microsoft beside Atlassian.
- [ ] Add what this costs to `docs/budget.md`. Forty cents a month for the
      second secret. A dollar a month for the second key. The function runs when
      somebody opens the screen so its own cost rounds to nothing.

## 4. Storage

`apps/api/src/repository.ts` then `apps/api/src/dynamo.ts`.

- [ ] Extend the item map at the top of `repository.ts` with the new row.
      `USER#<sub>` and `OUTLOOK`. That comment is the only record of the key
      layout.
- [ ] Reuse `StoredJiraLink` under a provider neutral name rather than declaring
      a second shape. Every field it carries is needed again. The refresh token
      as ciphertext. The previous refresh token. The access token and its
      expiry. The claim and the generation. The cache.
- [ ] Make `accountId` nullable. Atlassian needed one. A delegated Graph read
      does not because `me` resolves from the token.
- [ ] Take a provider argument on `getJiraLink` and `putJiraLink` and
      `deleteJiraLink` and `putJiraLinkIfUnchanged` and the claim call. Rename
      each to drop `Jira`. Update `MemoryRepository` and `DynamoRepository` and
      every call site.
- [ ] Hold the month cache in the nested field the way `StoredJiraLink.cache`
      already does. A read of the link is then a read of the cache.
- [ ] Reuse `TICKET_CACHE_CLOSED_MS` and `TICKET_CACHE_CURRENT_MS` under a
      provider neutral name. A day for a closed month. Fifteen minutes for the
      current one. Neither constant is Jira specific.
- [ ] Add a cache version beside the stored events the way
      `TICKET_CACHE_VERSION` guards the ticket shape. Raise it whenever the
      event shape gains or loses a field.
- [ ] Write no `expiresAt` on the item. The table expires a sheet after six
      months. A link must outlive that or every user relinks twice a year.

## 5. The token file

`apps/api/src/jira-tokens.ts` becomes `apps/api/src/oauth-tokens.ts`. It is
generalised rather than copied. `docs/outlook.md` says why.

- [ ] Rename the file and narrow `TokenDeps.jira` to an interface carrying the
      grant and the refresh alone. The completed ticket read has no business in
      a token file.
- [ ] Keep all four rules of the rotation guard. The cached access token. The
      previous refresh token. The claim lease. The generation counter.
- [ ] Keep them even though Entra is kinder. Microsoft documents that a refresh
      token replaces itself on every use and that the old one is not revoked. So
      the race Atlassian loses is not lost here. The guard is already written
      and a revoked token and an expired token both still arrive.
- [ ] Update the file comment. It currently explains the Atlassian rotation as
      the reason the guard exists. Say that Atlassian needs it and that Entra
      does not and that one implementation serves both.
- [ ] Move `apps/api/src/__tests__/jira-tokens` coverage onto the generalised
      file so both providers exercise the same guard.

## 6. The Graph client

New file `apps/api/src/outlook.ts`. It follows `apps/api/src/jira.ts`. One
interface in front of one service so a handler never holds a client.

- [ ] Declare `Outlook` with three methods. Exchange a code. Refresh a token.
      Read the calendar view of one period.
- [ ] Declare `CalendarEvent`. The immutable id then the subject then the start
      then the end then the all day flag then `showAs` then the categories then
      `sensitivity` then `type` then `seriesMasterId` then the tentative mark.
- [ ] Implement `GraphOutlook`. It reads the secret once per container the way
      `AtlassianJira` and `dynamo.ts` and `cognito.ts` already do.
- [ ] Exchange and refresh both post to
      `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`.
- [ ] Send the client secret and the PKCE verifier on the exchange. Entra
      accepts both on one request.
- [ ] Send `scope=offline_access Calendars.ReadBasic` on the refresh as well.
      Entra scopes a refresh by request rather than by grant.
- [ ] Build the bounds with an offset computed for the first instant of the
      month in the user zone. Encode the `+` as `%2B`. A bare `+` in a query
      string decodes to a space.
- [ ] Reuse the `Intl` call at `apps/api/src/reminder.ts:66` for the offset. It
      already reads a local date out of an instant and a zone.
- [ ] Send both `Prefer` headers. `outlook.timezone` for the answer and
      `IdType="ImmutableId"` for the ids. Neither is optional. A default event
      id changes when the item moves so an answer keyed on one is lost.
- [ ] Name the twelve fields in `$select`. Never name `body` or `bodyPreview` or
      `attachments` under any option.
- [ ] Follow `@odata.nextLink` until it stops. Take `$top=250`. A month of five
      meetings a day is one hundred events so one page is not safe to assume.
- [ ] Sort by start in our own code. Graph documents no order for
      `calendarView`.
- [ ] Read the default calendar alone. `/me/calendarView`. A second calendar is
      question eight of `docs/outlook.md` and it is not built.
- [ ] Turn a 401 and a 403 and a 429 into the three refusals the screen can act
      on. `refusedTheTracker` in `apps/api/src/jira.ts` is the pattern. A
      revoked consent must read as relink rather than as an error.
- [ ] Write `apps/api/src/outlook-fake.ts` in the shape of
      `apps/api/src/jira-fake.ts`. Feed it the real events the section 1 probe
      returned with every subject replaced. Because a) the double should show
      what a linked user actually sees b) nothing in `lambda.ts` may reach it so
      it cannot arrive in the deployed artefact c) a convenient fiction hides
      the overlap and the all day rows that are the hard part.
- [ ] Build no `outlook-dev.ts`. The Jira as user switch reads another account
      with the consenting user token. The Graph equivalent answers only where
      the other person shared their calendar so the switch would mostly refuse.

## 7. The event rules

New file `packages/core/src/calendar-events.ts`. It sits in core so the browser
and the function and a test all read the same rules.

- [ ] Drop a `seriesMaster`. `calendarView` returns the occurrences so a master
      double counts.
- [ ] Drop `isCancelled`. It did not happen.
- [ ] Drop `responseStatus.response` of `declined`. It was not attended.
- [ ] Drop `showAs` of `free`. A free block is a note to self.
- [ ] Drop nothing else. Keep `busy` and `oof` and `tentative` and
      `workingElsewhere` and `unknown`. Treat `unknown` as `busy`. Keep an
      `exception` because it is an occurrence somebody moved and it still
      carries its `seriesMasterId`.
- [ ] Mark a row tentative from either field. `showAs` of `tentative` is the
      organiser saying so. `responseStatus.response` of `tentativelyAccepted` is
      this person saying so.
- [ ] Withhold the subject of a `private` or `personal` or `confidential` event
      and keep its hours. The row reads `Private appointment`. Do not drop the
      event. Dropping it leaves a hole in the day that nothing explains.
- [ ] Do not forget `confidential`. `sensitivity` has four values and the first
      draft of `docs/outlook.md` named three.
- [ ] Merge overlapping events for the day total with a sweep over the sorted
      starts. Split the merged span evenly among the events covering it.
- [ ] Test that a day of two fully overlapping one hour meetings totals one hour
      and books half an hour to each.
- [ ] Never let a day total exceed the working day of that profile.
      `hoursPerHalfDay` doubled is the bound.

## 8. Absence. The half that cannot be wrong

This section ships on its own. It needs no category and no series answer and no
subject.

- [ ] Ignore the duration of an `isAllDay` event. Its `showAs` decides what it
      means.
- [ ] Read the last day as the day before `end` rather than the day of it. Graph
      requires an all day event to start and end at midnight so one day of leave
      on the third reads as `end` the fourth. A naive read books two days for
      one.
- [ ] Map an all day `oof` block to `Vacation or sickness`. That label already
      arrives from the catalogue upload and `useTimesheet.ts:626` already totals
      it. No guess of any kind is made.
- [ ] List every other all day event and book none of it. Travel and a marker
      somebody dropped on a week are not eight hours of one project.
- [ ] Leave a non all day `oof` event unbooked and listed. It is question six of
      `docs/outlook.md` and nothing here decides it.
- [ ] Test a leave block spanning a weekend. Only the working days of it are
      booked. `packages/core/src/calendar.ts` already answers which days those
      are at that location.

## 9. The attribution

Only if section 1 says it lands. `packages/core/src/jira-cost-centre.ts` is
reused rather than copied.

- [ ] Resolve in the order `docs/outlook.md` states. The event answer then the
      series answer then a ticket key in the subject then a category then
      nothing.
- [ ] Parse a ticket key with `[A-Z][A-Z0-9]+-[0-9]+` and pass it to
      `resolveCostCentre`. Look the match up rather than trusting it. The
      pattern also matches `ISO-9001` and `Q4-2026` and `resolveCostCentre`
      already answers `none` for a project it cannot map.
- [ ] Return which of the five answered beside the Workday ID. The screen shows
      one sentence of five under each row. `CostCentreSource` is the existing
      shape for exactly this.
- [ ] Add `outlookEvents` and `outlookSeries` and `outlookCategories` to
      `UserProfile` in `packages/core/src/types.ts`. Three more
      `Record<string, string>` beside `jiraProjects` and `jiraTickets`.
- [ ] Key `outlookEvents` on the immutable id. Never on the default id.
- [ ] Bound them at two hundred series and five hundred events and one hundred
      categories. `readJiraMap` at `apps/api/src/handlers.ts:230` already takes
      a key pattern and a bound so pass it three more rather than writing a
      second validator. An immutable id needs a pattern of its own because it is
      neither a ticket key nor a project key.
- [ ] Write the answer against the series where the event has one and against
      the event where it does not. So a recurring call is answered once and
      never asked again.

## 10. The routes

New file `apps/api/src/outlook-handlers.ts`. It follows
`apps/api/src/jira-handlers.ts`.

- [ ] `GET /api/outlook/link`. Whether this user has linked. It also serves the
      client id and the tenant id the browser needs for the authorize URL.
- [ ] `POST /api/outlook/link`. The browser sends the code and the verifier. The
      function exchanges them and stores the ciphertext. No token reaches the
      browser.
- [ ] `DELETE /api/outlook/link`. Forget the token.
- [ ] `GET /api/outlook/events/<period>`. The month for one user. A path segment
      rather than a query. Because a) neither adapter passes a query string
      through to a handler b) `apps/api/src/jira-handlers.ts:179` already says
      so c) `/api/timesheets/<period>` addresses a month the same way.
- [ ] Validate the period against `PERIOD` from `repository.ts`. Answer 400 on
      anything else.
- [ ] Answer 409 with `linked: false` where the user has not linked.
      `jira-handlers.ts:119` is the existing wording.
- [ ] Write no timesheet from this function. The fill posts to
      `PUT /api/timesheets/<period>` on the API function which already
      validates every half day at `apps/api/src/handlers.ts:359`. A second
      writer is a second place for those rules to drift.
- [ ] Read no catalogue from this function. Answer Workday IDs and let the
      browser resolve the titles from the catalogue it already holds. That is
      the rule `jira-handlers.ts` states at the top of the file.
- [ ] Serve `apps/api/src/dev-server.ts` and `apps/api/src/local.ts` the same
      routes so the screen works with no Entra app at all.

## 11. The consent in the browser

New file `apps/web/src/lib/outlook.ts`. It is `apps/web/src/lib/jira.ts` plus
PKCE.

- [ ] Copy the verifier and the S256 challenge from `apps/web/src/lib/auth.ts`.
      It already runs PKCE against Cognito. `lib/jira.ts` does not because the
      Atlassian flow has none and its comment at line 61 says so.
- [ ] Keep three strings in `sessionStorage`. A verifier. A state. A return
      path. Nothing outlives the tab. `lib/auth.ts` says why.
- [ ] Handle `/outlook/callback` before the router mounts the way `lib/jira.ts`
      handles `/jira/callback`. No route of its own is declared.
- [ ] Handle the case where sign in carried the callback through its own
      redirect so the address bar holds `/auth/callback` while the Outlook one
      waits in the return path. `lib/jira.ts` already solved this.
- [ ] Add a development short circuit the way `consentUrl` does. A local client
      id enters the callback directly and `outlook-fake.ts` grants the token.
      Keep it out of a built bundle with `import.meta.env.DEV`.
- [ ] Add the four calls to `apps/web/src/lib/api.ts`. Nothing else talks HTTP.

## 12. The screen

New page `apps/web/src/pages/OutlookPage.vue` and composable
`apps/web/src/composables/useOutlook.ts`. The layout is the three tables of
`JiraPage.vue`.

- [ ] Declare the seventh route at `/outlook` in `apps/web/src/router.ts`.
- [ ] Update the opening comment of `router.ts`. It counts six screens today.
- [ ] Add the link to the navigation in `apps/web/src/App.vue`.
- [ ] Table one. The month events. The day then the subject then the hours then
      the Workday ID.
- [ ] Under each Workday ID in smaller writing say what answered it. One
      sentence of five.
- [ ] Show a cost centre picker in place of the figure where nothing answered.
- [ ] Mark a tentative row so a person can see which hours are soft.
- [ ] Show `Private appointment` where the subject is withheld.
- [ ] Table two. Grouped by Workday ID with the hours summed under it.
- [ ] Table three. The days. Reuse `groupByWorkdayId` and `hoursTotals` and
      `daysFromHours` from `packages/core/src/hours.ts`. Write no arithmetic.
      `daysFromHours` at line 135 is the `ceil(hours / halfDay) / 2` this screen
      needs.
- [ ] Show the measured hours and the rounded days both. Rounding runs per
      Workday ID so the rounded total exceeds the measured one.
      `hoursTotals.inflation` already reports the difference.
- [ ] Show the measured total against the month target. A calendar undercounts a
      month so the share divides the month rather than fills it.
- [ ] Never write a subject to a timesheet under any setting. Column M takes a
      Jira ticket summary and a calendar subject is not one.
- [ ] Add the eight locales. `apps/web/src/i18n/messages/` holds `cs` and `de`
      and `en` and `es` and `fr` and `hu` and `pt-BR` and `zh-CN`.

## 13. The fill

- [ ] One button reading **Fill the month timesheet**.
- [ ] Hand `allocationsFromGroups` to `packages/core/src/distribute.ts`. That is
      the same path `/jira` takes.
- [ ] Post the result to `PUT /api/timesheets/<period>`.
- [ ] Name the count of half days it will overwrite before it runs. Overwriting
      is the decision. Section `Decisions taken` says why.
- [ ] Refuse a month the tracker would reject rather than sending it. `fitsMonth`
      in `hours.ts` already answers whether the rounded days fit.

## 14. The reminder

- [ ] Carry the calendar month in the reminder mail beside the ticket count.
      `apps/api/src/reminder.ts` already takes an optional Jira block so take an
      optional Outlook one the same way.
- [ ] Accept that the reminder role then reads the second secret and the second
      key. Two roles hold each rather than one. That is the cost of putting the
      month in the mail and `lambda.ts` already states it for Jira.
- [ ] Skip a user who has not linked. Send them the mail without the figure.
- [ ] Do not send an absence figure to anybody. A mail saying somebody was on
      leave is a mail about a person rather than about a timesheet.

## 15. Tests and checks

- [ ] Test the drop filter row by row. One test per row of the table in section
      7.
- [ ] Test that a `confidential` event keeps its hours and loses its subject.
- [ ] Test the bounds. A Berlin January month sends `+01:00` and a Berlin August
      month sends `+02:00`.
- [ ] Test that a late meeting on the last day of the month lands in that month
      rather than the next.
- [ ] Test the all day end. One day of leave books one day.
- [ ] Test the overlap merge and the even split.
- [ ] Test the attribution order. Five tests for five answers.
- [ ] Test that a subject matching `Q4-2026` resolves to nothing rather than to
      a project.
- [ ] Test the rotation guard against the generalised token file with both
      providers.
- [ ] Test that a revoked consent reads as relink rather than as an error.
- [ ] Extend `apps/api/src/__tests__/reminder.test.ts` so a linked user and an
      unlinked user both get a message.
- [ ] Stub `fetch` behind `GraphOutlook` for anything the fake does not carry.
      `__tests__/jira.test.ts` is the pattern.
- [ ] Check that no test reaches the network. A test that passes only online is
      worse than no test.
- [ ] Run `pnpm -r test` then `pnpm typecheck` then `pnpm build`.

## Decisions taken

1. **Which option. A.** The per user consent held by a function of its own.
   Because a) it is the Jira shape so the token rotation and the KMS cipher and
   the per user link item are written already b) it is the only delegated option
   whose token outlives a day so it is the only one the reminder mail can read
   c) option B saves the four routes and one registration and saves none of the
   screen. It costs one registration request to 4flow IT and one secret and one
   key. Section 1 sends that request once.
2. **What ships first. The absence half.** An all day `oof` block maps to
   `Vacation or sickness` with no guess anywhere in the path. Because a) it is
   the only part of this plan that cannot be wrong b) it is the part a person
   most often forgets to enter c) it needs no probe result to be worth building.
   Sections 7 and 8 are it. The transport under it is option A either way so
   nothing is thrown away if section 9 never runs.
3. **What the fill does to a half day that is already booked. Overwrite.** The
   same answer `/jira` took. Because a) the fill is the fast path and a prompt on
   every run would make it the slow one b) a user who opens this screen has
   asked for the month to be filled c) refusing would leave the month half
   filled with no way to say which half. It costs work the user typed. Section
   13 pays that by naming the count before the button runs.
4. **What goes in column M. Not the subject.** The Workday ID is the whole of
   what the timesheet needs. Because a) the export reaches backoffice and a
   subject carries names and customers and sometimes a medical appointment b)
   `sensitivity` marks only some of what is sensitive because most people never
   set it c) the subject only helps the person recognise their own row on screen.
5. **Which id keys an answer. The immutable one.** `Prefer: IdType="ImmutableId"`
   is sent on every read. Because a) a default event id changes when the item
   moves between folders b) an answer keyed on one is then lost and the person
   is asked again c) the header costs nothing.
6. **Where the zone comes from. The work location.** Not one constant. Because
   a) the bounds carry their own offset and the offset decides which day an hour
   books against b) the tracker already books bank holidays per location c) one
   record in the catalogue upload holds the map. `Europe/Berlin` is the fallback
   and it is the only zone anybody has named.
7. **Whether the hours are measured. Yes and it changes nothing about the
   share.** An event carries a start and an end so this source measures what
   Jira could only be told. Because a) a month of meetings still sums to less
   than the month b) so the measured hours divide the month rather than fill it
   c) both figures are shown so nobody mistakes one for the other.
8. **Whether the token file is copied. No.** `jira-tokens.ts` is generalised
   into `oauth-tokens.ts`. Because a) the four rules guarding the rotation race
   are the expensive part of that file and they are not Atlassian specific b)
   two copies of a concurrency guard drift and only one gets the next fix c) it
   already takes its repository and its cipher and its clock as arguments. It
   costs a rename across `Repository` and every call site. Section 5 pays it.

## What this deliberately leaves out

1. **Writing to Outlook.** No event is created and none is moved and none is
   accepted. The permission makes it impossible rather than merely forbidden.
2. **Reading a body.** `$select` never names `body` or `bodyPreview`.
   `Calendars.ReadBasic` excludes them anyway. Both controls are kept because
   the fallback to `Calendars.Read` removes one of them.
3. **Mining the attendees.** An external attendee at a customer domain would
   name the client. An attendee list is other people data and guessing a cost
   centre from it is disproportionate to what is gained. The series answer
   already covers every recurring customer call.
4. **A second calendar.** `/me/calendarView` reads the default one. A person
   keeping a project calendar is read as though those meetings never happened.
   Question eight of `docs/outlook.md` and the section 1 probe measures whether
   anybody does this.
5. **`calendarView/delta`.** A second read of a closed month would return
   nothing at all. The cache already answers the same need.
6. **A KMS signed client assertion.** Entra accepts `private_key_jwt` and KMS
   can sign one so no credential would exist outside the key. A secret in
   Secrets Manager is the smaller first cut.
7. **Merging the Jira month and the Outlook month.** Two pages propose two
   months. A meeting titled `PLRS-901 review` and the ticket `PLRS-901` both
   propose time for the same work. Questions five and seven of
   `docs/outlook.md` decide it and both are open.
8. **An application permission.** Option C serves a new starter on their first
   sign in and reads a calendar without the person approving it. That is a
   different conversation.
