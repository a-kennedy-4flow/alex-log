# Todo — Jira option A

Option A of `docs/jira.md`. Each user consents once. A Lambda of its own holds
their refresh token and reads the tickets they completed last month. A screen at
`/jira` groups those tickets and fills the month from them. Its layout is H1. The terms are
defined in that page and not again here.

The order below is the build order. Section 1 can invalidate the whole plan so
it runs first.

## 1. What must be true first

- [x] Ask the Atlassian administrator whether external app access rules permit a
      customer OAuth 2.0 app to read Jira. A site administrator can refuse this
      for the whole site. Stop here if the answer is no. Option C or option D is
      then the only route. `docs/jira-admin.md` is the request to send. It names
      the app and the approval and the way to check that it worked.
- [x] Ask which Workday ID `PLRS` books against. Ask the same for `DEVH`. Two
      answers are enough to ship section 10 with real data.
- [x] Decide who types the hours. Nobody. A configured list of fields is
      searched in order instead. `JIRA_HOURS_FIELDS` holds it and it defaults to
      `worklog,timespent`. Which fields carry effort at 4flow is still in flux
      so it is one line of the stack to change.
- [x] Confirm nobody objects to the tracker holding a token that reads Jira as
      the user. The token is scoped to reading and the user grants it themselves.
      Ask anyway. Because a) it is a credential belonging to a person. b) the
      answer is cheap now and expensive after the build. c) `docs/mail.md` set
      the same expectation for what the application may do on its own.

## 2. The Atlassian app

- [x] Register one OAuth 2.0 integration at `developer.atlassian.com`. Name it
      Tracker.
- [x] Add the Jira API with the fifteen granular scopes `docs/jira.md` lists.
      Nothing else. A write scope must never appear.
- [x] Do not look for `offline_access` in that list. It is not a Jira scope and
      the console does not offer it. It belongs in the `scope` parameter of the
      authorize URL which section 8 builds.
- [x] Take the granular scopes rather than the classic ones. Atlassian
      recommends classic and is overruled. Because a) `read:jira-work` also
      grants every attachment and comment this app never reads. b) three calls
      fix the granular list so it cannot drift. c) the consent screen then names
      what is read. It costs fifteen lines on that screen instead of two.
- [x] Set the callback URL to `https://tracker.4flow.io/jira/callback`.
- [x] Add a second callback for `http://localhost:5173/jira/callback`. Because
      the consent flow cannot be exercised on the dev server without one.
- [x] Record the client id. It is not a secret. It travels in the authorize URL
      the browser follows.
- [x] Record the client secret once. Atlassian shows it one time.
- [x] Rotate that secret in the console. It was written to this file in plain
      text on 2026-09-07 before being cut out again. Treat it as spent. The
      replacement goes straight into Secrets Manager and into no file.

### The app as registered

| Field | Value |
| --- | --- |
| App id | `c2f96950-fe5f-40cf-a21b-7483ac8dde10` |
| Client id | `wJiihW00HOrSowAzpyBcDjWOj7vUMAXz` |
| Client secret | Secrets Manager at `tracker/jira`. Never here. |
| Callback | `https://tracker.4flow.io/jira/callback` |
| Scopes granted | the fifteen granular scopes of `docs/jira.md` |

The console builds an authorize URL and it is wrong for this app. It carries the
granted scopes alone. `offline_access` is missing so Atlassian returns an access
token good for one hour and no refresh token. Every month after the first would
then ask the user to consent again. The reminder of section 11 could never run
at all.

This is the URL to build. The only change is `%20offline_access` on the scope.

    https://auth.atlassian.com/authorize
      ?audience=api.atlassian.com
      &client_id=wJiihW00HOrSowAzpyBcDjWOj7vUMAXz
      &scope=read%3Aissue-meta%3Ajira%20read%3Aissue%3Ajira%20read%3Aissue.property%3Ajira%20read%3Aissue-details%3Ajira%20read%3Aissue.time-tracking%3Ajira%20read%3Afield%3Ajira%20read%3Afield.default-value%3Ajira%20read%3Afield.option%3Ajira%20read%3Auser%3Ajira%20read%3Aapplication-role%3Ajira%20read%3Aavatar%3Ajira%20read%3Agroup%3Ajira%20read%3Aissue-worklog%3Ajira%20read%3Aissue-worklog.property%3Ajira%20read%3Aproject-role%3Ajira%20read%3Afield-configuration%3Ajira%20read%3Aproject%3Ajira%20read%3Aproject-category%3Ajira%20offline_access
      &redirect_uri=https%3A%2F%2Ftracker.4flow.io%2Fjira%2Fcallback
      &state=<one value bound to this user>
      &response_type=code
      &prompt=consent

