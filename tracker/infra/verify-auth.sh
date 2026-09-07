#!/usr/bin/env bash
# Checks every link between the browser and Identity Center.
#
# Read only. Run it after a deploy and after any change the Identity Center
# administrator makes.
set -uo pipefail

STACK=${STACK:-Tracker}
PROFILE=${AWS_PROFILE:-Admin}
REGION=${AWS_REGION:-eu-central-1}

pass=0; fail=0
ok()  { printf '  ok    %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
# Reads `OK text` or `NO text` from a helper and counts it. Always called as
# `verdict < <(...)` and never after a pipe. Because a pipe would run it in a
# subshell and every count it made would be dropped on return.
verdict() { while IFS= read -r line; do
    case "$line" in OK\ *) ok "${line#OK }" ;; NO\ *) bad "${line#NO }" ;; esac
  done; }
# 000 means curl never got a reply. Anything else proves the name resolves.
code_of() { curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null || echo 000; }

aws_() { aws --profile "$PROFILE" --region "$REGION" "$@"; }
output() { aws_ cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null; }

echo "stack"
status=$(aws_ cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].StackStatus' --output text 2>&1)
case "$status" in
  CREATE_COMPLETE|UPDATE_COMPLETE|UPDATE_ROLLBACK_COMPLETE) ok "$status" ;;
  *does\ not\ exist*) bad "the stack does not exist. Deploy it."; echo; exit 1 ;;
  *) bad "$status"; echo; echo "Nothing else can be checked until the stack is healthy."; exit 1 ;;
esac

pool=$(output UserPoolId)
client=$(output UserPoolClientId)
domain=$(output HostedUiDomain)
site=$(output SiteUrl)
acs=$(output SamlAcsUrl)
entity=$(output SamlEntityId)
provider=$(output SamlProviderName)

