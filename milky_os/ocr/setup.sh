#!/bin/sh
# Build the virtualenv and draw the sample labels.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python tools/make_samples.py
