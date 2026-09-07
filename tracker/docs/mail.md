# The monthly reminder

One message a month to each user. It says the month is nearly over and asks for
the tracker. Nothing else is ever sent.

The sender is `reminder@tracker.4flow.io`. That mailbox receives nothing.

## One record in the other account

The account holding `4flow.io` publishes an `NS` record for `tracker` and
nothing else ever. That is step 2 of `docs/domain.md` and it is the same record
the certificate already waits on. Mail needs no second request.

Everything below is written by CDK into our own zone.

| Record | Purpose |
| --- | --- |
| three `_domainkey` CNAMEs | SES signs each message with DKIM |
| `bounce.tracker.4flow.io` MX and TXT | where a rejection is returned |
| `_dmarc.tracker.4flow.io` TXT | the policy for the sender |

A bounce subdomain is used rather than the SES default. Because a) SPF is
checked against the return path rather than against the address the reader sees.
b) both then sit under a name we control. c) DMARC passes on alignment instead
of on chance.

Check it once the deploy lands.

```sh
dig +short TXT _dmarc.tracker.4flow.io
dig +short MX bounce.tracker.4flow.io
```

## Two things that are not DNS

Ask AWS for SES production access in account `517025126224`. The sandbox sends
200 messages a day to verified addresses alone so nothing reaches a colleague
until this is granted.

Send one message to one mailbox and confirm it is not junked. `4flow.com`
receives through Exchange Online. Its filtering is the one part of this that
cannot be tested before the first send. Its own DMARC is `p=none` so no policy
rejects us.

## Then tighten DMARC

The record is deployed as `p=none`. Change it to `p=reject` in
`infra/lib/tracker-stack.ts` once a message has been seen to arrive. A policy of
`reject` published before DKIM is proven drops every message silently and says
nothing.

## Which day it is sent

The run fires every morning at 07:00 Europe/Berlin. It decides for each user
whether today is theirs. The day is the third working day before the month ends
at the location that user works at.

Daily rather than monthly. Because a) the last working day moves with the bank
holidays of the location. b) `buildMonth` already resolves those from the
uploaded catalogue. c) a fixed day of the month lands on a weekend about a third
of the time.

September 2026 is the example the tests pin. It ends on a Wednesday so the
reminder falls on the 28th. Pilsen keeps St Wenceslas on that date so a user
there is written to on the 25th instead.

One hour serves every location. A user in Brazil receives it overnight. Mail is
read when the mailbox is opened so this is left alone. Sending at a local hour
needs a time zone per location in the catalogue and an hourly schedule.

## Who is skipped

| Skipped | Why |
| --- | --- |
| the month was downloaded | the workbook exists so the month is dealt with |
| the switch is off | the user turned the reminder off in their settings |
| a reminder was already recorded | one message per user per month |

Downloading is the closest thing to sending that this application can observe.
The workbook is mailed on by the user rather than by us. Editing the sheet after
a download clears the record because the file that was downloaded no longer
matches what is stored.

The claim is written before the message and removed again when the send fails.
Because a) the schedule retries a failed run. b) a repeat must send nothing. c)
an address that failed must still get another chance.

A run where every send failed throws so the schedule tries again. One failed
address among many does not because the rest have already been written to.

## Turning it off

The wizard asks on first login. The switch is also on the settings page. It is
stored on the profile as `remindByEmail`.

A bounced or complained address is added to the SES account suppression list on
its own. A mailbox that has gone is never written to twice.

## Running it by hand

```sh
aws lambda invoke --profile Admin --region eu-central-1 \
  --function-name "$(aws cloudformation describe-stacks --profile Admin \
    --region eu-central-1 --stack-name Tracker \
    --query "Stacks[0].Outputs[?OutputKey=='ReminderFunctionName'].OutputValue" \
    --output text)" /dev/stdout
```

It answers with what it considered and what it sent. Nothing is sent twice
because the claim for the month is already written.

## What it costs

SES charges $0.10 per thousand messages and nothing to stand still. Scheduler is
free at one run a day. The claim is one small item per user per month under the
same expiry as a timesheet.

`docs/budget.md` says the hosted zone is the only charge that arrives whether or
not anybody signs in. That is still true.
