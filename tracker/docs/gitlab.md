# Reading GitLab into the tracker

A plan. Nothing here is built yet.

The tracker already reads Jira. `docs/jira.md` is that design. This reads the
commit history of one person on `gitlab.4flow-software.com` and turns it into
the rows of a monthly timesheet.

The ticket id comes out of the commit message. Not out of a GitLab issue and not
out of a GitLab timelog. So what is read is the git history rather than anything
anybody filled in afterwards. Because a) a commit is written while the work
happens. b) a task board is filled in when somebody remembers. c) the history
exists whether or not the team keeps a board at all.

`docs/gitlab-admin.md` is the request to send to whoever administers the
instance. It can go out before any of the work below starts.

## Terms

Commit. One entry in the git history. It carries a message and an author email
and an authored date.

Push. One event. It carries the project and the branch and the range of commits
that arrived.

Ticket id. What is parsed out of a commit message. A Jira key such as
`PLRS-1141` or a GitLab issue reference such as `#412`.

Provider. Jira or GitLab. A user may link both and this design is better when
they do.

## What was verified

Everything below was read from the live API rather than recalled. The commands
are in `32.log`.

Lambda reaches the instance so no VPC is needed.

**A push event carries one commit title and not the rest.** `push_data` holds
`commit_count` `commit_from` `commit_to` `ref` and a single `commit_title`. So
events alone lose every commit of a push after the first.

**The commits API carries the whole message.** `GET
/projects/:id/repository/commits` returns `id` `title` `message` `author_name`
`author_email` `authored_date` `committed_date` `web_url`.

**`ref_name` accepts a revision range.** `ref_name=<from>..<to>` was run against
a public project and returned the commits of that range. So the `commit_from`
and `commit_to` of a push event fetch exactly the commits of that push.

**`author` matches loosely.** Filtering the same month by `Vishal Tak` and by
`vtak@gitlab.com` and by `Vishal` all returned the same sixteen commits. It
matches the name or the email and it matches on a substring. So it is a
pre-filter and never a proof.

**There is no instance wide commit search.** `GET /search?scope=commits` needs
Advanced Search and a Premium licence. It cannot be assumed.

**`GET /users/:id/contributed_projects` exists.** It answers 200 with full
project objects although the users API page does not document it.

## The read

Two steps. Events say which pushes were this person. The commits API says what
was in them.

```
GET /events?action=pushed&after=2026-07-31&before=2026-09-01
    -> project_id, push_data.commit_from, push_data.commit_to, push_data.ref

GET /projects/<project_id>/repository/commits?ref_name=<from>..<to>&per_page=100
    -> message, author_email, authored_date
```

The event is the authority on whose work it is. Because a) GitLab attributes the
push to the account that made it. b) a commit carries only a git author email
and that email may be a personal address GitLab has never seen. c) matching on
email alone would silently drop a person whose git config disagrees with their
account.

The commits of a push are then filtered by `author_email` against the emails of
the account. A push that carries somebody else work after a rebase is dropped by
that filter. A push where no commit matches any known email falls back to taking
the whole push. Because a mismatched git config must lose precision rather than
lose the month.

### Where a new branch breaks it

`commit_from` is all zeros on the first push of a branch. There is no range to
ask for. The fallback is `since` and `until` on that project with the `author`
pre-filter and the same client side email check.

### What bounds the month

`after` and `before` on the events call. Both are dates. Note that `after` is
exclusive so the day before the first of the month is what goes in.

### The retention window

GitLab prunes user activity events on a schedule the instance sets. A month
older than that window returns no events and therefore no projects. The fallback
is `GET /projects?membership=true&last_activity_after=<from>` which reads
membership rather than activity and has no window. It returns a superset so
every project it names is then read with the `author` pre-filter.

Six months of history are kept by the tracker. So the window matters and it is
worth asking the administrator what it is set to.

## Turning commits into rows

### Parsing the ticket id

A Jira key is `[A-Z][A-Z0-9]+-\d+`. That pattern also matches `UTF-8` and
`SHA-1` and `ISO-8601` so a bare regex is not enough.

Two guards. A denylist of the known false positives. Then a check of the prefix
against the Jira projects this person can see. The second guard is only
available when the same user has also linked Jira and that is the argument for
linking both.

A GitLab issue reference is `#\d+` and a cross project one is
`<group>/<project>#\d+`. A merge request is `!\d+`.

The whole `message` is searched rather than the `title` alone. So
`Merge branch 'PLRS-1141-fix-the-thing'` is caught and so is a trailer.

### The two integrations compose

GitLab says which ticket and on which day. Jira says what the ticket is.

| Field | Without Jira linked | With Jira linked |
| --- | --- | --- |
| `key` | the parsed id | the parsed id |
| `summary` | the commit title | the Jira summary |
| `projectKey` | the key prefix | the Jira project key |
| `resolvedAt` | empty | the Jira resolution date |
| `parentKey` | null | the epic |
| `costCentre` | null | the Jira cost centre |
| `days` | the dates committed | the dates committed |

`projectKey` being the key prefix matters. `PLRS-1141` yields `PLRS` which is
already what the per user project map on the profile is keyed by. So no new
profile field is needed and a person who has mapped their Jira projects has
mapped their GitLab commits at the same time.

### Where the hours come from

Nowhere. A commit records a moment and not a duration.

This is the same position the Jira reader is already in. `docs/jira.md` records
that the 4flow site holds no worklogs so the user types most of the hours.

