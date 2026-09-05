# 4flow Timesheets
A timesheet management and submission site.

Workflow.
A user logs in.
They select their default Location from a list
They select from their default timesheet which prepopulates or a previous timesheet or a blank

They enter their costcenter ids
they enter the hours per constcenter with either the general view or the specific view(per day)
They then click submit
This returns an excel spreadsheet in the given format.

Two types of user
User and Backoffice

Users can see two different types of screens. THey can either endter just their costcenter ID and the hours.
Or they have a month view broken down by the half day where they can use more details.
There is a list of possible costcenters that is managed by the backoffice staff.
The Users have a customizable maximum amount of dat that they can work per mounth that is depenedant on the calender settings. They calander needs to take into account different countries working practices.

Technical
A SPA with AWS Lambda backend /dynamodb
A vue 3 frontend. tan stack.
We need translations.
Colours are orange white and dark blue
Downloads a XLSM file that can then be direclty emailed
This app will be deployed to aws and use oidc login.
The database stores the list of regions. The users previouse timesheets and default timesheet. not much else.
on inital login and after filing out the questions for the first time the default timeshseet is populated for that user. from then on its used as the default timesheet.
# Open questions

Read from `Name.Firstname_2026_04_projecttracker_nn.xlsm` on 2026-09-01. That file is the required output format. It is also a filled sample for April 2026. Cell references below are on its `Tracker` sheet unless another sheet is named.

## Terms

Workday ID. The number identifying one cost centre or one project. Column I. Resolved against a 5142 row project list.

Specification. The activity classification for one entry. Column J. Its permitted values depend on the business line of the workday ID.

Half day row. The grid gives every calendar day two rows. Rows 5 to 66 hold a 31 day month.

Target. The number of days the user is expected to book for the month. Cell K102. Named range `varTarget`.

## Settled by the spec above

The unit is days per month. Line 20 states this. The template agrees. Column K accepts 0.5 or 1 only.

The download is xlsm. Line 27 states this. The template needs it.

Lines 10 and 17 still say hours. They contradict line 20. Confirm they are stale.

## Output

1. Does the app fill the existing macro template or build a fresh xlsm. Because a) the template carries a 217 KB `vbaProject.bin`. b) it carries pivot tables and slicers. c) a hidden sheet holds the 5142 row project list. - build fresh. the new file just needs the data in the correct cells but nothing else

2. Does the file need live formulas or baked values. The per week summary sits at rows 95 to 99. The aggregation block sits at rows 70 to 88. the resultant file is just an export. the web editor needs to be interactive.

3. Is `software.projecttracker@4flow.com` a human mailbox or an automated parser. The sheet says "Send this file to software.projecttracker@4flow.com if everything is correct". human mailbox. The page provides the file for download once the user is done.

4. Does the app send that mail or does the user attach the file by hand. user attaches file by hand.

5. The filename pattern is `Name.Firstname_YYYY_MM_projecttracker_nn.xlsm`. What is `nn`. Must the generated name match it exactly. NN is region. Such as DE_BERLIN or AT_VIENNA or ES_MADRID

## Entry fields

6. Line 9 says the user enters a cost centre ID. The template needs a workday ID and a specification on every half day row. Does the app reproduce the dependent specification dropdown. The source range is chosen by business line. Examples are `spec_software_cc` and `spec_software_proj`. yes but prettier.

7. Column AC checks the specification matches the business line. Is that a hard block on submit. yes validation fail prevents export.

8. Absence is not a cost centre. The `parameters` sheet maps "Vacation or sickness" to 99983209. It maps "Other absence" to 99983409. Both force specification `4s_Overheads_Absence`. Is absence a separate entry type in the UI. a seperate type. but esentially a cost center with an id of "Vacation or Sickness"

9. Does absence come from an HR leave system or does the user declare it. user decaled

10. Column L is location per entry. Column M is tasks. Are both captured. Is tasks free text.
Yes
## Cost centre list

11. Line 19 says backoffice manages the list. The template refreshes it from `X:\finance\Projektnummernliste\4flow_Projectnumbers.xlsm`. A cell also links "download latest version (Hive)". Which is the source of truth. The template reads from the project numbers. these will be uploaded by the backoffice. The latest version is the latest version of the template and so can be ignored.

