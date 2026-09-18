#!/usr/bin/env bash
# Load the settings then hand over to the Python runner.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./model.env; set +a
exec .venv-transformers/bin/python run_transformers.py "$@"
