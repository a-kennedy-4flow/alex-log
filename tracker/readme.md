# 4flow Tracker
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

5. The filename pattern is `Name.Firstname_YYYY_MM_projecttracker_nn.xlsm`. What is `nn`. Must the generated name match it exactly. NN is region. Such as DE_BERLIN or AT_VIENNA or ES_MADRID. Superseded by question 39. The submitted workbook says the country code alone.

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

    tracker/
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

The stack is deployed to account 517025126224 in eu-central-1. The API also runs
locally.

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
    GET  /api/jira/completed/{yyyy-mm}          the closed month
    GET  /api/jira/completed/{yyyy-mm}/{scope}  `closed` or `all`
    POST /api/jira/completed/{yyyy-mm}/{scope}  the same read past the stored copy

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

The name travels in `content-disposition`. A header carries bytes rather than
text so a plain `filename` is read as ISO-8859-1. A surname holding ü arrived as
Ã¼. One holding ř killed the response before it left Node. `filename*` from RFC
6266 states its own encoding and answers both faults. Both parameters are
written. Because a) a recipient that reads `filename*` prefers it. b) one that
does not still gets a name it can file. c) the plain parameter is ASCII so no
transport can mangle it.

`dispositionParams` writes the parameters and `filenameFromDisposition` reads
them back. Both sit in `filename.ts` beside the rule that builds the name. The
mail attachment uses the same pair so a download and a delivery cannot disagree.

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

The CDK stack is deployed. Sign in federates to IAM Identity Center over SAML
2.0 so the app is reached from a tile on the 4flow access portal. The portal
application is created by the account that owns the Identity Center instance
rather than by this one. `docs/identity-centre.md` holds that request along with
every value it needs.

# Open questions from the backend

39. Settled on 2026-09-07. The file wins and answer 5 is superseded. The
    trailing part is the country code of the location so `01_DE_Berlin` gives
    `DE`. Because a) the workbook that was actually submitted is
    `Kennedy.Alexander_2026_08_projecttracker_DE.xlsm` and it came from that
    location. b) the blank sample names the part `nn` which is two characters
    wide. c) every location in the catalogue carries a two letter `countryCode`
    and `regionOf` now reads that field rather than parsing the code.

    One consequence. The name no longer tells one city from another. All eight
    German offices produce `..._projecttracker_DE.xlsm`. That is what the real
    convention does so it is left alone.

40. Which Cognito user pool. The stack creates one. Identity Center federates
    into it over SAML rather than the app talking to Identity Center directly.
    Because Identity Center is not an OIDC provider for a customer managed
    application.

41. Settled. The browser parses the workbook and the API keeps taking JSON.
    The Lambda carries no spreadsheet parser.

42. A month with more than fifteen cost centre groups overflows the tracker
    block. The export writes the extra rows below it rather than dropping them.
    Confirm that is wanted. The per week block now moves down with it. See
    below.

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
    embedded copy leaves out. Yes for the 4s slice of it.
    `20251218_4s_Projectnumbers_protected.xlsx` is the file backoffice sends.
    Its `Project no.` column is the Workday ID under another name. It lists 798
    numbers. The tracker already carries 486 of them. It names not one. 504 of
    its 774 customer projects carry a title. Every one carries a customer.

    The upload therefore accepts either workbook. A tracker still replaces
    every list. The 4s list replaces nothing. Because a) it carries no location
    and no bank holiday and no day value. b) it covers one business line of
    four. c) the tracker copy is cut later so a blank is the only field the list
    can be trusted to know better.

    It names 462 projects and leaves 24 cost centres untouched because the
    tracker titles those already. 312 of its numbers are absent from the tracker
    altogether. The admin screen counts them and offers to add them. An added
    row is business line `software` with no cost centre. Because a) it is the 4s
    list. b) all 700 rows whose number the tracker also carries read `software`
    there. c) the three specifications the list offers are exactly the
    `spec_software_proj` range.

    The fourth sheet holds prose describing each `4s_Overheads_` specification.
    Nothing in the app shows prose about a specification so it is left unread.

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