12. Is backoffice typing entries or importing that file. impoprting file.

13. Which project list fields does the app store. Which does it show to the user.
- Cost Center and Workday ID BOTH
- Customer and Customer ID BOTH
- Business Line and Business Unit BOTH
- Project title and Status BOTH
- Workday Title and HGB group allocation BOTH

## Calendar

14. Bank holidays are fixed per location across 22 columns of the `holidays` sheet. Some columns stop early. Who maintains them. Is there an approved source per country. This is a sheet that is uploaded by backffoice. Each uploaded sheet replaces the current existing settings.

15. Line 29 says the database stores regions. The template keys holidays by location. Berlin and Munich differ. Is location the key. yes

16. The last holidays column is "Working days instead of weekend". Does the app handle a working Saturday. yes

17. Cell A3 resolves the country by looking A2 up in `Table1`. That yields `#N/A` for `01_DE_Berlin`. `Table1` holds country names and not location codes. Is that a defect in the template. Yes

## Target

18. Is B8 Adj. work Days the part time factor. Is it held per user. Yes

19. Does a mismatch against the target block submit or only warn. The sample shows a target of 8 against 14 days entered. Its message reads "6 working day(s) too much". Warn

20. Rows 95 to 99 break the month down per calendar week. Is there a weekly limit as well as the monthly target. No

## Defaults and history

21. Range R8:V22 prepopulates the project numbers of the current month and the previous month. Is that the default timesheet of line 7. Or is the default a separate saved template. previous saved timesheets

22. Line 30 says the default is populated after the user answers questions on first login. Which questions. Location and part time factor and entity are the guess. yes.

23. How many months of history are kept. 6

24. Can a user reopen a past month and resubmit it. resubmitting would consit of regenerating it so yes

## The simple view

25. The simple view takes a cost centre and a month total. The output needs one row per half day. What rule spreads that total across the month. just front the 1st of the month onwards. the user should be able to select percentages and the distribution should update. project 1 70% project 2 30%

26. Does that rule skip non working days. Does it fill the earliest day first. yes skip non working days.

## Access

27. Which OIDC provider. This will use the aws start page for logon and be an app embedded there. Cognito.

28. Does it supply location and employee number and entity. Or does the user set those on first login. User sets those. The Provider only gives the users email address and first and last name.

29. Can backoffice read the timesheet of another user. Can they edit it. Line 19 grants them only the cost centre list. No. This is purely for download a timesheet for the user to email.

## Frontend

30. Which TanStack libraries. Query and Router and Table are the guess. yep

31. Which languages are needed. The 22 locations imply these. Yep
- German and English
- Czech and Hungarian
- Chinese and Portuguese
- French and Spanish

# Built so far

Frontend first. The workbook writer is the next slice.

Run `pnpm install` then `pnpm dev`. Also `pnpm test` and `pnpm build` and `pnpm fixtures`.

## Layout

    timesheets/
      apps/web/                 the SPA
        src/lib/                domain logic with no Vue in it
        src/composables/        the shared editor state
        src/components/         the screens
        src/i18n/messages/      eight locales
        src/fixtures/           extracted from the workbook
      tools/extract-fixtures/   rebuilds those fixtures

## What the domain layer owns

The export carries values and not formulas so the frontend computes everything
the tracker used to derive. That is the calendar and the per week split and the
aggregation block and every validation message.

`lib/calendar.ts` gives the ISO week and the non-working days per location.
`lib/catalogue.ts` resolves the dependent specification list.
`lib/aggregate.ts` builds the two summary blocks.
`lib/validation.ts` reproduces the tracker checks.
`lib/distribute.ts` spreads a share across the month for the quick fill.
`lib/filename.ts` builds the export name.

## Verification

33 tests pass. The workbook is the oracle for most of them. `pnpm fixtures`
extracts the filled sample together with the numbers Excel cached so the tests
compare against Excel rather than against an assumption.

