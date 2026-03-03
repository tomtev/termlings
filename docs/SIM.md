# SIM Mode

This document describes the current SIM implementation in Termlings.

## Purpose

SIM is isolated in `src/sim` so the default workspace/TUI flow remains the primary experience, while world simulation stays optional.

## Source Layout

```text
src/sim/
  index.ts                          # SIM entrypoint used by CLI
  actions.ts                        # SIM action handlers (walk/gesture/map)
  runtime.ts                        # Full SIM runtime
  simple-runtime.ts                 # Simple runtime variant
  title.ts                          # Title / init screen
  default-map/map.json              # Bundled default map template
  engine/*                          # SIM engine modules
  termlings-system-message-sim.md   # SIM context addendum for agents
```

## CLI Entry Points

SIM is entered through:

```bash
termlings --sim
termlings sim
termlings --sim play <map-dir>
```

`src/cli.ts` routes `--sim` and `sim` to `src/sim/index.ts` (`runSimCommand`).

## SIM Actions

Supported SIM actions:

```bash
termlings sim walk <x>,<y>
termlings sim gesture [wave|talk]
termlings sim map
termlings sim map --agents
termlings sim map --ascii
```

Notes:
- `map --ascii` is currently metadata-only placeholder mode.
- `map` reads `.termlings/map-metadata.json` written by runtime.
- `walk` and `gesture` require `TERMLINGS_SESSION_ID` (agent session context).

## Messaging In SIM

- Agent communication uses the same workspace messaging model as TUI (`termlings message ...`).
- SIM renders new workspace chat/DM events in-world (chat log + talk bubbles).
- SIM-specific command IPC is for movement/world actions (`walk`, `gesture`, `place`, `destroy`), not canonical messaging.

## Do We Need `--sim` For SIM Actions?

Current behavior: no.

Recommended form:

```bash
termlings sim walk 10,5
```

Non-namespaced `termlings action ...` is intentionally rejected. Use `termlings sim <walk|gesture|map> ...`.

## Data Written Under `.termlings/`

SIM uses these project-local files/directories:

```text
.termlings/
  map.json                # Primary map (auto-copied from src/sim/default-map/map.json if missing)
  map-metadata.json       # Runtime summary used by `termlings sim map`
  sessions/*.json         # Session position/activity
  map/                    # Chunk/object placement data
  objects/                # Custom object definitions
  store/                  # SIM subsystems (tasks/email/cron/etc.)
```

## Runtime Map Selection

- Default: `.termlings/map.json`
- Custom map dir: `termlings --sim play <map-dir>` sets `TERMLINGS_MAP_PATH`

## Agent Context In SIM Worlds

Launcher supports context profiles:
- `default`
- `sim`

SIM profile activates when any of the following is true:
- `TERMLINGS_CONTEXT_PROFILE=sim`
- `TERMLINGS_SIM_MODE` or `TERMLINGS_SIM` is truthy
- `.termlings/map-metadata.json` exists

When SIM profile is active, `src/sim/termlings-system-message-sim.md` is appended to the normal system context.

## Quick Verify

```bash
./bin/termlings.js --sim --help
./bin/termlings.js sim map
./bin/termlings.js sim walk 10,5
```