The mark is a Bright Blue rule under the field. It uses neither the orange of an
error nor the amber of a cost centre whose list is missing from the workbook.
Because a) a default is not a fault. b) those two colours already mean something
else. c) three states need three looks.

It carried a small `default` tag beside the field before. The tag went because
it was the thing people read instead of reading the value under it. The field is
highlighted for a double check now and nothing labels it.

Reaching the field clears the mark. A click and a key press both count. A focus
does not because tabbing past a field is not reading it and the tab order
crosses every row of the month. Changing to a cost centre that disallows the
current value replaces it with a new default rather than emptying the field.

`specificationIsDefault` is stored on the half day so the mark survives a
reload. The export ignores it because the tracker has no such column. A sheet
saved before the field existed reads as a confirmed pick.

# The week column

The grid is one block per calendar week rather than one per day. The week number
is written once in a cell that spans every row of its week. April 2026 shows
five numbers rather than sixty.

# The shading of a day

The month view carries no colour a weekday owns. A day the tracker asks you to
fill is the sheet itself. A holiday and a day past the target take the tint. The
weekend takes the shade above that.

Because a) a colour a weekday owns says nothing about what that day asks of the
user. b) two shades say it on their own. c) a row stays in the grid either way
since any of these days may still be booked by hand.

    a day to fill          the sheet   #ffffff
    nothing is asked for   the tint    #faf7f5   2.98 from the sheet
    the weekend            the shade   #eef2f5   5.15 from the sheet

Delta E is the distance between two colours in CIE Lab. `tokens.css` defines it
for the project. Two colours under about 3 of each other read as one colour. The
tint holds that boundary on purpose because a day a user may still fill is not
the thing to read first. The weekend stands 4.11 from the tint.

Both shades clear Warm Grey by 6. A select in the grid and a chip in the board
are Warm Grey and both sit on a shaded day. Neither shade reaches 3 chroma so
each is a shade of the sheet rather than a colour on it. `colour.test.ts` holds
every figure above.

The grid shades the row and the board shades the column. The week number column
is the one cell held out of it because it spans a whole week and would otherwise
take the shade of the day that week starts on.

# The wash of the weekday

The guided day picker washes the column of its board by the weekday standing in
it. Monday runs Bright Blue then Vibrant Orange then the sheet then Bold Pink
then Smart Blue. It is the one screen left that reads the week as five days. The
month view had the same wash until a day was shaded by what it asks of the user
instead.

Wednesday is the sheet itself. Because a) the palette holds four colours that
survive as a light wash and not five. b) a light Grey wash and a light Warm Grey
wash both land under 5 delta E of Warm Grey. c) an unwashed day reads as its own
day against the four and invents no shade.

The first cut of this used contrast alone and shipped a Monday and a Wednesday a
pixel apart. Both cleared 13 to 1 under Smart Blue and neither could be told from
the other. Contrast answers whether text on a ground can be read. It does not
answer whether two grounds differ. `colour.test.ts` now holds three figures. No
two weekdays come within 9 delta E. Neighbours hold 12. Every wash clears Warm
Grey and the tint by 6.

Grey reaches 4.07 to 1 at best on a wash and body text needs 4.5. So the weekday
name and the day flag and the add mark on a board cell all left Grey for Smart
Blue. Size and weight are what recede them now.

# The specification placeholder

Gone. A row with a cost centre always holds a specification so there is nothing
to prompt for. The empty option remains only for a row with no cost centre.

# The quick fill shares

A share is dragged rather than typed and the month is always whole. What one row
takes the others give up in the proportion they already held, so a row at twice
another stays at twice it.

This is option B of six. Because a) the arithmetic of making four figures reach
a hundred is the complaint the `100 / n` button was added for. b) B is the only
one of the five that removes that arithmetic rather than checking it afterwards,
because the total cannot leave a hundred. c) the shares are a split of one month
and a control that can express nothing else says so.

It costs predictability. One drag rewrites figures the user did not touch, which
is the thing people distrust in a control like this. `Hold` is what pays it. A
held row is held out of the balancing so a share the user has settled is not
moved by the next drag. A drag with every other row held has one legal value and
the handle stops dead on it rather than letting the total leave a hundred.

