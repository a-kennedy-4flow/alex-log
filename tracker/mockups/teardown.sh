#!/bin/sh
# Removes the mockup folder. The next experiment then starts clean.
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
case "$dir" in
  */tracker/mockups) rm -rf "$dir" && echo "removed $dir" ;;
  *) echo "refusing to remove $dir" >&2; exit 1 ;;
esac
