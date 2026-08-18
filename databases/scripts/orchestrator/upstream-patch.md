# Patch to submit to ProxySQL/orchestrator

Status: not yet submitted. Raised here on 2026-08-18.

Repository: `git@github.com:ProxySQL/orchestrator.git`
File: `resources/templates/layout.tmpl` line 20

## The bug

The web UI renders with no styling. The layout loads Bootstrap 5.3.3 from a CDN and
declares a subresource integrity hash for the stylesheet that does not match the file.

```
declared  sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YcnS/1p8FjY20lOFFCB6Uf8ECZTI2bPZCmL
actual    sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH
```

Two things are wrong. The declared value is 63 characters where a sha384 in base64 is
always 64. It also diverges from the real hash after the shared prefix
`QWTKZyjpPEjISv5WaRU9OFeRpok6Yc`. The string has been mangled rather than merely gone
stale.

Subresource integrity is not advisory. A browser fetches the file and hashes it and
refuses to apply a stylesheet that fails the check. The result is a working but unstyled
page.

The script tag on line 230 declares the correct 64 character hash for
`bootstrap.bundle.min.js` so the JavaScript loads. Only the styling is lost. That is why
the fault looks like a rendering quirk rather than a blocked asset.

`curl` reports HTTP 200 for the stylesheet because `curl` does not check integrity.
Reproduce it in a browser rather than a shell.

## Verifying the claim

```
curl -sS https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

## The one line fix

Replace the `integrity` value on line 20 with the correct hash.

```
-	<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YcnS/1p8FjY20lOFFCB6Uf8ECZTI2bPZCmL" crossorigin="anonymous">
+	<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
```

## The fix worth arguing for

Vendor both files into `resources/public` and drop the CDN and the integrity attributes
with it. Because a) the project already serves its own CSS and JS from that directory so
the two files simply join them b) a hash that lives in a template drifts from the file it
describes and this is what that looks like and c) the UI then works with no internet at
all which matters for anyone running it on an isolated network.

Our image does exactly this. See the vendoring stage in `Dockerfile`. Offer it upstream as
the alternative if the maintainers would rather keep the CDN.