`balanceShares` in core does the division. The floors are dealt first and the
remainder goes to the rows the division cut hardest, so the total lands on a
hundred rather than on 99. It is the same largest remainder rule
`halvesPerAllocation` uses on the days below it.

The shares stay split evenly while nobody has dragged one. Adding or removing a
cost centre resplits them so the list is usable straight away. The first drag
hands them over. After that a cost centre leaving gives its share back to the
rest in proportion rather than dropping the total under a hundred. The `100 / n`
button hands the shares back to the app and clears every hold with them. An
automatic share is shown italic like a default specification.

`mustBe100` is kept as the backstop rather than deleted. No drag can raise it and
a test holds that. A rule nothing can reach is still the thing that catches the
case nobody thought of.

The share column costs 50px. The specification column gives 40px of that back and
the table scrolls the rest the way it already did. The cell is two lines, the
track on the first and the hold and the figure on the second. Because a) measured
in the running app at a 1440px window the section gives the table 732px and the
cost centre column takes 321px of it on a long name. b) one line of 230px put the
figure 43px past the visible edge, so the value being dragged sat in the part of
the table that scrolls. c) two lines give the track 148px where one line left it
95px, and one per cent of a 95px track is under a pixel.

At a 1280px window the figure is still past the edge. That is the cost centre
column rather than this, and the share field was off the visible table there
before any of this was built.

The six pages this was picked from are in `mockups/`. `shares-index.html` lists
them and `s2-balance.html` is the one that won. The four that lost are kept
because a decision is only readable beside what it beat.

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

The header carries a switcher where no user pool is configured. It sets the
headers the local API reads in place of a token. Three identities ship. Two are
ordinary users with their own profile and their own timesheets. One is in the
backoffice group and is the only one that may replace the catalogue.

The control renders only in a development build with no pool. A build that has
one shows the name from the token beside a sign out control instead.

# What backoffice can do

One thing. `PUT /api/admin/catalogue` replaces the project list and the bank
holidays. Everyone else gets 403 on that route.

Nothing else separates the two. A backoffice member has their own profile and
their own timesheets like anybody else and cannot read another user sheet.
Answer 29 says that is right.

Answers 11 and 12 and 14 say backoffice uploads two spreadsheets. Each upload
replaces what is there.

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
Lambda then needs no spreadsheet parser in its bundle. b) the reader is the same
code the fixture tool runs so an upload and a fixture rebuild cannot disagree.

The file is 660 kB. The lists it holds are 1.3 MB of JSON on the wire. They are
46 kB gzipped in the DynamoDB item. The HTTP API takes 10 MB so the request has
headroom for a project list well past the 5142 rows the real one carries.

`packages/workbook-reader` holds that parser. It takes bytes and touches no
filesystem. It refuses anything that is not a tracker rather than storing an
empty catalogue.

`toCatalogueInput` in that package is the one step between the parser and the
API. The page sent the parser output untouched before it existed. A broken
specification range then reached the store as an object where the type says a
name. The fixture seed had always mapped it so only a deployment held the wrong
shape.

`apps/api/src/__tests__/catalogue-upload.test.ts` uploads every workbook in the
repository root over real HTTP and then asks the picker for a cost centre.

Each upload replaces everything. The page reloads the catalogue afterwards so
the editor reflects it without a refresh.

The counts on the page are what the picker will offer rather than the rows the
workbook holds. `setCatalogue` drops a repeated workday id so the row count
overstates it by hundreds. `offeredWorkdayIds` in `@tracker/core` is the one
place that number comes from. The upload route answers with it too.

The page names the workbook now in use so a deployment can be told from the file
it was loaded from.

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

The two absences sit above that list on a square each. Because everyone books an
absence where a cost centre is booked by the few who own it.

# The tour

Each page names its own steps and each step names the element it points at
through a `data-tour` attribute. An attribute is used rather than a class
because a class is there to be restyled and a rename would break the tour in
silence.

    month       6 steps   the tabs, period, target, reference list, checks,
                          download
    quick       4 steps   rows, share, even them out, fill
    guided      5 steps   days away, place them, which absence, projects, build
    settings    4 steps   location, entity, business line, contract
    admin       3 steps   drop, preview, replace

