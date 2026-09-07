#!/usr/bin/env bash
# Removes the cloud assembly before it is rebuilt.
#
# CDK writes into `cdk.out` and never prunes it. An asset directory no
# `assets.json` names is left behind for ever. Six directories had accumulated
# where a clean synth writes one. Two of them were the cross region custom
# resource handlers from a synth that had a certificate so the directory implied
# a wiring the manifest no longer carried.
#
# Deleting is safe. Because a) synth is reproducible so the assembly holds
# nothing the source lacks. b) every asset is rebuilt from `apps/api/dist`. c)
# the CLI recreates `.cache` on the next run.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
out="$here/cdk.out"

# A running `cdk` holds a read lock on the directory it is deploying from.
# Deleting that would pull the assembly out from under it. Refuse instead.
if compgen -G "$out"/*.lock >/dev/null; then
  echo "cdk.out is locked by a running cdk. Wait for it to finish." >&2
  exit 1
fi

rm -rf "$out"
