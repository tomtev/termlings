#!/bin/bash
# termlings hook for Claude Code lifecycle events.
# Reads hook JSON from stdin and writes hook-only typing state for the workspace.
# Installed by termlings into ~/.claude/hooks/ and referenced in ~/.claude/settings.json.

INPUT=$(cat)

# Only process if we have a termlings session ID
if [ -z "$TERMLINGS_SESSION_ID" ]; then
  exit 0
fi

JSON_ONE_LINE=$(printf '%s' "$INPUT" | tr -d '\n')

# Extract event type from input JSON (tolerates whitespace around :)
EVENT=$(printf '%s' "$JSON_ONE_LINE" | sed -n 's/.*"event"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$EVENT" ]; then
  exit 0
fi

# Get the IPC directory from environment or use default
if [ -z "$TERMLINGS_IPC_DIR" ]; then
  ROOM="${TERMLINGS_ROOM:-default}"
  IPC_DIR="$HOME/.termlings/rooms/$ROOM"
else
  IPC_DIR="$TERMLINGS_IPC_DIR"
fi

# Ensure IPC directory exists
mkdir -p "$IPC_DIR" 2>/dev/null || exit 0

TYPING_FILE="$IPC_DIR/${TERMLINGS_SESSION_ID}.typing.json"

# Run in background so we don't block Claude
(
  case "$EVENT" in
    "UserPromptSubmit")
      TS="$(date +%s000)"
      printf '{"typing":true,"source":"hook","updatedAt":%s}\n' "$TS" > "$TYPING_FILE"
      ;;
    "Stop")
      TS="$(date +%s000)"
      printf '{"typing":false,"source":"hook","updatedAt":%s}\n' "$TS" > "$TYPING_FILE"
      ;;
  esac
) &

exit 0
