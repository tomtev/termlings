# Legacy Hook Cleanup

Termlings no longer uses Claude hooks for typing presence.

Current model:
- Terminal-first activity and busy detection from the launcher PTY.
- Typing state written to `.termlings/store/presence/<sessionId>.typing.json` with `source: "terminal"`.

## Automatic cleanup

On `termlings claude`, Termlings removes old Termlings hook registrations from `~/.claude/settings.json` and removes the old hook script file when present.

## Manual verification

```bash
jq '.hooks' ~/.claude/settings.json
ls -la ~/.claude/hooks/termlings-hooks.sh
```

If the script still exists, remove it:

```bash
rm -f ~/.claude/hooks/termlings-hooks.sh
```
