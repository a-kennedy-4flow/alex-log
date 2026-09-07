# One DNS record for tracker.4flow.io

What to do in the account holding `4flow.io`. It is one record and it takes two
minutes.

## The record

| Field | Value |
| --- | --- |
| Name | `tracker.4flow.io` |
| Type | `NS` |
| TTL | `172800` or the zone default |
| Value | the four name servers below |

```
<PASTE THE FOUR NAME SERVERS>
```

## What it does

It delegates that one subdomain to AWS account `517025126224`. Records under
`tracker.4flow.io` become ours to create. Nothing else in `4flow.io` is
affected and no access to the parent zone is granted.

## Why a delegation and not a single record

A certificate renewal needs its own record. Each new hostname needs another.
Every one of those would otherwise be a request to you. This is asked once.

## How to check it worked

```sh
dig +short NS tracker.4flow.io
```

The four name servers come back. Nothing else is needed from you after that.


DONE
