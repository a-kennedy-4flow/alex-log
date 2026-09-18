# Counting what gets used

A plan and a set of findings. Nothing here is built yet.

Polaris measures which of its features earn their place. `../polaris-frontend`
holds that design and `packages/shared/src/telemetry/README.md` is its spec. This
document is what came of reading it against this repository. It keeps the grammar
and drops the SDK.

The headline question is how long a month takes. The tracker exists to replace a
660 kB macro workbook. "Eleven minutes instead of fifty" is the sentence that
justifies the application. No count of clicks says it.

## Terms

Six words below could be read more than one way. They are defined here once for
the whole project.

**Machine dimension.** A token a query groups on. `feature` and `section` and
`control` and `verb` and `route` and `facet`. Never reworded once it has shipped,
because rewording one splits its own history in two.

**Display field.** Plain English shown as it is. A feature name and a control
label. Reworded freely because nothing groups on it.

**Declared control.** A control some module named. It exists whether or not
anybody ever touched it. The declared set is what tells a count of zero from a
control that was deleted.

**Facet.** A surface within one screen. The month is a grid or a board on one
path, so the path alone cannot say which of the two the time was spent in.

**Visit.** One loading of the page. A token made in module scope and never
stored, so a reload is a new visit.

**Engaged seconds.** Foreground seconds on a visible tab with an input inside the
last sixty seconds, accrued in five second ticks, attributed to the facet open at
the time.

## What Polaris does

Four event names and no more. `feature_view` and `action` and `search` and
`control_catalogue`. The taxonomy lives in the attributes rather than in the
names, and the discipline is to resist adding a fifth.

The split between a machine dimension and a display field is the whole design. A
feature label is injected automatically from a `Record<Feature, string>` so the
union and the labels cannot diverge. Only the cross cutting axes are shared. Each
feature owns its own section and control tokens, so the foundation never has to
know every control on every screen.

`defineFeatureTelemetry` is the idea worth taking. Declaring a control registers
its catalogue row and returns the pre bound emitter in the same call. So there is
no second list to drift from the emitting code, and no string literal at a call
site to mistype.

One client owns whether the SDK is up, so nothing else in the codebase asks. It
buffers a hundred emits across the gap and replays them. It snapshots a mutable
measurement before buffering. It wraps every SDK touch in a swallow, and the
documented rule is that a caller must not add its own try. Init is deferred to
`requestIdleCallback` so a slow telemetry dependency never sits on the critical
path, and the buffer is what makes that safe.

Errors and vitals are delegated to the SDK entirely. Polaris has no custom Vue
error handler at all.

## What this repository already records

This is the finding that changed the shape of the work. The stage access log at
`infra/lib/tracker-stack.ts:527` already records the caller and the path and the
method and the status and both latencies, for one month, queryable today.

So these are answered already and instrumenting them would be waste. How many
people use the tracker, because `App.vue` fetches `GET /api/me` once a load.
Download or email, because both are distinct paths including their failures.
Whether the Jira estate earns its keep, because link and month read and unlink
are three more. Admin uploads. Editing volume. Every latency worth having.

Time to first save is free too. The first `GET /api/me` to the first
`PUT /api/timesheets/` per caller per day, out of the same log.

One trap. `routeKey` is `$context.routeKey`, which for everything under the proxy
is the literal string `GET /api/{proxy+}`. Group on `path` and never on
`routeKey`.

## What it cannot record

A span is not a duration. Somebody who opens at nine and again at five reads as
eight hours. Logs Insights cannot cluster by gap either, so sessionising the
autosave writes needs an exported dataset and a script. That is more work than
the client code and less accurate.

It sees no reading time. `/privacy` and `/credits` make no request at all. The
Jira screen makes two and is then read for minutes.

And it cannot separate the grid from the board. Both live on `/` and both produce
the same `PUT /api/timesheets/{period}`. That is the question that could delete
`MonthCalendar.vue` and `SimpleView.vue` is 343 lines behind it.

So the gap is seven route views, about twenty five in page controls, one locale
field, the engaged seconds, and three error hooks.

## Why no third party

The content security policy at `infra/lib/tracker-stack.ts:248` allows `'self'`
and the hosted UI and `api.tracker.4flow.io`. A collector on a Grafana host needs
a fourth entry.

`script-src 'self'` is not the obstacle and nobody should describe it as one. An
SDK taken from npm and bundled by Vite is served from our own bucket, so it is a
first party script under that directive. The only cross origin traffic is the
fetch to the collector, which is `connect-src` and nothing else.

The real objection is not the policy. This application sends data to a third
party in exactly one place, and that place has a per user consent flow in front
of it. Polaris sends to its own company's estate so no third party transfer
happens there at all. A collector here would be a materially different posture
from the one being copied.

