# Presence

Termlings presence is terminal-first and file-backed.

## What presence means

- `online`: Agent session exists in `.termlings/sessions/<sessionId>.json`.
- `typing/working`: Agent has recent terminal activity written to `.termlings/<sessionId>.typing.json` with `source: "terminal"`.

## Source of truth

- Launcher PTY activity writes typing state.
- No Claude hook runtime path is used.
- Session heartbeats keep `lastSeenAt` fresh.

## Presence file

```json
{
  "typing": true,
  "source": "terminal",
  "updatedAt": 1708952400000
}
```

Path:

- `.termlings/<sessionId>.typing.json`

## Detection model

- Presence is armed by real submit/input events and internal injected message writes.
- Output-only redraw noise (including resize repaint) is suppressed/disarmed.
- Typing auto-clears after idle timeout.
- Sending a message clears sender typing immediately.
- Consumers also suppress typing briefly right after message timestamps to avoid races.

## Freshness windows

- Session staleness: old sessions are removed after stale threshold.
- Typing staleness: old typing state is ignored after stale threshold.
- Message-based suppression: typing is temporarily suppressed right after message send.

## UI behavior

- TUI: avatar strip animates while typing/working, message pane footer shows animated dots.
- Web: avatars can render talking state from typing/working presence.

## Troubleshooting

If presence appears stuck or noisy:

1. Restart active agent sessions so latest launcher logic is loaded.
2. Watch typing files:
   ```bash
   tail -f .termlings/*.typing.json
   ```
3. Confirm sessions:
   ```bash
   ls .termlings/sessions
   ```
4. Clear runtime state if needed:
   ```bash
   termlings --clear
   ```

## Legacy hooks

Termlings no longer uses hooks for live presence. See `docs/HOOKS.md` only for cleanup of old hook installs.
