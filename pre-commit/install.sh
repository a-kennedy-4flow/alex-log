#!/bin/sh
# Copies the built hook into place. Run after every release build.
set -e

TARGET="${XDG_CONFIG_HOME:-$HOME/.config}/git/hooks"
BINARY="$(dirname "$0")/target/release/pre-commit"
CONFIG="$(dirname "$0")/pre-commit.conf"

if [ ! -x "$BINARY" ]; then
	echo "no release binary. run: cargo build --release" >&2
	exit 1
fi

mkdir -p "$TARGET"
# A copy rather than a symlink so git never trips over a missing target.
cp "$BINARY" "$TARGET/pre-commit"
chmod +x "$TARGET/pre-commit"
echo "installed: $TARGET/pre-commit"

# The list is yours once it exists. An install never overwrites it.
if [ -f "$TARGET/pre-commit.conf" ]; then
	echo "kept:      $TARGET/pre-commit.conf"
else
	cp "$CONFIG" "$TARGET/pre-commit.conf"
	echo "seeded:    $TARGET/pre-commit.conf"
fi

HOOKS_PATH=$(git config --global --get core.hooksPath || true)
if [ -z "$HOOKS_PATH" ]; then
	echo "note: core.hooksPath is unset. run:" >&2
	echo "  git config --global core.hooksPath $TARGET" >&2
fi
