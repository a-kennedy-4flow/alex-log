# A request to the Microsoft 365 administrator

The tracker needs one app registration in the 4flow Entra ID tenant and one
administrator consent against it. Nothing below asks for a licence or a mailbox
or an application permission or a service account.

Send this document as it stands. It names the registration. It names the
consent. It names the way to check that it worked.

Nothing is registered yet. `docs/jira-admin.md` is the same request for
Atlassian and it was answered in one sitting.

## The ask in one line

Register a single tenant app named Tracker with the two delegated Microsoft
Graph permissions `Calendars.ReadBasic` and `offline_access` and grant admin
consent so a 4flow user can link their own calendar to the tracker without a
consent screen.

## Which of us does which part

Two routes. Take whichever is less work.

**Route one.** Grant `a.kennedy@4flow.com` the **Application Developer** role.
That role can create an app registration and nothing else. We then do steps 1
to 4 and you do step 5 alone. Step 5 is two clicks.

**Route two.** You do all five steps from the table below. Then add
`a.kennedy@4flow.com` as an **Owner** of the registration so the client secret
is created by us and never travels. Send back the two ids and nothing else.

Route one is preferred. Because a) the registration is a developer artefact
rather than a policy decision b) admin consent is the part only you can give and
it stays yours either way c) a secret nobody emails is a secret nobody has to
rotate after emailing it.

## The registration

| Field | Value |
| --- | --- |
| Name | Tracker |
| Supported account types | Single tenant only. `4flow` alone. |
| Platform | **Web**. Not **Single-page application**. |
| Redirect URI | `https://tracker.4flow.io/outlook/callback` |
| Redirect URI | `http://localhost:5173/outlook/callback` |
| Graph permission | `Calendars.ReadBasic`. Delegated. |
| Graph permission | `offline_access`. Delegated. |
| Application permission | none of any kind |
| Credential | one client secret |
| Owner | `a.kennedy@4flow.com` |
| Hosted by | 4flow on AWS in `eu-central-1` |
| Tenant id | `<PASTE Directory (tenant) ID>` |
| Client id | `<PASTE Application (client) ID>` |

The **Web** platform is the point of the design rather than a detail of it. It
makes the token endpoint require the secret so no Microsoft token ever reaches a
browser. A **Single-page application** platform would put one there.

The second redirect URI is local development. Entra allows `http` for a
`localhost` address and for nothing else. Remove it after the build if you would
rather not carry it.

Both URIs are matched exactly and they are case sensitive. Entra allows no
wildcard.

## What to do

1. Sign in to `entra.microsoft.com`. Go to **Entra ID** then
   **App registrations** then **New registration**.
2. Enter the name and choose **Single tenant only**. Under **Redirect URI**
   choose the **Web** platform and enter the live callback. Select **Register**.
   Add the `localhost` one afterwards under **Authentication**.
3. Go to **API permissions**. **Add a permission** then **Microsoft Graph** then
   **Delegated permissions**. Add `Calendars.ReadBasic` and `offline_access`.
4. Remove `User.Read` from that list. Entra adds it to every new registration
   and the tracker never reads a profile. Leave it if removing it is awkward. It
   reads a display name and nothing else.
5. Select **Grant admin consent for 4flow** on that same screen. Select
   **Refresh** and check that **Granted for 4flow** appears against both rows.
   This is the step only an administrator can take.

Then **Certificates & secrets** then **Client secrets** then
**New client secret**. Twelve months or less. The value is shown once and never
again.

The registration can stay hidden from the **My Apps** portal. Entra hides a new
one by default and the tracker sends the user to Microsoft itself so nobody ever
needs to find it there.

## What to send back

| Value | Where it is |
| --- | --- |
| Directory (tenant) ID | the registration **Overview** page |
| Application (client) ID | the registration **Overview** page |

Neither is a secret. Both go in a CDK stack that is committed.

Send no client secret by mail or chat. Under route one we create it. Under route
two make us an owner and we create it. It goes straight into AWS Secrets Manager
and only one Lambda can read it.

## What it reads

Two delegated permissions. No write permission of any kind is asked for so the
app cannot create or move or accept or delete anything in a calendar.

| Permission | On the consent screen | Why |
| --- | --- | --- |
| `Calendars.ReadBasic` | Read basic details of user calendars | the events of the month being filled |
| `offline_access` | Maintain access to data you have given it access to | so the monthly reminder mail can name the month without asking the user to sign in again |

`Calendars.ReadBasic` rather than `Calendars.Read`. Microsoft names three
exclusions for it. They are `body` and `attachments` and `extensions`. So the
text somebody typed inside an appointment is unreadable to the tracker by
permission rather than by promise.

