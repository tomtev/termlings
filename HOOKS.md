# Hooks System

Termlings uses Claude Code hooks to integrate with the agent's lifecycle events and display real-time feedback on the avatar.

## How it works

### 1. Hook installation

When you launch Claude Code as an agent (`termlings claude`), the launcher automatically:

1. **Installs the hook script** from `src/hooks/termlings-hooks.sh` to `~/.claude/hooks/termlings-hooks.sh`
2. **Registers three hook events** in `~/.claude/settings.json`:
   - `UserPromptSubmit` — When Claude starts processing
   - `Stop` — When Claude stops processing
   - `PermissionRequest` — When Claude requests a tool/permission

### 2. Hook execution

When Claude Code triggers one of these events:

1. Claude reads the hook script path from `~/.claude/settings.json`
2. Claude passes hook event JSON to the script via stdin
3. The hook script:
   - Reads the JSON from stdin
   - Extracts the event type
   - Writes an event line to `~/.termlings/rooms/<room>/<sessionId>.hook.json`
   - Runs asynchronously (doesn't block Claude)

### 3. Sim processing

The sim's frame loop:

1. **Polls hook files** every ~0.5 seconds (every 30 ticks at 60fps)
2. **Parses hook events** line-by-line from each session's hook file
3. **Updates agent animations**:
   - `typing_start` — Set agent `talking = true` for 10 seconds
   - `typing_stop` — Set agent `talking = false`
   - `permission_request` — Set agent `waving = true` for 2 seconds
4. **Clears hook file** after processing

## File structure

```
~/.claude/hooks/
  termlings-hooks.sh        ← Hook script (installed by termlings)

~/.claude/settings.json     ← Hook configuration (updated by termlings)

~/.termlings/rooms/<room>/
  <sessionId>.hook.json     ← Hook events from Claude (written by hook script)
  <sessionId>.cmd.json      ← Agent commands (written by agent)
  <sessionId>.state.json    ← World state (written by sim)
```

## Hook events

### UserPromptSubmit

Fired when Claude starts processing a prompt.

```json
{"event":"typing_start","ts":1708952400000}
```

**Sim action:** Set agent talking animation for 10 seconds

### Stop

Fired when Claude finishes processing or stops.

```json
{"event":"typing_stop","ts":1708952400000}
```

**Sim action:** Stop talking animation

### PermissionRequest

Fired when Claude requests a tool or permission.

```json
{"event":"permission_request","tool":"<tool_name>","ts":1708952400000}
```

**Sim action:** Brief wave gesture (2 seconds)

## Environment variables

When Claude is launched as an agent, these environment variables are set:

- `TERMLINGS_SESSION_ID` — Unique session identifier (used by hook script)
- `TERMLINGS_AGENT_NAME` — Agent's name in the world
- `TERMLINGS_AGENT_DNA` — Agent's avatar DNA
- `TERMLINGS_ROOM` — Room name (used to construct IPC directory)
- `TERMLINGS_IPC_DIR` — Full path to IPC directory (used by hook script)

The hook script uses `TERMLINGS_SESSION_ID` and `TERMLINGS_IPC_DIR` to write hook files.

## Limitations

### Pi and Codex

Pi and Codex CLI tools don't have hook support yet. Agents launched with these tools will:

- Work normally
- Accept all commands
- But won't show typing animations (no hooks to read)

### Future support

To add hook support for other CLIs, they would need to:

1. Support the same hook system as Claude Code
2. Be registered in the launcher to trigger hook installation
3. Receive the same environment variables for IPC communication

## Troubleshooting

### Hooks not working?

1. **Check hook script is installed:**
   ```bash
   ls -la ~/.claude/hooks/termlings-hooks.sh
   ```

2. **Check settings.json has hooks:**
   ```bash
   jq '.hooks' ~/.claude/settings.json
   ```

3. **Check hook files are being written:**
   ```bash
   tail -f ~/.termlings/rooms/default/*.hook.json
   ```

4. **Reinstall hooks:**
   ```bash
   rm ~/.claude/hooks/termlings-hooks.sh
   termlings claude  # Will reinstall
   ```

### No typing animations?

- Confirm you're using Claude Code: `termlings claude`
- Check that Claude is actually processing (typing in terminal)
- Verify hook script is executable: `chmod +x ~/.claude/hooks/termlings-hooks.sh`

