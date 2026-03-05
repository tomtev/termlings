# Lifecycle (Internal Runtime Notes)

This document is for debugging and implementation context.
Operators usually do not need this day-to-day.

## Scope

Covers what happens when an agent is launched via `termlings claude`, `termlings spawn`, or `termlings <agent>`:

- identity resolution
- session registration
- context assembly
- runtime env vars
- file-backed state updates

## Launch Sequence

1. Resolve agent identity from `.termlings/agents/<slug>/SOUL.md` (name, dna, title, role).
2. Allocate a runtime session ID (`tl-...`).
3. Write/update session metadata in `.termlings/sessions/*.json`.
4. Build final system context for the agent process.
5. Inject context into Claude launch args and env.
6. Spawn Claude process and start message/session heartbeat loops.

## How Context Is Added To Claude

Context injection is implemented in `src/agents/launcher.ts` and adapter files under `src/agents/`.

### 1) Load base context

`loadContext(profile)` reads:

- `src/termlings-system-message.md` (base)
- `src/sim/termlings-system-message-sim.md` (only when SIM profile is active)
- `.termlings/VISION.md` (appended when present, wrapped in `<TERMLINGS-VISION>` tags)

### 2) Apply runtime substitutions

Before launch, placeholders are replaced in context:

- `$NAME`
- `$SESSION_ID`
- `$DNA`
- `$AGENT_TITLE`
- `$AGENT_TITLE_SHORT`
- `$AGENT_ROLE`
- `$DESCRIPTION`

### 3) Convert context to agent-specific CLI args

Launcher calls:

```ts
const contextArgs = adapter.contextArgs(finalContext)
const finalArgs = [...contextArgs, ...passthroughArgs]
```

For Claude (`src/agents/claude.ts`), this becomes:

```bash
claude --append-system-prompt "<finalContext>" ...
```

So the primary context injection path is CLI argument injection.

### 4) Mirror context in environment

Launcher also sets:

- `TERMLINGS_CONTEXT=<finalContext>`

This is a runtime mirror for tools/integration visibility. It is not the main Claude injection mechanism.

## Environment Variables

Passed to agent sessions by launcher/runtime:

```bash
TERMLINGS_SESSION_ID=tl-a8ab0631      # Unique session ID (16 hex chars)
TERMLINGS_AGENT_NAME=Rusty            # Display name
TERMLINGS_AGENT_DNA=0a3f201           # Stable identity (7-char hex)
TERMLINGS_IPC_DIR=.termlings/         # Workspace directory
TERMLINGS_CONTEXT=...                 # Final injected system context
```

Common additional runtime vars:

```bash
TERMLINGS_AGENT_SLUG=developer
TERMLINGS_AGENT_TITLE="Product Manager"
TERMLINGS_AGENT_TITLE_SHORT=PM
TERMLINGS_AGENT_ROLE="Owns roadmap and priorities"
TERMLINGS_CONTEXT_PROFILE=default
```

## Context Assembly

Base context comes from:

- `src/termlings-system-message.md`

Project vision is appended when present:

- `.termlings/VISION.md`

Injected vision is wrapped as:

```text
<TERMLINGS-VISION>
...contents of .termlings/VISION.md...
</TERMLINGS-VISION>
```

## State & Persistence

Workspace state is file-backed under `.termlings/`:

```text
.termlings/
  sessions/*.json
  store/messages.jsonl
  store/tasks/tasks.json
  store/calendar/calendar.json
  store/requests/requests.jsonl
  agents/<slug>/SOUL.md
```

Runtime behavior:

- messaging appends to `store/messages.jsonl`
- task/calendar commands update JSON stores
- browser actions log into `.termlings/browser/history/all.jsonl` and `.termlings/browser/history/agent/*.jsonl`

## Session End

When an agent process exits:

- session presence is marked offline by runtime/cleanup path
- persisted files remain for history and restart continuity
- agent slug identity remains stable across sessions

## Related Docs

- [SOUL.md](SOUL.md)
- [TERMLINGS.md](TERMLINGS.md)
- [INIT.md](INIT.md)
- [PRESENCE.md](PRESENCE.md)
