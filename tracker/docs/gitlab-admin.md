# A request to the GitLab administrator

The tracker needs one OAuth application registered on `gitlab.4flow-software.com`.
Nothing below asks for an account or a licence or a change to any project
permission. No service account is wanted and no administrator token is wanted.

Send this document as it stands. It names the application and the fields and the
way to check that it worked.

## The ask in one line

Create an OAuth application named Tracker with the single scope `read_api` so a
4flow user can consent to it reading their own commit history as themselves.

## Two ways to do it

Either one works and the tracker cannot tell them apart.

| | Who can do it | Where |
| --- | --- | --- |
| Instance wide | an administrator | **Admin** then **Applications** then **New application** |
| Group owned | an Owner of the group | the group then **Settings** then **Applications** |

Take the group owned route if every project the tracker reads sits under one
group. It needs no administrator at all.

## The application

| Field | Value |
| --- | --- |
| Name | `Tracker` |
| Redirect URI | `https://tracker.4flow.io/gitlab/callback` |
| Redirect URI | `http://localhost:5173/gitlab/callback` |
| Trusted | **no** |
| Confidential | **yes** |
| Scopes | `read_api` and nothing else |
| Requested by | `a.kennedy@4flow.com` |
| Hosted by | 4flow on AWS in `eu-central-1` |

Both redirect URIs go in the same box one per line. The second is the local
development server and it may be left out if that is not wanted.

**Trusted must stay off.** Marking an application trusted skips the user
authorisation step. Because a) the whole design rests on each person approving
their own read. b) a skipped consent means somebody is read without being asked.
c) that is the failing of every alternative design that was rejected.

**Confidential must stay on.** The client secret lives in AWS Secrets Manager
and is read by one Lambda function. It never reaches a browser.

## What to send back

1. The **Application ID**.
2. The **Secret**. Send it through a secret manager or a password share. Not
   email and not chat. GitLab shows it once.
3. The version of the instance. `Help` then `Help` shows it.
4. The **user activity retention window** of this instance. It is under
   **Admin** then **Settings** then **General** then **Account and limit**. The
   tracker cannot see a push older than that window so it decides how far back a
   person can fill a timesheet.

## What it reads

One scope. `read_api`.

It is broader than it looks and this is the honest position. `read_api` grants
read access to the whole API for everything the consenting user can already see.
There is no narrower scope that works. Because a) GitLab has no per endpoint
scope so the API is granted whole or not at all. b) `read_user` reaches the
`/user` endpoint alone and neither events nor commits sit under it. c)
`read_repository` covers cloning a repository rather than reading its history
through the API so it grants more and answers less.

`api` is the writing version of the same scope and it is **not** asked for. So
the tracker cannot create or edit or delete anything in GitLab.

## What it actually calls

Three read calls. That is the whole integration.

| Call | Purpose |
| --- | --- |
| `GET /user` | who consented |
| `GET /events?action=pushed&after=&before=` | which projects that person pushed to in one month |
| `GET /projects/:id/repository/commits?ref_name=<from>..<to>` | the commit messages of those pushes |

The tracker reads the commit message and takes the ticket id out of it. Nothing
else in the commit is kept. It does not read file contents and it does not clone
a repository. `read_repository` is deliberately **not** asked for.

## What it cannot reach

`GET /events` with no user named returns the events of the person who consented
and nobody else. So the token of an ordinary user reads that person own pushes.
It cannot name a colleague.

A scope never overrides a project permission either. The application reads as
the person who consented so it sees what that person already sees. A project
they cannot browse stays unreadable.

The application holds no credential of its own on the instance. It cannot read
anybody who has not consented.

## What is stored

One refresh token per user. It is encrypted with a customer managed KMS key
before it is written and one Lambda function can decrypt it. Beyond that the
tracker keeps a cache of one month of one person for a day. That cache holds
ticket ids and dates and commit titles. It holds no source code.

A user revokes the grant themselves. **Edit profile** then **Access** then
**Applications** then **Revoke** under Authorized applications. That ends the
tracker access immediately.

## Why it is needed

The tracker fills a monthly timesheet. A commit says which ticket a person
worked on and on which day. Because a) every person reconstructs that from
memory at the end of the month today. b) the git history already holds it to the
day and holds it accurately. c) the alternative designs read a colleague history
without that colleague approving it and that is worse.

## How to check it worked before handing anything over

This proves the events go back far enough. Run it with your own personal access
token. It needs no application.

```sh
curl -s --header "PRIVATE-TOKEN: <your token>" \
  "https://gitlab.4flow-software.com/api/v4/events?action=pushed&after=2026-07-31&before=2026-09-01&per_page=100"
```

Your own pushes for August come back. An empty list from somebody who did push
that month means the retention window is shorter than a month and this design
needs rethinking before anything is built.

## How to check the application itself worked

The user presses **Connect GitLab** once in the tracker. GitLab shows the
authorisation screen naming `read_api`. The user approves. The tracker then
lists the tickets their commits named that month.

The application is listed under **Applications** wherever it was created. The
user sees it under their own authorised applications.

## References

- Configure GitLab as an OAuth 2.0 identity provider. `https://docs.gitlab.com/integration/oauth_provider/`
- GitLab as an OAuth 2.0 provider. `https://docs.gitlab.com/api/oauth2/`
- Events API. `https://docs.gitlab.com/api/events/`
- Commits API. `https://docs.gitlab.com/api/commits/`