One Graph call is the whole integration.

    GET https://graph.microsoft.com/v1.0/me/calendarView
      ?startDateTime=<the first of the month>
      &endDateTime=<the first of the next month>
      &$select=id,subject,start,end,isAllDay,showAs,categories,sensitivity,type,seriesMasterId,isCancelled,responseStatus

`$select` names twelve fields out of the forty an event carries. `body` and
`bodyPreview` are named by nothing in the code. That is a second control over
the same text and both are kept.

`me` is whoever linked. There is no `/users/<upn>` call anywhere in the
integration.

## What it cannot reach

A delegated permission reads as the person who linked. So the tracker sees one
calendar and it is theirs. It cannot read a colleague. It cannot read a room. It
cannot read a shared mailbox. It holds no credential of its own against any
mailbox.

It reads one month at a time and only when that person opens the screen or the
monthly reminder runs for them.

Nothing is ever written back to Outlook.

## What is stored

One refresh token per person who linked. It is encrypted with a customer managed
KMS key before it is written and only the Outlook function can decrypt it. The
same arrangement already holds the Atlassian tokens.

A cache of one month of events per person. A closed month for a day. The current
month for fifteen minutes.

No appointment subject reaches a timesheet. A timesheet is exported to
backoffice and a subject carries names and customers and sometimes a medical
appointment. The subject is shown to the person on their own screen so they can
recognise their own row and it goes no further. An appointment marked `private`
or `personal` or `confidential` shows no subject even there.

A person unlinks in the tracker whenever they like. That deletes the token. You
can revoke the whole grant under **Enterprise apps** then **Tracker** then
**Permissions**.

## Why it is needed

The tracker fills a monthly timesheet. Every person retypes the same month by
hand today.

A calendar is the only system at 4flow that knows which day an hour fell on and
how long it lasted. Jira knows neither. Because a) the 4flow Jira site holds no
worklogs at all b) five of the seven tickets in the month we probed were closed
in one bulk action so a resolution date says nothing about when the work
happened c) an out of office block is the one thing a calendar states without
ambiguity and it is the entry people most often forget.

The alternative designs are worse and they are written up in `docs/outlook.md`.
One of them reads every calendar in the tenant under an application permission.
Another publishes a calendar as an unauthenticated URL. This request is the
option where each person approves their own calendar and nothing else is
readable by anybody.

## How to check it worked

The person presses **Connect Outlook** once in the tracker. Microsoft redirects
them straight back because admin consent is already granted. The tracker then
lists the events of the month.

Without admin consent the same press shows a consent screen naming the two
permissions above. That still works for anybody the tenant lets consent for
themselves. Admin consent is what makes it silent for everybody.

You see Tracker under **Enterprise apps** with two granted permissions and one
user assigned per person who has linked.

## Three settings that can block this

1. **User consent for applications.** Under **Identity** then **Applications**
   then **Enterprise apps** then **Consent and permissions** then
   **User consent settings**. On the recommended setting a user may consent to
   an app registered in this tenant only for permissions classified as low
   impact. `Calendars.ReadBasic` is not classified low impact by default. So
   either grant admin consent at step 5 or classify that one permission. Step 5
   is simpler and it is the ask.
2. **Assignment required.** Under **Enterprise apps** then **Tracker** then
   **Properties**. Set to yes it makes administrator consent mandatory whatever
   the consent settings say. Either answer is workable. Say which you chose.
3. **Conditional Access.** A policy scoped to all cloud apps also covers this
   one. A device compliance or MFA requirement is fine because a real person
   signs in interactively. A policy blocking non approved apps is not. Check
   whether one exists before step 5.

## What is not being asked for

1. **An application permission.** No `Calendars.Read` and no
   `Calendars.ReadBasic.All`. The tracker cannot read a calendar nobody has
   linked.
2. **An Exchange application access policy.** `New-ApplicationAccessPolicy`
   narrows an application permission to one group. There is no application
   permission here so there is nothing to narrow.
3. **Mail or Teams or files or directory data.** No permission touching any of
   them is requested. `User.Read` is the only one Entra adds by itself and step
   4 removes it.
4. **A licence or a service account or a mailbox.** Nothing is created in
   Exchange at all.
5. **Write access.** No event is created and none is moved and no invitation is
   accepted or declined.

## References

- Register an application in Microsoft Entra ID. `https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app`
- Microsoft Graph permissions reference. `https://learn.microsoft.com/en-us/graph/permissions-reference`
- Configure how users consent to applications. `https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent`
- Add and manage app credentials. `https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials`
- Redirect URI best practices and limitations. `https://learn.microsoft.com/en-us/entra/identity-platform/reply-url`