## 3. The function and the stack

The reader is a third function beside `main` and `reminder`. `docs/jira.md`
says why.

- [x] Export `jira` from `apps/api/src/lambda.ts`. One bundle still carries
      every handler. `build.mjs` bundles `src/lambda.ts` once.
- [x] Add the third function in `infra/lib/tracker-stack.ts`. It points at the
      same asset and the `jira` export.
- [x] Add the route `/api/jira/{proxy+}` with its own integration. Put it under
      the JWT authorizer that is already built. So the claims are verified before
      the function runs.
- [x] Give it a shorter timeout than `main`. It makes one outbound call and
      waits on Atlassian rather than on the browser.
- [x] Add a Secrets Manager secret named `tracker/jira`. Nothing writes a value
      to it. Because a secret written by CDK sits in the template and in every
      CloudFormation event.
- [ ] Put the client secret in it by hand after the first deploy. CDK does not
      leave it empty. A secret given no value is created with
      `GenerateSecretString` so it holds a random password of its own.

          aws secretsmanager put-secret-value --secret-id tracker/jira \
            --secret-string '<the client secret from the console>'

- [ ] Read it back and check it is the console value rather than the random one.
      Because a) the random value reads as a filled secret. b) Atlassian answers
      it with `access_denied: Unauthorized` which reads as a consent fault. c)
      one command settles it.

          aws secretsmanager get-secret-value --secret-id tracker/jira \
            --query SecretString --output text | cut -c1-6

- [ ] Force new containers after filling it. `secretReader` holds the value for
      the life of the container so a retry can fail on a secret already fixed.
- [x] Add a customer managed KMS key. It encrypts the refresh token field.
- [x] Grant the secret and the key to the Jira function alone. The API role must
      gain neither. That is the whole reason the function is separate.
- [x] Grant the Jira function read and write on the table. It touches the `JIRA`
      item and nothing else.
- [x] Add four environment variables to it. `JIRA_CLIENT_ID` then
      `JIRA_SECRET_ARN` then `JIRA_KEY_ARN` then `JIRA_CLOUD_ID`. The client id
      is `wJiihW00HOrSowAzpyBcDjWOj7vUMAXz`. The cloud id is
      `792ba525-6efc-4a5f-80f4-b9269516a256`. The stack supplies the other two.
- [x] Keep the client id in the stack rather than in the SPA bundle. The browser
      needs it for the authorize URL so serve it from `GET /api/jira/link`.
      Because a) a rebuilt bundle would otherwise be needed to change it. b) the
      route is already the one the screen calls before anything else. c) it is
      not a secret so nothing is risked by sending it.
- [x] Change no line of the content security policy. The consent redirect is a
      top level navigation which `connect-src` does not govern. Every Atlassian
      call is made by the function. Add a comment saying so. Because a) the next
      person to read the policy will look for the Atlassian hosts. b) option B
      of `docs/jira.md` is the one that needs them. c) a host added without
      cause never comes back out.
- [x] Add what this costs to `docs/budget.md`. Forty cents a month for the
      secret. A dollar a month for the key. The function runs once a month per
      user so its own cost rounds to nothing.

## 4. Storage

`apps/api/src/repository.ts` then `apps/api/src/dynamo.ts`.

- [x] Add `StoredJiraLink`. It carries what is needed to read Jira as this user
      again without asking them twice. The refresh token is held as ciphertext.
      Hold the ticket cache in a nested field.
- [x] Hold the previous refresh token beside the current one. Rotation disables
      the one that was spent and Atlassian is reported to accept the older one
      for about ten minutes. That is the only way a caller that lost a race can
      recover without sending the user back through consent.
- [x] Hold the access token and the moment it expires. It is good for an hour so
      caching it is what keeps one user to one refresh an hour.