The tabs are drawn by the shell so they stand on every page. One step covers
the whole strip and it is toured from the month alone. Because a) a page offers
its tour once and unasked. b) a step per tab would be six steps before the page
itself is reached. c) the month is the page the app opens on.

A step whose element is not on the page is dropped rather than shown pointing at
nothing. The download panel is absent for a user with no API and the admin page
is absent for anyone outside the backoffice group. The guided tour leans on the
same rule. Step two of that page is drawn only once step one has been answered
so a first visit is walked through three steps and a second through five.

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

# A deployment while the page is open

A tab loaded before a deployment keeps running the bundle it was given. There is
one bundle because the routes are imported statically. So no later request can
fail on a name the deployment has dropped. Nothing tells the page on its own.

`useVersion.ts` reads `index.html` every ten minutes and again whenever a hidden
tab is looked at. It compares the hashed asset names in that answer against the
ones this page was given. A build moves the hash of whatever it changed so those
names are the version.

The check needs nothing added to the deploy. Because a) `index.html` already
goes up with `no-cache` and is invalidated. b) every asset beside it is hashed
and immutable. c) a build id written beside them would be a second thing to keep
in step.

The names this page runs are taken as the bundle loads rather than at each
check. Because a `modulepreload` written into the page for a chunk fetched later
would otherwise read as a version nobody served.

The demand blocks rather than informs. The open month is written first then the
shell replaces the routed screen with the reload button. The wizard and the tour
are withdrawn so nothing can cover it. A read that fails is ignored because an
offline tab is not a new version.

# The seed for local development

`pnpm fixtures` reads every workbook in the repository root and writes
`packages/fixtures/data`. It stands in for the API in the browser and it is what
`apps/api/src/local.ts` serves.

Two kinds of workbook go in. The tracker carries the hidden reference sheets and
the catalogue is taken from the newest of them. The 4s project numbers list is
the second workbook backoffice uploads and it is laid over that catalogue here.

The absent numbers are added rather than left out. Because a) the seed is what a
fresh deployment stores and a fresh deployment is set up by uploading both. b) a
number the tracker has not got is unbookable until it is added. c) the admin page
adds them by default so a seed that did not would differ from every real
catalogue. The list names 462 rows the tracker left blank and adds 312 it has not
got at all.

`source.projectNumbers` records which list was laid over and when it was cut. A
test reads the list back and checks every number in it is bookable in the seed.
The two files can otherwise drift apart in silence the moment one is replaced.

Any other spreadsheet in the root is skipped rather than reported. The reader
throws `NotAnUpload` for a workbook that is not this list.

# Where a cost centre comes from

A 4flow ticket rarely carries one. The epic above it carries one for everything
beneath so the Jira client walks the parent chain five deep and returns the
ticket the value came from beside it.

The screen resolves four answers in order. A cost centre set against this one
ticket. The Jira field from that chain. The project map on the profile. Nothing.

One project is not one cost centre. A 4flow project runs work for several of
them so the project map is a guess for every ticket of it. A row nothing
answered now carries a picker of its own and what it writes is kept against the
ticket in `jiraTickets` on the profile. The project map is still offered under
the table for a whole project at once.

Under the Workday ID in smaller writing is where the figure was found. `Cost
centre 99980100 from PLRS-900` names the epic that answered. A cost centre read
off an epic reads exactly like one written on the ticket until the screen says
which it was.

A number Jira carried which the catalogue does not know is reported on the row
in orange. The row still books against whatever answered underneath it so
saying nothing would read as Jira carrying none at all.

A pick made on the screen used to outrank Jira until the page was read again and
rank third after it. So one answer resolved two ways. The project map now ranks
third whenever it was written and a ticket answer ranks first.

# The aggregation block