A first party route needs no policy edit and no CORS edit. `content-type` is
already allowed. `POST /api/telemetry` already matches `/api/{proxy+}` with POST
under the authorizer that exists. So `infra/lib/tracker-stack.ts` is not edited at
all.

If the collector turns out to be the same estate that already holds Polaris the
calculus changes and the faithful port becomes defensible. The vocabulary and the
declaration and the declared set all carry across unchanged. Only the queue and
the ingest would be replaced.

## Where the events go

Log lines, and not rows in the table.

This reverses an earlier draft and the reason is worth keeping. An aggregate on
write counter was the better design for counts and it is the wrong design for a
duration, because a counter cannot hold a distribution. Adding seconds and facet
and visit to a log line is three fields. Adding them to a counter schema is a
change to `Repository` and `DynamoRepository` and `MemoryRepository` that must
move together, plus a decision about how to aggregate with no index.

The scope of this work changed once already. So the sink that absorbs a change
cheaply is the sink to pick. `Deps` and `Repository` stay untouched, which is the
whole point.

One line per event and not one per request. Because a) Logs Insights groups on a
field it can parse out of a line and an array in one line is not one. b) a line
is about two hundred bytes. c) `reminder-lambda.ts:50` already names a structured
line the same way.

The log group already carries one month of retention, which is what the notice
already promises. Telemetry landing in the same group as the request that carried
it is the same promise.

## The engaged figure

Accrued on a tick and never measured across an edge. Because a closed laptop
fires no timer, so a tick credits nothing across a night where subtracting two
clocks would credit the whole of it. The tick is the more honest arithmetic
rather than merely the simpler one.

`performance.now()` and never `Date.now()`. A clock NTP moved backwards would
credit negative time.

Idle at sixty seconds. Because a) a month is filled in runs of entry with pauses
to think and a pause under a minute is one of them. b) a minute with no key and
no pointer and no scroll is somebody doing something else. c) a tab left on a
second monitor would otherwise read as an afternoon of use.

The reset events are `pointerdown` and `keydown` and `wheel` and `scroll`.
`pointermove` is deliberately absent. A mouse crossing the window is not work and
the listener would fire hundreds of times a second.

Closed out before the facet moves, on hide, and at a five minute cap. Before and
not after, because otherwise the time lands on the screen the user just arrived
at. That is the lesson `useTimesheet.ts` already learned about writing a month
after the period moved.

What the figure is, and is not. It is a floor, because somebody reading the
summary panel without touching anything accrues nothing. The undercount errs in
the safe direction. It counts no background tab and no sleeping laptop. It
converts to no figure from any other tool. And it is read in aggregate. This
figure is not a productivity measure. No screen and no route and no export in
this application shows it for one person. If anybody asks for that the answer is
no.

## What was dropped from the Polaris design

Each of these earns its place there and not here.

The runtime `control_catalogue` event and its localStorage daily claim. It exists
because Loki cannot tell zero usage from a deleted control across 250 controls.
With twenty five controls declared in one file in git the same guarantee comes
from a test that reads the source, which is the `styles.test.ts` precedent. No
event, no storage key, no packed JSON.

Two of the five builders. `actionWith` and `actionWithPayload` go with the
attribute bag. `dynamicControl` goes because a mapper is how a value becomes a
token. What replaces all three is `variants`, which takes a union and declares a
row for every member, so the declared set holds each one rather than a
representative.

The hundred emit replay buffer. It exists because Faro init is deferred. With no
SDK there is no readiness gap to buffer across. A cap stays, for a different
reason. A render loop calling a counter must not grow an array without bound.

The `section` axis in places, the feature label field, the `EVENT_DOMAIN` field,
the tenant gate, and emitting every timing twice as a measurement and an event.
There is one domain and one route and no tenants and no Grafana measurement type
to emit into. Three tokens name every event here.

Page readiness instrumentation. Time to ready is not time spent, and the one
readiness number this app has is the latency on `GET /api/catalogue`, already
recorded.

## What was added that Polaris does not have

Error capture, written by hand. There is no `app.config.errorHandler` and no
`onErrorCaptured` and no `window.onerror` and no `unhandledrejection` handler
anywhere in this repository. Polaris gets all of them free from the SDK. Here a
render that throws is a blank page and a colleague mentioning it the following
week.

The listeners go in before `start()` runs and outside the async function. Because
`start()` awaits the catalogue and the token and two callbacks, so a throw in any
of them is outside Vue's lifetime altogether.

The message goes and the stack does not, because a stack names the source map. At
most three a page and never the same one twice, because a render that throws
throws again on the next tick.