- [x] Hold a claim field and a generation counter. Section 5 spends them.
- [x] Add `getJiraLink` and `putJiraLink` and `deleteJiraLink` to `Repository`.
- [x] Implement all three on `MemoryRepository`.
- [x] Implement all three on `DynamoRepository` under sort key `JIRA`.
- [x] Write no `expiresAt` on the item. The table expires a sheet after six
      months. A link must outlive that or every user relinks twice a year.
- [x] Extend the item map at the top of `repository.ts` with the new row. That
      comment is the only record of the key layout.

## 5. The Jira client

New file `apps/api/src/jira.ts`. It follows `cognito.ts` and `mail.ts`. Both put
one interface in front of one service so a handler never holds a client.

- [x] Declare `Jira` with three methods. Exchange a code. Refresh a token. Read
      the completed tickets of one period. Reading a worklog stayed private
      because only `completed` ever needs one.
- [x] Declare `CompletedTicket`. The key then the summary then the project key
      then the resolution date then the parent summary then the hours then which
      source the hours came from.
- [x] Implement `AtlassianJira`. It reads the secret once per container. That is
      the arrangement `dynamo.ts` and `cognito.ts` already rely on.
- [x] Exchange and refresh both post to `https://auth.atlassian.com/oauth/token`.
- [x] Put the client secret in that body. Atlassian requires it on the exchange
      and on every refresh. There is no PKCE alternative.
- [x] Search posts to
      `https://api.atlassian.com/ex/jira/<cloud id>/rest/api/3/search/jql`.
- [x] Send the JQL of `docs/jira.md` with absolute month bounds. Name the four
      fields. Never take the default field set.
- [x] Page on `nextPageToken`. Guard the loop with a maximum page count the way
      `cognito.ts` guards `ListUsers`.
- [x] Run the worklog JQL first. `worklogAuthor = currentUser()` with the same
      month bounds. Fetch worklogs only for a ticket it names. Because a) a JQL
      search returns issues rather than the worklogs under them. b) `worklog` as
      a field returns the first twenty per issue and no more. c) an unguarded
      read is one call per ticket.
- [x] Take the hours from the fields `JIRA_HOURS_FIELDS` names. In order. The
      first that answers wins. `worklog` and `timespent` are seconds and any
      other name is a custom field read as hours.
- [x] Ask the search for every configured field except `worklog`. That one is
      read an issue at a time.
- [x] Skip the worklog query and the account lookup where the list leaves
      `worklog` out. A month then costs one call.
- [x] Return zero hours rather than an error when no worklog answers. The screen
      takes over from there.
- [x] Serve the cached access token whenever it has more than a minute left.
      Never refresh to answer a request that a live token already covers.
- [x] Take a claim on the item before refreshing. Use the conditional write
      `claimReminder` already uses in `repository.ts`. Because a) the function
      runs in its own container so a lock in memory guards nothing. b) two tabs
      are two containers and the reminder is a third. c) two callers spending one
      refresh token is the most reported fault against this flow.
- [x] Give the claim a lease of about thirty seconds. Release it on failure the
      way `releaseReminder` does. A claim that is never released would lock the
      user out until it expired.
- [x] Re-read the item when the claim is lost. Take whatever access token is
      there by then. Never refresh without the claim.
- [x] Try the previous refresh token once when there is still nothing to use.
      Atlassian is reported to accept it for about ten minutes after rotation.
      That interval is not documented so it is the fallback and never the path.
- [x] Write the rotated refresh token back in the same call that spent the old
      one. Move the old value into the previous field as it goes.
- [x] Write the stored token only when the response carries one. A response
      sometimes returns an access token and no refresh token. Writing null over
      a working token ends the link as surely as a race does.
- [x] Ask for no other kind of refresh token. Persistent ones are gone.
      Rotation is the only behaviour on offer.
- [x] Treat 401 from a refresh as a revoked consent. Delete the link. Answer the
      route with a state the screen can offer to relink.
- [x] Treat 429 as a failure that keeps the link. Serve the cache if there is
      one.
- [x] Add `FakeJira` beside it for the tests and for `dev-server.ts`. It returns
      the seven real August 2026 tickets. Because a) no test may reach the
      network. b) the local server has no secret. c) the screen has to be
      workable with nothing else running which is how `api.ts` already treats
      the fixtures build.

## 6. The routes

New file `apps/api/src/jira-handlers.ts`. It mirrors `handlers.ts` and takes its
own `Deps`.

- [x] Add `GET /api/jira/completed`. Read `period` from the query. Reject
      anything the `PERIOD` expression does not match.