The calendar week matches tracker column F on every row. The non-working flag
matches column G on every row. The per week summary matches rows 95 to 99. The
total matches K101. The grid mounts with two rows for every day and the router
tree renders.

## Deliberate departures from the workbook

A day may not hold more than one booked day. The workbook never checks this.

A working Saturday counts as a working day. The workbook holds a dead branch
that would have read that list and always falls through to the weekend test.
That list belongs to one location and not to all of them. See below.

Cell A3 is not reproduced. It looks a location code up in a table of country
names so it always returns #N/A.

# Open questions from the build

32. `spec_CorporateServices_cc` is #REF! in the workbook and 44 cost centres
    resolve to it. The editor offers the full specification list and marks those
    rows as unverified. Which specifications should those 44 allow.

33. The shipped sample is itself invalid. Eight rows hold a specification and a
    day value with no cost centre. Tracker cell O3 reports it. Confirm that is a
    filling error and not a shape the app must accept.

34. A city holding a separator needs a file name rule.
    `01_DE_Ruesselsheim / Bad Nauheim` becomes `DE_RUESSELSHEIM_BAD_NAUHEIM`.
    Confirm that is right for the receiving mailbox.

35. A day holding more than one booked day is now a hard error. Confirm.

36. The tracker aggregation block holds 15 rows at 71 to 85. A generated workbook
    can grow it. Should it grow or should the editor cap the month at 15 groups.
    It warns today.

37. Column R Status is empty on all 2905 project rows. Should the import filter
    on status once a populated file arrives.

38. The project list table is sized for 5142 rows and holds 2905 with a workday
    id. Confirm 2905 is the real size.

# The backend

Nothing is deployed. The stack synthesises and the API runs locally.

    pnpm install
    pnpm dev:api     # http://localhost:8787
    pnpm dev         # http://localhost:5173
    pnpm -r test
    pnpm synth       # bundles the Lambda then renders the CloudFormation template

## Layout

    apps/web/                 the SPA
    apps/api/                 the Lambda and a local development server
    packages/core/            the domain. No Vue and no AWS
    packages/xlsm-writer/     builds the workbook
    packages/fixtures/        seed data extracted from the workbooks
    infra/                    the CDK stack
    tools/extract-fixtures/   rebuilds the fixtures

The domain moved out of the web app so the API runs the same validation. A
browser cannot talk past a check that also runs on the server.

## Routes

    GET  /api/health                        no token
    GET  /api/catalogue                     the project list and the holidays
    PUT  /api/admin/catalogue               backoffice only. Replaces everything
    GET  /api/me                            the profile
    PUT  /api/me                            the fields the user owns
    GET  /api/timesheets                    the saved months
    GET  /api/timesheets/{yyyy-mm}
    PUT  /api/timesheets/{yyyy-mm}
    POST /api/timesheets/{yyyy-mm}/check    validate without writing a file
    POST /api/timesheets/{yyyy-mm}/export   the workbook

The identity fields come from the token and never from the body. A user cannot
read another user timesheet because the partition key is their subject claim.

## Storage

One DynamoDB table.

    USER#<sub>   PROFILE           the profile
    USER#<sub>   SHEET#<yyyy-mm>   one saved month
    CATALOGUE    CURRENT           the uploaded project list and holidays

The catalogue is a megabyte of JSON which is over the 400 KB item limit so it is
stored gzipped at about 60 KB. Six months of history is enforced by an item
expiry rather than a sweep.

## The export

The workbook is built fresh. It carries no macros and no project list and no
pivot caches. Eight parts and about 6 KB against the 662 KB of the tracker it
copies. Every derived cell is a value.

An error blocks the download. The writer refuses the sheet and the API answers
422 naming the failing check.

## Verification

97 tests across four packages.

The two shipped workbooks are the oracle. `pnpm fixtures` extracts the filled
month from each one together with the numbers Excel cached. The calendar week
matches column F on every row. The non-working flag matches column G. The per
week block matches rows 95 to 100. The aggregation block matches rows 71 to 85.
The verdict matches what cell O2 and cell O3 told the user.

