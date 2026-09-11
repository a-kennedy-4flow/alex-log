#!/usr/bin/env bash
# Puts the SPA behind CloudFront.
#
# The build needs values the stack only knows once it exists so the two are
# separate steps. Run `cdk deploy` first. Because a) the pool id and the client
# id are baked into the bundle. b) synth would otherwise have to guess them. c)
# a rebuilt bundle is the only thing this changes.
set -euo pipefail

STACK=${STACK:-Tracker}
PROFILE=${AWS_PROFILE:-Admin}
REGION=${AWS_REGION:-eu-central-1}

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)

output() {
  aws cloudformation describe-stacks \
    --profile "$PROFILE" --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

api=$(output ApiUrl)
site=$(output SiteUrl)
bucket=$(output SiteBucketName)
distribution=$(output DistributionId)
domain=$(output HostedUiDomain)
client=$(output UserPoolClientId)
provider=$(output SamlProviderName)

# `none` means the Identity Center application does not exist yet. The build then
# leaves the provider unset and Cognito shows its own sign in.
[ "$provider" = "none" ] && provider=""

echo "stack   $STACK"
echo "site    $site"
echo "api     $api"
echo "signin  $domain"
echo "idp     ${provider:-cognito}"

cat > "$root/apps/web/.env.production.local" <<ENV
# Written by infra/deploy-site.sh. Do not edit.
VITE_API_URL=$api
VITE_COGNITO_DOMAIN=$domain
VITE_COGNITO_CLIENT_ID=$client
VITE_COGNITO_IDP=$provider
ENV

pnpm --filter @tracker/web build

# The hashed assets are immutable. The shell must never be served stale or a
# deployment would not reach a browser that already has it.
#
# The old assets are left in place rather than deleted. Because a) the routes
# and the catalogues are fetched on demand so a browser holding the previous
# shell asks for them after the deployment. b) the distribution answers a
# missing key with index.html and a 200 so the fetch would return markup and
# fail on the parse rather than on the status. c) a hashed file costs a few
# kilobytes a deployment.
aws s3 sync "$root/apps/web/dist/" "s3://$bucket/" \
  --profile "$PROFILE" --region "$REGION" \
  --exclude index.html \
  --cache-control 'public,max-age=31536000,immutable'

aws s3 cp "$root/apps/web/dist/index.html" "s3://$bucket/index.html" \
  --profile "$PROFILE" --region "$REGION" \
  --cache-control 'no-cache' --content-type 'text/html; charset=utf-8'

aws cloudfront create-invalidation \
  --profile "$PROFILE" --distribution-id "$distribution" --paths '/index.html' \
  --query 'Invalidation.Id' --output text

echo "deployed to $site"