- [x] Serve from the cache on the link item. Fifteen minutes for the current
      month and a day for a month that has ended.
- [x] Add `GET /api/jira/link`. It answers whether this user has linked and
      nothing more. The screen asks it before it asks for tickets.
- [x] Add `POST /api/jira/link`. It takes the code from the browser and
      exchanges it. It stores the encrypted refresh token with the account id.
- [x] Add `DELETE /api/jira/link`. It deletes the item and nothing else.
- [x] Answer 404 for every route when `JIRA_CLIENT_ID` is unset. That is how a
      deployment without the app configured behaves.
- [x] Return Workday IDs and no titles. Section 8 resolves those in the browser.

## 7. The rounding rule

`packages/core/src/hours.ts`. It goes in core rather than in the screen. Because
a) core holds domain logic with no Vue in it. b) the rule decides what is
submitted so it needs its own tests. c) the export writes days and never hours.

- [x] Add `daysFromHours`. It is `Math.ceil(hours / halfDay) / 2` where the half
      day is the working day halved. Decision 6 took that over a fixed four.
- [x] Add `hoursPerHalfDay` and `hoursPerMonth`. The first is the day halved and
      it falls back to four rather than dividing by nothing. The second states
      what the month expects in hours.
- [x] Add `hoursPerDay` to `UserProfile` and a field for it in the settings.
      Bound between nothing and twenty four in `readProfile` because the number
      divides the hours of every ticket.
- [x] Return zero for zero. Never return a value the tracker cannot hold.
      Column K takes 0.5 or 1 alone.
- [x] Add `groupByWorkdayId`. It sums the hours of the tickets under one Workday
      ID and rounds that sum once.
- [x] Round per Workday ID and never on the total. That is what the screen
      shows so the two must agree.
- [x] Return the true total beside the rounded one. Two Workday IDs holding one
      hour each become one whole day and the user is answerable for that number.
- [x] Add `fitsMonth`. It answers whether the rounded total exceeds the working
      days the month holds. The fill stops on false rather than overflowing into
      a weekend.
- [x] Export all four from `packages/core/src/index.ts`.

## 8. The screen

A page of its own at `/jira`. Three layouts of it are built.
`mockups/h1-stacked.html` puts the three tables down one sheet.
`mockups/h2-rail.html` gives the summaries a sticky rail.
`mockups/h3-steps.html` numbers them as three steps and offers the percentage
split. `mockups/build-jira.py` emits all three and computes every figure on
them with the rule of section 7. Every shade they use is already declared in
`tokens.css` so the screen can ship without adding one.

- [x] Add `apps/web/src/lib/jira.ts`. Four calls against the four routes.
- [x] Build the authorize URL there. It carries the client id and
      `audience=api.atlassian.com` and `response_type=code` and
      `prompt=consent` and a state value. All four are required.
- [x] Put sixteen values in its `scope` parameter. The fifteen granted then
      `offline_access`. The last is what makes Atlassian return a refresh token.
      Without it the consent buys one hour of access. Section 11 can then never
      work.
- [x] Send no `code_challenge`. Atlassian Cloud supports no PKCE on this flow.
      A per application flag exists and Atlassian has to be asked to flip it.
      Nothing is gained by asking. Because the function holds the secret and
      does the exchange either way.
- [x] Handle `/jira/callback` before the router mounts. `lib/auth.ts` already
      handles `/auth/callback` that way so the pattern exists. It needs no route
      and no CSP change.
- [x] Keep the state in `sessionStorage`. There is no verifier to keep.
      `lib/auth.ts` says why nothing outlives the tab.
- [x] Add the `/jira` route to `apps/web/src/router.ts`. It is the fifth page.
- [x] Read `?period=` from the address. The reminder links here with the month
      it was about so the screen must not open on the one it would default to.
      A picker offers this month and the one before it.
- [x] Add the nav entry beside Month view and Quick fill.
- [x] Add the connect and disconnect buttons to the settings page. The Jira page
      carries them too because that is where a user who has never connected
      arrives first. This item was dropped from the plan on 2026-09-07 and the
      screen shipped without either button.
- [x] Give the page a state for a link that is not read yet and one for a read
      that failed. Because `v-else` on the linked branch renders the whole
      screen for a null state which is what hid the connect button.