The written workbook is read back out of the zip with a parser that shares no
code with the writer. LibreOffice opens both the writer output and the bytes the
API returns over HTTP and renders the grid and the totals correctly.

Excel itself has not opened an exported file. That check is outstanding.

The CDK stack synthesises. It has not been deployed and deploying it needs an
account and a decision that is not mine to take.

# Open questions from the backend

39. The August workbook is named `..._projecttracker_DE.xlsm` from location
    `01_DE_Berlin`. Answer 5 says the region is `DE_BERLIN`. The file says `DE`.
    The code follows answer 5. Which is right.

40. Which Cognito user pool. The stack creates one. An existing pool would be
    imported instead.

41. Backoffice uploads the project numbers and the holidays as spreadsheets.
    The API takes JSON today. Should the Lambda parse the workbook itself or
    should a small tool convert it first.

42. A month with more than fifteen cost centre groups overflows the tracker
    block. The export writes the extra rows below it rather than dropping them.
    Confirm that is wanted.

# The cost centre picker

Typing an id now ranks by how well it matches rather than by position in the
list. Because a) the id is the thing being picked. b) a plain substring match
put `18249` above `24112` for the query `24`. c) the user knows the first digits
of their own cost centre.

The order is exact id then id prefix then absence name then id substring then
any other text. The user own business line breaks a tie and never beats a better
match.

Arrows move the highlight. Enter takes it. Escape closes without picking.

350 workday ids appear more than once in the project list. The copies differ
only in cost centre and project number. The first wins because XLOOKUP in the
tracker also returns the first match. 559 rows are dropped and 2592 remain. The
business line counts are recomputed after that so the settings screen reports
what the picker actually offers.

43. The embedded project list names only 189 of 3149 rows. The rest carry a
    workday id and a customer id and a business line and nothing a person would
    recognise. The picker falls back to the project number. Does the real
    `4flow_Projectnumbers.xlsm` carry the customer names and titles that this
    embedded copy leaves out.

# The days column

A calendar day is one day however it is split. The upper row of a day takes the
whole day when it is filled. The lower row takes what the upper leaves.

Nothing is ever rebalanced behind the user. The split is what they set on the
dropdown so an edit that was not about the split cannot move it.

# The specification column

Two behaviours turn on one question. Does the cost centre name a list of its
own.

A cost centre that names one must be given one of its values. The field starts
on the first of them and offers no blank. It is marked as provisional so the
difference between a value the app chose and a value the user chose stays
visible.

A cost centre whose list the workbook leaves empty starts blank and may stay
blank. Every specification there is remains selectable and a chosen one is
reported as unverified. Nothing is filled in for the user because offering the
first of every specification there is would be a guess dressed as an answer.
44 cost centres are in that state.

This departs from the tracker. Cell O3 counts columns I and J and K and calls
the sheet invalid unless all three hold the same number of entries. Under that
rule those 44 cost centres could not be booked at all.

The mark is a dashed muted field with a small `default` tag. It uses neither the
orange of an error nor the amber of a cost centre whose list is missing from the
workbook. Because a) a default is not a fault. b) those two colours already mean
something else. c) three states need three looks.

Choosing from the list clears the mark. Changing to a cost centre that disallows
the current value replaces it with a new default rather than emptying the field.

`specificationIsDefault` is stored on the half day so the mark survives a
reload. The export ignores it because the tracker has no such column. A sheet
saved before the field existed reads as a confirmed pick.

# The week column

The grid is one block per calendar week rather than one per day. The week number
is written once in a cell that spans every row of its week. April 2026 shows
five numbers rather than sixty.

# The specification placeholder

Gone. A row with a cost centre always holds a specification so there is nothing
to prompt for. The empty option remains only for a row with no cost centre.

# The quick fill shares

The shares stay split evenly while nobody has typed one. Adding or removing a
cost centre resplits them so the list is usable straight away. The first typed
share hands them over and nothing rewrites them after that. The `100 / n` button
hands them back. An automatic share is shown dashed and italic like a default
specification.

# The expected days

Three inputs decide the target at tracker cell K102.

    month override    the days for this month alone
    contract          the share of a full month the user is contracted for
    calendar          the working days at the user location