This is the highest value per line in the whole port. If only one half of the
work gets built, build this half.

## Hazards found in this codebase

Seven things that would each have been a defect.

`callerHeaders()` in `lib/api.ts` awaits `apiToken()`. And `apiToken()` at
`lib/auth.ts:259` renews a token inside its margin, then calls `await signIn()` at
line 268 when the refresh token has run out. That navigates the page to the hosted
UI. So a background flush reaching it could take the month off the screen while
somebody was typing into it. The transport needs a reader that returns the token
already held and renews nothing.

`request()` throws `ApiError` on a bad status. A telemetry post must not put an
error into app code, and an unhandled rejection from a background timer is a
console line nobody can act on.

`UpdatableStaticRouteOption` in TanStack Router is `{} extends
StaticDataRouteOption ? optional : required`. Augmenting it with a required member
makes `staticData` compulsory on every route in the tree. Every member must be
optional.

TanStack Router has no `afterEach`. The analogue is
`router.subscribe('onResolved', …)`, which fires on the first load too, and whose
payload carries the location and no route and no meta. So the feature is read off
`router.state.matches` rather than handed over by the event. A change of search
alone must be filtered on `pathChanged` or the tour and the period each re emit
the view they are drawn on.

`main.ts` replaces the address before `createApp`. A page view subscribed earlier
than that would report `/auth/callback?code=…`, and a failed callback leaves a
spent grant code in the bar. So the subscription goes after the move, and a view
carries the pathname and never the search.

`MemoryRepository` lives in `repository.ts` beside the interface so a handler
cannot tell the two implementations apart. Any storage change lands in three
places together or the dev server and every test break. That cost is one of the
arguments for storing nothing.

`count` is a DynamoDB reserved word, and the failure is a runtime
`ValidationException` no typecheck sees. Any counter field would need aliasing and
would better be named something else.

One more that is not a defect but a cost. `messages/en.ts` ends `export type
Messages = typeof en` and every other catalogue is typed against it. So one new
English key stops the typecheck of all seven others until each is filled in, and
`i18n.test.ts` fails a sentence left in English. Every word of user facing copy
costs eight translations. That is a real argument for amending one paragraph
rather than adding a band.

## The notice

`i18n/messages/en.ts` says "We use it for nothing else." That is a promise and
this breaks it. So the sentence gains a clause rather than being deleted, and it
is the existing band that changes rather than a sixth being added. One key
rewritten and seven translations and no new keys.

Every sentence in it has to be held up by something in the code. "Never what you
typed" is a token regex refusing an upper case letter and a space, checked on the
server so a hand written request is held to it too. "Deleted with the logs after a
month" is the retention already on the log group.

Consent is a notice and not a switch. Because a) what is collected carries no
personal data beyond the subject, which the access log already holds for every
request under a stated purpose. b) the basis is legitimate interest in
maintaining the tool rather than consent, and offering a switch where consent is
not the basis misrepresents the basis. c) `remindByEmail` is a switch because
sending somebody mail is an act with an effect on them and counting a button
press is not.

One part of this cannot be settled in code. Measuring how long an employee spends
in an application reads as a productivity measure whatever the intent, and in
Germany that is a works council matter under §87(1) no. 6 BetrVG rather than a
user consent one. An individual's switch would not cure a co-determination duty.
The mitigations in the design are real and they are mitigations. Aggregate
reading only, no per person screen or export, one month of retention, and the
written purpose above. Clear it before any of this ships.

## What is not built, and what it costs

Core Web Vitals and navigation and resource timing. The SDK gives them free and
nothing here replaces them. The access log already records both latencies per
route per caller.

Console capture and policy violation reports. The three swallowed `console.error`
calls in `useTimesheet.ts` each carry a comment explaining the swallow and a
fourth copy adds nothing.

A dashboard. This is the biggest cost and the only one felt every time. Every
answer is a hand typed Logs Insights query.

Seasonality. One month of retention, in an application whose entire story is
month end. A question asked in March about last December has no data. The escape
hatch is costed and not built. The reminder function already runs monthly and
already enumerates users, so a rollup written from a query into one summary item
would outlive its own retention for about forty lines and one grant. Build it
once the first month of data exists and the shape of the answer is known.

Per control dwell and a funnel. Engaged seconds say how long and never why. If
the figure comes back at forty minutes a month this cannot say whether that is
forty minutes of fluent entry or thirty five minutes of hunting for a cost
centre. Both remain additive to a log line, which is the sink argument restated
and now demonstrated rather than asserted.

The whole of it costs under three pence a month, which is under a tenth of one
per cent of the budget in `docs/budget.md`. The marginal fixed cost is zero. No
new log group and no index and no secret and no key, and per route metrics stay
off.
