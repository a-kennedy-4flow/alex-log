#!/usr/bin/env bash
set -euo pipefail

# Each entry: "name|local_port:remote_host:remote_port|ssh_target"
TUNNELS=(
  "1031:localhost:1031|home",
  "8080:localhost:8080|home",
  "8180:localhost:8180|home",
  "8280:localhost:8280|home",
)

PIDS=()

cleanup() {
  echo
  echo "Closing tunnels..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

for entry in "${TUNNELS[@]}"; do
  IFS='|' read -r name forward target <<< "$entry"
  echo "Opening tunnel '$name': $forward via $target"
  ssh -N -L "$forward" "$target" &   # -N: no remote command, -L: local forward
  PIDS+=("$!")
done

echo "All tunnels up. Press Ctrl-C to close."
wait