The proposal is to seed rather than leave blank. For each day the person
committed split the working day evenly across the tickets they committed to that
day. One ticket on Tuesday takes the whole of Tuesday. Three tickets take a
third each. The person then corrects it.

`hoursSource` becomes `commit` so the screen can say where a figure came from
and mark it as a guess rather than a fact.

This is decision 1 below and it is the one worth arguing about.

## What mirrors the Jira integration

The instruction was to keep this as close to Jira as possible. The credential
half is identical.

| | Atlassian | GitLab |
| --- | --- | --- |
| authorize | `client_id` `redirect_uri` `response_type` `state` `scope` | same |
| token body | `client_id` `client_secret` `code` `grant_type` `redirect_uri` | same |
| refresh body | `client_id` `client_secret` `refresh_token` `grant_type` | same |
| body encoding | JSON | form encoded |
| secret required | yes | yes |
| rotates on refresh | yes | yes |
| grace on a spent token | ten minutes | none documented |
| access token life | 1 hour | 2 hours |
| scope | eighteen granular reads | `read_api` |

So `jira-tokens.ts` carries over untouched. All four rules against the rotation
race still apply and so does the KMS cipher and the generation check and the
lease.

`CompletedTicket` does not change. The link record does not change either. It is
sort key `JIRA` under `USER#<sub>` today so a `GITLAB` sort key sits beside it
and no existing item moves.

The routes and the cache in `jira-handlers.ts` are provider neutral already.

## What cannot mirror it

**The read itself.** Jira answers one JQL search. This walks events then commits
per project. It is more calls and they cannot be made in parallel because the
second depends on the first.

**Rule three.** Atlassian reports that a spent refresh token keeps working for
ten minutes. GitLab documents no such window so the fallback is not attempted
and the window is zero.

**The as-user switch.** `jira-dev.ts` reads the month of another account for a
test. `GET /events` is the authenticated user alone. Reading another person
needs `GET /users/:id/events` and that shows only what is public. The switch
becomes a fixed capture or it goes.

**`jira-scopes.ts` has no mirror.** Eighteen granular scopes derived from an
endpoint map earn a test. One scope does not.

**The cost centre.** No commit carries one. It arrives through Jira or it does
not arrive.

## The work

Five steps. Each leaves the tree typechecking and the suite green.

### 1. The administrator request

Send `docs/gitlab-admin.md`. Ask for the activity retention window at the same
time because it bounds how far back the reader can see.

Nothing else waits on this until step 5.

### 2. Make the shared machinery provider neutral

No behaviour changes. The Jira tests must pass untouched at the end.

- `repository.ts`. Add `Provider`. Rename `StoredJiraLink` to `StoredLink`. Turn
  the six link methods into `links(provider)` returning a `LinkStore`. Make
  `PREVIOUS_REFRESH_WINDOW_MS` a record keyed by provider.
- `dynamo.ts`. The sort key comes from the provider.
- `ticket-source.ts`. New. Holds `TicketSource` `TokenSet` `Refusal`
  `refusedTheTracker` `SourceUnauthorised` `SourceThrottled` `monthBounds`.
- `jira-tokens.ts` becomes `tokens.ts`. `TokenDeps` gains `provider`.
- `jira.ts` keeps `AtlassianJira` and the JQL and imports the rest.

This is the one step that touches working code. It is worth it because
`jira-tokens.ts` is 217 lines of race handling that must never drift between two
copies. The alternative is to copy that file and accept the drift.

### 3. The parser

Pure and testable and it needs no network. So it comes before the client.

- `packages/core/src/ticket-ids.ts`. Takes a commit message and returns the ids
  in it. Holds the denylist.
- Its test takes real 4flow commit messages. Somebody has to paste a hundred of
  them in.

### 4. The GitLab client

- `packages/core/src/gitlab.ts`. The scope and the constants.
- `apps/api/src/gitlab.ts`. `GitLabSource implements TicketSource`. Events then
  commits then the parser then the grouping by ticket and by day.
- `apps/api/src/gitlab-fake.ts`. A capture of one real month.

### 5. The routes and the screen

- `apps/api/src/gitlab-handlers.ts`. The same four routes under `/api/gitlab/`.
- `lambda.ts` `local.ts` `dev-server.ts`. A second source beside the first.
- `infra/lib/tracker-stack.ts`. A `tracker/gitlab` secret and a KMS key.
- The web side and the eight message files.

Only step 5 needs the application id so it is last.

## Decisions to make

1. **Do commits seed the hours?** Splitting the day evenly across the tickets
   committed that day gives a first draft the person corrects. The alternative
   is to leave every row at zero as the Jira reader does today. A seeded figure
   that nobody checks is worse than a blank one that forces a look.
2. **Does a merge commit count?** `Merge branch 'PLRS-1141'` names a ticket but
   records no work. Probably drop any commit with more than one parent.
3. **Do merge request references book?** `!412` names a merge request rather
   than a ticket. Probably not.
4. **How far back does the instance keep events?** It bounds the reader and only
   the administrator knows.
5. **What happens to a commit carrying no ticket id at all?** It is real work
   and the timesheet has nowhere to put it. Probably a row keyed by the project
   with the commit titles beneath it.
6. **Which email addresses are the person?** The account may know one and the
   git config may use another. The fallback described above loses precision
   rather than the month but it is worth checking against real data first.
