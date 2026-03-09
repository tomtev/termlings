# Lifecycle (Internal Runtime Notes)

This document is for debugging and implementation context.
Operators usually do not need this day-to-day.
For the higher-level operator view, see [APPS.md](APPS.md).

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
3. Write/update session metadata in `.termlings/store/sessions/*.json`.
4. Build final system context for the agent process.
5. Inject context into Claude launch args and env.
6. Spawn Claude process and start message/session heartbeat loops.

## How Context Is Added To Claude

Context injection is implemented in `src/agents/launcher.ts` and adapter files under `src/agents/`.

### 1) Load base context

`loadContext()` reads:

- `src/system-context.ts` → `renderSystemContext()` (dynamic, app-aware)
- `.termlings/GOAL.md` (appended when present, wrapped in `<TERMLINGS-GOAL>` tags)

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

`TERMLINGS_AGENT_SLUG` is also used by app resolution paths, including top-level `termlings --help`, so agent sessions only see commands enabled by workspace defaults and their own SOUL `apps:` allowlist.

## Context Assembly

Base context comes from:

- `src/system-context.ts` → `renderSystemContext()`

Project goal is appended when present:

- `.termlings/GOAL.md`

Injected goal is wrapped as:

```text
<TERMLINGS-GOAL>
...contents of .termlings/GOAL.md...
</TERMLINGS-GOAL>
```

## State & Persistence

Workspace state is file-backed under `.termlings/`:

```text
.termlings/
  store/sessions/*.json
  store/message-queue/
    tl-*.msg.json
    *.queue.jsonl
  store/messages/
    channels/*.jsonl
    dms/*.jsonl
    system.jsonl
    index.json
  store/tasks/tasks.json
  store/calendar/calendar.json
  store/requests/*.json
  agents/<slug>/SOUL.md
```

Runtime behavior:

- live runtime delivery uses `store/message-queue/tl-*.msg.json`
- offline agent delivery uses `store/message-queue/*.queue.jsonl`
- messaging appends to `store/messages/*`
- task/calendar commands update JSON stores
- browser actions log into `.termlings/browser/history/all.jsonl` and `.termlings/browser/history/agent/*.jsonl`

Session metadata may include runtime linkage fields when detected:

- `runtime` (for example `claude`, `codex`)
- `launcherPid` (termlings launcher process)
- `runtimePid` (child CLI process)
- `jsonlFile` (resolved runtime transcript path)
- `runtimeSessionId` (runtime-native session id when parsable from JSONL)

## Session End

When an agent process exits:

- session presence is marked offline by runtime/cleanup path
- persisted files remain for history and restart continuity
- agent slug identity remains stable across sessions

## Related Docs

- [APPS.md](APPS.md)
- [TERMLINGS.md](TERMLINGS.md)
- [TERMLINGS.md](TERMLINGS.md)
- [PRESENCE.md](PRESENCE.md)