echo "pool $pool"
verdict < <(aws_ cognito-idp describe-user-pool --user-pool-id "$pool" --output json 2>/dev/null |
python3 -c '
import json,sys
p=json.load(sys.stdin)["UserPool"]
by={a["Name"]:a for a in p.get("SchemaAttributes",[])}
for n in ("email","given_name","family_name"):
    a=by.get(n)
    if not a: print(f"NO {n} is missing from the schema"); continue
    if not a.get("Mutable"):
        print(f"NO {n} is immutable so Cognito cannot rewrite it on sign in")
    else: print(f"OK {n} is mutable")
')

echo "provider"
if [ -z "$provider" ] || [ "$provider" = "none" ] || [ "$provider" = "None" ]; then
  bad "no SAML provider on the pool. Deploy with SAML_METADATA_URL set."
  metadata=""
else
  detail=$(aws_ cognito-idp describe-identity-provider \
    --user-pool-id "$pool" --provider-name "$provider" --output json 2>/dev/null)
  if [ -z "$detail" ]; then
    bad "$provider is named by the stack but absent from the pool"
    metadata=""
  else
    ok "$provider exists"
    verdict < <(printf '%s' "$detail" | python3 -c '
import json,sys
p=json.load(sys.stdin)["IdentityProvider"]
m=p.get("AttributeMapping") or {}
want={"email":"emailaddress","given_name":"givenname","family_name":"surname"}
for k,suffix in want.items():
    got=m.get(k)
    if not got: print(f"NO {k} is not mapped. Cognito cannot build the profile without it.")
    elif not got.endswith(suffix): print(f"NO {k} maps from {got} which does not end in {suffix}")
    else: print(f"OK {k} maps from {got}")
')
    metadata=$(printf '%s' "$detail" | python3 -c '
import json,sys
print((json.load(sys.stdin)["IdentityProvider"].get("ProviderDetails") or {}).get("MetadataURL",""))')
  fi
fi

if [ -n "$metadata" ]; then
  c=$(code_of "$metadata")
  [ "$c" = "200" ] && ok "Identity Center metadata answers 200" \
                   || bad "Identity Center metadata answers $c"
fi

echo "client $client"
verdict < <(aws_ cognito-idp describe-user-pool-client --user-pool-id "$pool" \
  --client-id "$client" --output json 2>/dev/null |
SITE="$site" python3 -c '
import json,os,sys
c=json.load(sys.stdin)["UserPoolClient"]
site=os.environ["SITE"]
idps=c.get("SupportedIdentityProviders") or []
if not idps: print("NO the client names no identity provider")
elif "COGNITO" in idps: print(f"NO the client still allows COGNITO. It is {idps}.")
else: print(f"OK identity providers are {idps}")
want=f"{site}/auth/callback"
cbs=c.get("CallbackURLs") or []
print(f"OK callback covers {want}" if want in cbs else f"NO callback list is {cbs} and misses {want}")
flows=c.get("AllowedOAuthFlows") or []
print("OK authorization code flow is on" if "code" in flows else f"NO OAuth flows are {flows}")
scopes=set(c.get("AllowedOAuthScopes") or [])
missing={"openid","email","profile"}-scopes
print("OK scopes cover openid email profile" if not missing else f"NO scopes miss {sorted(missing)}")
w=set(c.get("WriteAttributes") or [])
need={"email","given_name","family_name"}-w
print("OK the client may write every mapped attribute" if not need else f"NO the client cannot write {sorted(need)}")
')

echo "endpoints"
disco="https://cognito-idp.$REGION.amazonaws.com/$pool/.well-known/openid-configuration"
c=$(code_of "$disco")
[ "$c" = "200" ] && ok "the pool issuer answers 200" || bad "the pool issuer answers $c"

# The hosted domain has no discovery document. A refusal still proves it is live.
c=$(code_of "$domain/oauth2/authorize")
[ "$c" = "000" ] && bad "$domain did not reply. A new domain takes a few minutes." \
                 || ok "$domain replies $c"

c=$(code_of "$site/")
if [ "$c" != "200" ]; then
  bad "$site answers $c. Run deploy:site."
else
  ok "$site answers 200"
  # The pool is compiled into the bundle so a site deployed before the stack
  # carries no sign in at all. Grep the file rather than a shell variable.
  bundle=$(curl -sS --max-time 15 "$site/" 2>/dev/null |
    grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
  if [ -z "$bundle" ]; then
    bad "no script tag found on $site/"
  else
    tmp=$(mktemp)
    curl -sS --max-time 30 -o "$tmp" "$site$bundle" 2>/dev/null
    if grep -qF "${domain#https://}" "$tmp"; then
      ok "the deployed bundle points at $domain"
    else
      bad "the deployed bundle carries no sign in. Run deploy:site after the stack deploy."
    fi
    rm -f "$tmp"
  fi
fi

echo "browser preflight"
api=$(output ApiUrl)
pf=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X OPTIONS "$api/api/catalogue" \
  -H "Origin: $site" -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type" 2>/dev/null || echo 000)
case "$pf" in
  200|204) ok "preflight answers $pf" ;;
  401|403) bad "preflight answers $pf. A route matching OPTIONS is sending it to the authorizer." ;;
  *)       bad "preflight answers $pf" ;;
esac
allow=$(curl -sS -o /dev/null -D - --max-time 15 -X OPTIONS "$api/api/catalogue" \
  -H "Origin: $site" -H "Access-Control-Request-Method: GET" 2>/dev/null |
  tr -d '\r' | awk 'tolower($1)=="access-control-allow-origin:"{print $2}')
[ "$allow" = "$site" ] && ok "preflight allows $site" \
                       || bad "preflight allows '$allow' and not $site"

echo
echo "For the Identity Center administrator."
echo "  Application SAML audience  $entity"
echo "  Application start URL      $site/"
echo "  Application ACS URL        $acs"
echo
echo "One sign in by hand."
echo "  $domain/oauth2/authorize?client_id=$client&response_type=code&scope=openid+email+profile&redirect_uri=$site/auth/callback&identity_provider=$provider"
echo
echo "$pass passed. $fail failed."
[ "$fail" -eq 0 ]
