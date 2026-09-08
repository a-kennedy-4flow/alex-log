#!/usr/bin/env bash
# Stop every server started by serve.sh.
set -euo pipefail
cd "$(dirname "$0")"
PIDS=.serve.pids
[ -f "$PIDS" ] || { echo "Kein $PIDS. Nichts zu stoppen."; exit 0; }
while read -r pid; do
  [ -n "$pid" ] || continue
  if kill "$pid" 2>/dev/null; then echo "gestoppt $pid"; else echo "schon beendet $pid"; fi
done < "$PIDS"
rm -f "$PIDS"
