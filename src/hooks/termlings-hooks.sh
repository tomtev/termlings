#!/bin/bash
# termlings hook for Claude Code lifecycle events.
# Reads hook JSON from stdin and writes to IPC files for the sim to read.
# Installed by termlings into ~/.claude/hooks/ and referenced in ~/.claude/settings.json.

INPUT=$(cat)

# Only process if we have a termlings session ID
if [ -z "$TERMLINGS_SESSION_ID" ]; then
  exit 0
fi

# Extract event type from input JSON
EVENT=$(printf '%s' "$INPUT" | grep -o '"event":"[^"]*"' | cut -d'"' -f4)

# Get the IPC directory from environment or use default
if [ -z "$TERMLINGS_IPC_DIR" ]; then
  ROOM="${TERMLINGS_ROOM:-default}"
  IPC_DIR="$HOME/.termlings/rooms/$ROOM"
else
  IPC_DIR="$TERMLINGS_IPC_DIR"
fi

# Ensure IPC directory exists
mkdir -p "$IPC_DIR" 2>/dev/null || exit 0

# Write hook events to a hook file that the sim can poll
HOOK_FILE="$IPC_DIR/${TERMLINGS_SESSION_ID}.hook.json"

# Run in background so we don't block Claude
(
  case "$EVENT" in
    "UserPromptSubmit")
      # Claude is starting to process/type
      printf '{"event":"typing_start","ts":%s}\n' "$(date +%s000)" >> "$HOOK_FILE"
      ;;
    "Stop")
      # Claude stopped typing
      printf '{"event":"typing_stop","ts":%s}\n' "$(date +%s000)" >> "$HOOK_FILE"
      ;;
    "PermissionRequest")
      # Tool/permission request — extract the request details
      TOOL=$(printf '%s' "$INPUT" | grep -o '"tool":"[^"]*"' | head -1 | cut -d'"' -f4)
      printf '{"event":"permission_request","tool":"%s","ts":%s}\n' "$TOOL" "$(date +%s000)" >> "$HOOK_FILE"
      ;;
  esac
) &

exit 0