Tracker column AB is the group. The workbook names it the combined cost centre
and builds it as `CONCAT(I," - ",J)` which is the Workday ID and the
specification. Cell K71 then reads `SUMIF($AB$5:$AB$66,AB71,$K$5:$K$66)`. So one
cost centre booked under two specifications is two rows and the same
specification under two cost centres is two rows.

Absence is not in it. The grand total at M88 is `SUM(K71:K87)` which spans the
block and the two absence lines under it. A vacation day written in both places
is counted twice. The submitted August workbook books five vacation days and its
block names the cost centre alone.

The export wrote them in both places until 2026-09-14. Twelve project days and
five vacation days read as twenty two against a stated total of seventeen. The
summary panel showed the same month the same way. `aggregateByProject` now drops
a booking whose Workday ID is one of the two the tracker gives a line of its
own. A label on neither line stays in the block so no booked day can fall
between the two.

The check that would have caught it is that rows 71 to 87 total the month once.
The old test asked only that every row Excel wrote appears in the block and
never that the block holds nothing else.

# The blocks below the grid

Both move together. The block at 71 holds fifteen slots and grows past them
rather than dropping a group. The per week block sat at a fixed row 92 so a
month holding twenty one groups wrote I92 and K92 and M94 twice. Excel refuses a
sheet holding a repeated reference.

The per week header is now `max(92, grandTotalRow + 4)`. A month inside the
fifteen slots lands on 92 exactly so the shipped layout is untouched. A month of
twenty one groups puts it on 98. LibreOffice opens both.

# Column M carries the business line

Its header reads `Name of project [Business Line]` and the workbook builds the
cell as the Workday Title and then `[BL ` and the line. The export wrote the
title alone until 2026-09-14 so the header named something the column never
carried. `projectLabel` appends it. A cost centre nothing names the line for
keeps the bare title rather than an empty `[BL ]`.

# Column I carries a number

The workbook holds a Workday ID as a number and an absence label as text. The
export wrote the whole column as text. `workdayCell` converts a canonical
integer and leaves everything else alone. Because a) a leading zero is part of
an id that carries one. b) an id past the safe integer range would not survive
the trip through a double. c) `String(Number(text)) === text` refuses both
without needing a rule for each.

All 3149 ids in the shipped list are plain digits under seven of them. Nothing
in the catalogue today takes the text branch. The two absence labels do.

# What the export still does differently

Cell L71 reads `n.a.` in the submitted workbook. Its formula looks the Workday
ID up as a number against a project list column of text so the lookup fails.
Cell M71 on the same row succeeds because that formula wraps the id in `TEXT`
first. The export resolves the customer on both. Copying a fault to match a
cached value is not fidelity.

An unused slot at rows 72 to 85 holds the text `"0"` in the workbook because the
formula quotes its zero. The export writes the number. A Days column that sums
is worth more than the quoting slip.

Every other cell of the block now matches the submitted workbook exactly.

# One mark a field rather than one mark a row

A row is part filled when it holds some of what it needs. The grid carried one
mark for that state and every control in the row took the colour. A row missing
only its day value therefore marked the cost centre that was filled in and the
user read all three fields to find the empty one.

There is one predicate a field now. `missingWorkday` and `missingSpecification`
and `missingDays` in `useRowEdit.ts` each answer for one control. `incomplete`
is the three of them together and it is what still marks the row.

The day value was marked by nothing at all before. It is a required field so it
is marked like the two beside it.

`missingSpecification` reads `specificationIsRequired` from core. So a cost
centre whose list the workbook leaves empty is no longer marked for a blank the
validation allows. The grid and `validate` disagreed about those 44 cost centres
before. The grid marked them and the export accepted them.

The board view carries the same three marks. Both views read the one file so
neither can drift from the other.

# Reading Jira again

A month is served from a copy the server holds. A closed month for a day and the
current one for fifteen minutes. So a ticket closed this morning is absent from
the screen until something asks for it again.

The refresh button is that ask. It is `POST` on the path the `GET` already
reads. Because a) the question is the one the read asks and only the stored
answer is refused. b) a second path would state the same route twice. c) neither
adapter passes a query string through to a handler.

The table stays on the screen while a refresh runs. A table that empties itself
for two seconds reads as a failure. The first read of a month has nothing to
show so that one still takes the whole band.

