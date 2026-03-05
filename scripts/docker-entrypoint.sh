#!/bin/sh
set -eu

mkdir -p \
  "$HOME/.claude" \
  "$HOME/.codex" \
  "$HOME/.agent-browser" \
  /workspaces

chown termlings:termlings \
  "$HOME/.claude" \
  "$HOME/.codex" \
  "$HOME/.agent-browser" \
  /workspaces

if [ "$#" -eq 0 ]; then
  set -- sleep infinity
fi

exec gosu termlings "$@"