- [x] Add `apps/web/src/pages/JiraPage.vue`. One sheet with the three bands H1
      takes.
- [x] Put a stat strip in the sheet head. The hours then the true days then the
      booked days then the target. `f-board.css` already draws one and
      `PeriodBar` already computes the month figures. That is what pays for the
      one cost H1 carries. Because the summaries below scroll away while the
      hours above them are being typed.
- [x] Build the ticket table. The key then the summary then the Workday ID then
      the hours.
- [x] Show the hours as text on every row. Decision 5 said not to type them.
      Mark which source each value came from. Every row on this site reads empty
      because the site holds no worklog.
- [x] Resolve each Workday ID title from the catalogue the SPA already holds.
- [x] Show a ticket whose project maps to no Workday ID as unmapped with a
      picker on the row. Never hide it and never book it.
- [x] Build the second table grouped by Workday ID with the hours summed.
- [x] Build the third table with the days and the rounding. Show the true total
      beside the rounded one.
- [x] Show the rounded total against the month target. Say plainly how much of
      the month the fill covers. Six and a half days against a target near
      seventeen is the real August figure.
- [x] Recompute every table as an hours field is typed in. The two summaries are
      derived and hold no state of their own.
- [x] Open on the share per Workday ID rather than on the hours. It is the only
      input the screen has. `lib/distribute.ts` already takes a share.
- [x] State what a half day is in hours on the screen. It differs per user now
      so a reader cannot assume four.
- [x] Add every string to all eight files under `i18n/messages/`. A missing key
      is what shortened the tour in the F work.
- [x] Follow the F design. A band of one white sheet and no card.
      `docs/todo-f-design-and-board-view.md` removed `.card` from every page.

## 9. The fill

- [x] Add the **Fill the month timesheet** button to the last band. Fill it
      Smart Blue so it closes the sheet the way `ExportPanel` does.
- [x] Order the Workday IDs by days descending. Hand them to `distribute`
      rather than walking the month here. It already skips a non-working day
      and it already collapses a day one Workday ID holds whole. A second
      walker would be a second place for those rules to drift.
- [x] Fill every field of each half day it takes. A row the tracker would
      reject is worse than no row. The specification falls to the default that
      `catalogue.ts` resolves and the location to the one on the profile.
- [x] Spread the tickets of one Workday ID across its half days so each row
      names one ticket in column M. Join the remainder into the last row when
      there are more tickets than rows.
- [x] Stop on `fitsMonth` returning false. Say which Workday ID did not fit.
      Never overflow into a weekend.
- [x] Overwrite a half day the user already filled. Decision 2 below took that.
- [x] Say how many half days will be replaced before the button runs. Put the
      count in the blue band beside the figure. Because overwriting silently is
      the one way this screen can lose work somebody typed.
- [x] Post the result to `PUT /api/timesheets/{period}` on the API function. The
      Jira function never writes a timesheet. `docs/jira.md` says why.
- [x] Route the user to the month page once it is written. The fill is not the
      submit and the export is still theirs to press.

## 10. The Workday ID map

- [x] Add `jiraProjects` to `UserProfile` in `packages/core/src/types.ts`. One
      Jira project key to one Workday ID.
- [x] Write the entry when a row is mapped by hand on the screen.
- [x] Propose the stored Workday ID on every later month.
- [x] Leave the backoffice map out of this slice. `docs/jira.md` says why the
      per user memory is enough on the first day.

## 11. The reminder

- [x] Read the link in `runReminders` only for a user who is being reminded
      today. The run considers every user daily so an unguarded call would query
      Jira for the whole company every morning.
- [x] Add the ticket count and a link to `/jira` in `reminderMessage` in
      `apps/api/src/mail.ts`. Send no hours. There are none to send.
- [x] Leave the message unchanged for a user who has not linked.
- [x] Note the cost. The reminder function then needs the secret and the key so
      two roles hold them rather than one. That is the price of putting the list
      in the mail and it is worth stating out loud.
- [x] Ship this section last. The mail is where the feature is worth the most
      and it is also the part that fails silently.

## 12. Tests and checks

- [x] Add `apps/api/src/__tests__/jira-handlers.test.ts` for the four routes
      against `FakeJira`.
- [x] Test that a rotated refresh token is written back and that the spent one
      lands in the previous field.