# The tickets still being worked

The screen opened on the closed month alone. A month is often spent on work that
is not finished and none of it was on the screen.

The scope switch names two. `closed` is the month as it was. `all` adds a third
search for the tickets still being worked.

    assignee = currentUser()
    AND statusCategory = "In Progress"
    AND updated >= "2026-08-01"
    AND updated <  "2026-09-01"

Bounded by `updated` rather than by `resolutiondate`. Because a) nothing has
resolved one of these so it carries no resolution date. b) an unbounded search
returns the whole backlog of the account. c) a ticket touched inside the month
is the one the month was spent on.

The third search runs only where the wider scope was asked for. A month read as
closed costs exactly what it cost before.

A row with no resolution date shows its Jira status where the date would go.
`CompletedTicket` gained `status` for that and the ticket cache version moved
with it.

The stored copy records which scope wrote it. A month read as closed holds none
of the tickets still being worked so it is not the answer to the wider question.
The narrower one is a subset of the wider cache and is still refused. Because a)
filtering it would put the JQL rule in a second place. b) one search is what it
costs.

# The cost centre list

`/cost-centres` reads the catalogue. The picker answers which one to book
against and it is driven from the keyboard so it shows a few rows at a time.
This answers what is there and what each one may book.

The specification list of a row is the point of the page. A cost centre that
names its own list may book those and nothing else. One whose list the workbook
leaves empty may book anything and the row says which of the two it is.

The ranking is `searchProjects`. That is what the picker reads so a search here
answers what a search there would. A second ranking would leave the two screens
disagreeing about which row comes first.

The nav entry for the backoffice upload was called `Cost centres` and it now
reads `Backoffice`. Two entries cannot carry one name and the upload screen is
the backoffice one.

# The guided build

`/guided` writes a month from three answers. How many days you were away. Which
days those were. Which projects you worked on.

The split is the whole reason it exists. Absence has to be recorded on the day
it was taken because that is the date the recipient checks. Work does not,
because the tracker asks what was worked in the month and never on which day.
The month view treats both the same so every day of both is placed by hand.

`guidedMonth` in core writes the absence first and then closes that day to work.
The work spreads over what is left through `bookableDays`, which is what the
quick fill already spreads by. So a guided month divides its weeks the way every
other built month does.

A half day off closes the whole day rather than leaving the other half open.
Because a) the work spread divides a month by week and knows nothing of a day
already part booked. b) half a day is what such a month falls short by and
`shortBy` says so. c) the user finishes that day in the month view where the
other half is one click.

A day off on a weekend or a bank holiday is dropped rather than booked. The
tracker books no non working day so the row would be an error. The dates are
reported so the miscount is visible.

The result is a timesheet like any other. Nothing here submits it and the month
view edits it.

Step one asks for a count of each absence the catalogue holds rather than one
count under one label. Because a) the workbook totals `Vacation or sickness`
apart from `Other absence`. b) a month holding both is ordinary rather than the
exception. c) a single label made the user build the month twice or correct the
second kind by hand afterwards. A switch above the calendar says which absence
the next placed day takes. It is drawn only where step one asked for two.

Step two is a calendar board and not a list of days. Because a) a day off is
remembered as a date on a month and the question is better asked on the shape
the answer is held in. b) a run of days off reads as a run across a week. c) the
weekend and the bank holiday the month already lost are on the screen instead of
being silently left out of a list. Only a working day is a button. A day the
tracker books nothing on is drawn and holds nothing.

`useCalendarBoard.ts` lays the weeks out and `MonthCalendar.vue` takes them from
the same place. Two boards that disagreed on where a month starts would be a
fault nobody thinks to look for.

The counts are capped together at the working days of the month. Two counts that
could never be placed would otherwise leave the build button disabled with
nothing on the screen saying why.

The build opens the month view rather than offering a button to it. What the
build has to report travels with the user because `GuidedResult.vue` on that
page reads the same result. It names the days away and the days of work and it
warns where the month fell short. It is dismissed by hand because the warnings
name days a person has to decide about.
