#!/usr/bin/env bash
# Serve the three designs at once. Each gets its own port so they can be
# compared side by side. teardown.sh stops them.
set -euo pipefail
cd "$(dirname "$0")"
PIDS=.serve.pids
: > "$PIDS"
# A design served on its own port is the server root. The link keeps
# ../assets reachable from inside it.
for d in klar ruhe praxis; do ln -sfn ../assets "$d/assets"; done
start() {
  python3 -m http.server "$2" --bind 127.0.0.1 --directory "$1" >/dev/null 2>&1 &
  echo $! >> "$PIDS"
  printf '%-8s http://127.0.0.1:%s/\n' "$3" "$2"
}
start . 8080 uebersicht
start klar 8081 klar
start ruhe 8082 ruhe
start praxis 8083 praxis
echo "PIDs in $PIDS. Stop with ./teardown.sh"
