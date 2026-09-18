#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./model.env; set +a
exec .venv-client/bin/python chat.py "$@"
