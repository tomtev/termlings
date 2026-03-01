# Hooks

Termlings uses Claude Code hooks for typing presence in the workspace UI.

## Scope

- Claude-only.
- Hook-only typing state.
- No terminal-output fallback and no non-Claude typing fallback.

## Events used

The launcher installs hook entries for:

- `UserPromptSubmit`
- `Stop`

`PermissionRequest` is not used by Termlings typing state.

## Data flow

1. `termlings claude` launches Claude with Termlings env vars.
2. Claude executes `~/.claude/hooks/termlings-hooks.sh` on hook events.
3. The script writes session typing state to:
   - `.termlings/<sessionId>.typing.json`
4. Workspace server reads that file and marks agent typing if fresh.

Typing file payload:

```json
{
  "typing": true,
  "source": "hook",
  "updatedAt": 1708952400000
}
```

## Environment variables

- `TERMLINGS_SESSION_ID`
- `TERMLINGS_AGENT_NAME`
- `TERMLINGS_AGENT_DNA`
- `TERMLINGS_IPC_DIR`

## Install / reinstall

Hooks are installed automatically on `termlings claude`.

To reinstall:

```bash
rm -f ~/.claude/hooks/termlings-hooks.sh
termlings claude
```

## Troubleshooting

Check script exists:

```bash
ls -la ~/.claude/hooks/termlings-hooks.sh
```

Check Claude settings:

```bash
jq '.hooks' ~/.claude/settings.json
```

Watch typing state writes:

```bash
tail -f .termlings/*.typing.json
```