- [x] Test the race. Two callers with one stored token. One refreshes and the
      other must end up with the same access token without a second refresh.
- [x] Test that a response carrying no refresh token leaves the stored one
      alone.
- [x] Test the fallback. A caller that finds no fresh token spends the previous
      one exactly once.
- [x] Test that a live access token is served without any call to Atlassian.
- [x] Test that a claim left behind by a crash expires rather than locking the
      user out.
- [x] Test that a 401 on refresh deletes the link.
- [x] Test that a second request inside the cache window makes no Jira call.
- [x] Test that a ticket from an unmapped project is returned and marked.
- [x] Add `packages/core/src/__tests__/hours.test.ts`. Pin the boundaries. Zero
      then four then four and a tenth then eight.
- [x] Test a day that is not eight hours. Three hours is a half day on a six
      hour one and the same hours book more days than on an eight hour one.
- [x] Test the inflation. Two Workday IDs holding one hour each round to one
      whole day against a true quarter of a day.
- [x] Test that `fitsMonth` refuses a month that cannot hold the rounded total.
- [x] Test that the fill skips a non-working day and lands on the same days
      `distribute.ts` would choose.
- [x] Test that the fill leaves an already filled half day alone.
- [x] Extend `apps/api/src/__tests__/reminder.test.ts` so a linked user and an
      unlinked user both get a message.
- [x] Run `pnpm -r test` then `pnpm typecheck` then `pnpm build`.
- [x] Check that no test reaches the network. A test that passes only online is
      worse than no test.

## Decisions taken

1. **How the screen is laid out. H1. Three tables down one sheet.** Built at
   `mockups/h1-stacked.html`. Because a) the reading order is the working order.
   b) every table keeps the full width so a thirty ticket month still fits. c)
   neither of the others holds all three tables without taking width or a scroll
   from the ticket list. It costs the summaries their place on screen while the
   hours are typed. Section 8 pays that with a stat strip in the sheet head.
   `h2-rail.html` and `h3-steps.html` are kept because a decision is only
   readable beside what it beat.
2. **What the fill does to a half day that is already booked. Overwrite.**
   Because a) the fill is the fast path and a prompt on every run would make it
   the slow one. b) a user who opens this screen has asked for the month to be
   filled. c) refusing would leave the month half filled with no way to say
   which half. It costs work the user typed. Section 9 pays that by naming the
   count before the button runs.
3. **Where the screen sits. A fifth top level page at `/jira`.** Because a) the
   screen is the whole task rather than a step inside the month. b) a band on
   the month page would push the grid off the first screen on a long month. c)
   the monthly reminder needs one address to link to.
4. **What goes in column M. The ticket summary.** Not the epic summary. The
   query still reads `parent` because the screen shows the epic under each
   summary as context. Nothing writes it to a timesheet.

5. **Whether the hours field is typed at all. No.** A configured list of Jira
   fields is searched in order and the column shows what answered. Nothing
   parses it back. It reads empty on every row of the 4flow site because
   `worklog` and `timespent` are both empty there. So the share per Workday ID
   divides the month and the screen opens on it. Because a) a column nobody may type into cannot divide
   anything. b) a share needs no arithmetic the user has to trust. c)
   `distribute.ts` already takes one. The hours mode is kept and tested because
   it is what a site holding worklogs would use. Mockup `h3` shows the share
   beside the hours.
6. **What a half day is. The working day halved.** Not a fixed four hours. The
   length sits on `UserProfile.hoursPerDay` and defaults to eight. A six hour
   day makes the half day three. Because a) a fixed four hours books somebody
   on a six hour day a whole day for half of one. b) the number divides the
   hours of every ticket so it decides what is submitted. c) nobody but the
   user knows how long their day is. `hoursPerMonth` states the contract in the
   same unit so the two can be compared at all.

## What this deliberately leaves out

1. **Writing to Jira.** No worklog is created and no ticket is transitioned. The
   scopes make it impossible rather than merely forbidden.
2. **Inventing hours.** A ticket with no worklog gets zero and the user types
   over it. Nothing is estimated from a resolution date. Five of the seven
   tickets were closed in one bulk action so those dates carry no information
   about when the work happened.
3. **The backoffice project map.** Section 10 stores what the user picks. A
   central map serves a new starter and nobody has asked for one.
4. **Absence.** Jira knows nothing about it. The fill covers part of a month and
   says so.