The most specific wins. The contract lives in settings as a percentage and the
screen shows what it works out to for the open month. The override lives on the
month and sits in the header next to the figure it replaces. It is what cell B8
carries into the export.

A percentage rounds onto a half day because column K accepts nothing finer. 80
per cent of 21 working days is 17.

# A part time month

The quick fill spreads the shortfall over the weeks rather than over the month.
An eighty per cent contract drops one day a week. Spread over the month the same
count would book four full weeks and leave the last one empty which is not how
a four day week is worked.

The whole days are shared between the weeks by largest remainder so the total is
exact. A month carries at most one half day. Inside a week the dropped days are
spaced apart and the whole set turns by one place each week so the same weekday
is not always the one lost.

    21 working days at 100 per cent   ##### ##### ##### ##### #
    21 working days at 17 days        ##.## ###.# ####. .#### #
    21 working days at 10.5 days      #.#.# ..#.# #..#. +#..# #

# The second row of a day

It is not shown until the upper row is set to a half day. Splitting a day is
therefore something the user asks for on the days dropdown rather than something
that happens to them when they fill a second cost centre.

The upper row takes the whole day when it is filled. Setting it to a half opens
the lower row. The lower row is then offered nothing but a half because that is
all the day has left. Taking the upper row back to a whole day clears the lower
one because nothing may be left in a row the user can no longer see. Emptying
the upper row clears the lower one for the same reason.

An empty month therefore reads as one row a day rather than sixty. The date cell
and the week cell span the rows on show rather than a fixed two so a day that
gains its second row pushes both spans out by one.

The grid still holds two rows for every day behind the view. Only the rendering
changes.

# Switching user

There is no sign in yet so the header carries a switcher. It sets the headers the
local API reads in place of a token. Three identities ship. Two are ordinary
users with their own profile and their own timesheets. One is in the backoffice
group and is the only one that may replace the catalogue.

The control renders only in a development build and the deployed API ignores
those headers because it reads the Cognito token. It goes when auth lands.

# What backoffice can do

One thing. `PUT /api/admin/catalogue` replaces the project list and the bank
holidays. Everyone else gets 403 on that route.

Nothing else separates the two. A backoffice member has their own profile and
their own timesheets like anybody else and cannot read another user sheet.
Answer 29 says that is right.

There is no screen for the upload yet. Answers 11 and 12 and 14 say backoffice
uploads two spreadsheets and each upload replaces what is there. The route takes
JSON so something has to turn the workbook into JSON first. Question 41 asks
whether the Lambda should parse the workbook itself.

44. Settled. Backoffice has a page at `/admin`.

# Testing over the wire

`dev-server.ts` holds the HTTP surface and `local.ts` seeds it and listens. The
split exists so a test can start a server on its own port.

The handler tests call `handle` directly so they never see a preflight. That is
how a header the client sends reached the browser without being allowed. Every
check passed because none of them went over the wire.

`dev-server.test.ts` drives real HTTP. It covers the preflight and the caller
headers and the group check and that the download arrives as a zip rather than
as base64 text. Putting the old fixed allow list back makes two of them fail.

# The admin page

`/admin` is offered in the navigation to the backoffice group and to nobody
else. The route exists for everyone but the page refuses anyone outside the
group and the API refuses them again.

A tracker workbook is dropped on the page. The browser reads it and shows what
it found and what it would replace. Nothing is sent until that is confirmed.

The workbook is parsed in the browser rather than in the Lambda. Because a) the
file is 660 kB and the lists inside it are about 60 kB compressed. b) the Lambda
then needs no spreadsheet parser in its bundle. c) the reader is the same code
the fixture tool runs so an upload and a fixture rebuild cannot disagree.

`packages/workbook-reader` holds that parser. It takes bytes and touches no
filesystem. It refuses anything that is not a tracker rather than storing an
empty catalogue.

Each upload replaces everything. The page reloads the catalogue afterwards so
the editor reflects it without a refresh.

# The copy arrow

An empty row offers to copy the nearest filled row above it rather than the row
directly above. Because a) the row directly above is usually empty. b) a weekend
sits between one working day and the next. c) copying an empty row copies
nothing and the button looked broken.

