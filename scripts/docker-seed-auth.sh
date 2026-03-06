#!/bin/sh
set -eu

need_file() {
  if [ ! -f "$1" ]; then
    return 1
  fi
}

seed_file() {
  src="$1"
  dest="$2"
  label="$3"

  if ! need_file "$src"; then
    return 1
  fi

  docker compose exec -T --user root termlings sh -lc \
    "mkdir -p \"$(dirname "$dest")\" && cat > \"$dest\" && chown termlings:termlings \"$dest\" && chmod 600 \"$dest\"" \
    < "$src"

  echo "Seeded $label auth into Docker container."
  return 0
}

seeded_any=0

if seed_file "$HOME/.claude/.credentials.json" "/home/termlings/.claude/.credentials.json" "Claude"; then
  seeded_any=1
fi

if seed_file "$HOME/.codex/auth.json" "/home/termlings/.codex/auth.json" "Codex"; then
  seeded_any=1
fi

if [ "$seeded_any" -eq 0 ]; then
  echo "No host Claude or Codex auth files found to seed." >&2
  exit 1
fi