One pass over the grid gives every row its source so the lookup costs nothing
per row. The button carries the cost centre it would take in its tooltip and in
a `data-copy-from` attribute so the source is visible rather than guessed.

It copies the cost centre and the specification and its default mark and the
location and the tasks. It does not copy the day value. The day is shared again
after the copy so landing on a day that is already taken splits it.

# Beside the grid

The grid is tall and narrow so the space to its right carries three panels. All
three describe the month rather than the screen so the quick view shows the same
three. The column sticks while the grid scrolls and drops below the grid under
1200 pixels.

## Progress

Days booked against the target with a bar that fills. Past the target it keeps
filling in a hatched second colour rather than sitting at full. Because a) a bar
pinned at 100 hides an overshoot. b) the overshoot is the thing the user has to
fix. c) a bar that cannot move past full stops telling the truth.

One block per calendar week shows the shape of the month. The bar and the figure
turn green together on the target and the bar pulses once as it lands. Motion is
a reward rather than information so it goes when the reader asks for less of it.

## Your cost centres

The five cost centres this user books to most, by days, taken from the saved
months and the open one. Clicking one books it on the next free working day.

A day that already holds a full day is passed over even when its lower row is
empty. Because a) a day holds one day of work. b) filling the lower row would
halve what is already booked. c) the click is meant to add a day and not to
split one.

Non-working days are reached only once every working day is taken.

# The tour

Each page names its own steps and each step names the element it points at
through a `data-tour` attribute. An attribute is used rather than a class
because a class is there to be restyled and a rename would break the tour in
silence.

    month      10 steps   period, target, grid, cost centre, days,
                          specification, progress, reference list, checks,
                          download
    quick       5 steps   rows, share, even them out, fill, progress
    settings    4 steps   location, entity, business line, contract
    admin       3 steps   drop, preview, replace

A step whose element is not on the page is dropped rather than shown pointing at
nothing. The download panel is absent for a user with no API and the admin page
is absent for anyone outside the backoffice group.

The steps are resolved when the tour opens rather than read on demand. Because
a) the list depends on which elements are in the document. b) the document is
not reactive. c) a computed over it would go stale without ever saying so.

One element sits over the target and dims the rest of the page with an outward
shadow. The target stays readable and stays clickable because the overlay takes
no pointer events.

The tour opens once per page and the `?` in the header brings it back. Arrows
move, Enter advances, Escape leaves.

A test compares the anchors every page declares against the attributes the
components actually carry. A step pointing at an attribute nobody wrote would
otherwise be dropped in silence.

# Missing settings are a check

A month cannot be right without the office. It decides the bank holidays and
therefore the working days and the target, and it names the file the recipient
reads. A month with no office is an error and blocks the download. A month with
no entity is a warning.

The rule lives in `validate` with every other check rather than in the download
panel. Because a) the checks panel is where a user looks for what is wrong. b)
the API runs the same function so the two cannot disagree. c) a copy of the rule
in the panel would drift from the copy in the API.

The office field is also marked where it sits, in the header and in the
settings, so the reader is not sent hunting for it.

The download panel used to disable its button for a missing office and say
nothing at all. It had a message for a failed check and for a missing API and
for an empty month and no case for this one. The condition is gone from the
panel now that the validation carries it.

# The working weekend column

The holidays sheet gives each location a column of bank holidays and then one
more column headed "Working days instead of weekend". That last column carries
no location of its own.

Reading it as a list for everybody made 20 September 2026, a Sunday, a working
day in Berlin. The 40 dates are Chinese make-up working days. They flank the
Spring Festival block and the National Day block of the Shanghai holiday list
and they clash with no other location. All 40 fall on a Saturday or a Sunday.

The reader now attaches the column to `05_CN_Shanghai / Changzhou / Beijing` and
the catalogue keys the list by location. Every other location keeps its
weekends.

45. The working weekend column names no location. Its dates are Chinese make-up
    days so the reader attaches it to Shanghai. Confirm that, and say whether
    the column should be split per location the way the holidays are.
