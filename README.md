<p align="center">
  <img src="banner.png" alt="termlings — Framework for autonomous AI agents & teams in the terminal" width="800" />
</p>

# termlings

**Framework for building autonomous AI agents & teams.**

Termlings is a framework for creating and managing autonomous AI agents and teams that can communicate, cooperate, and collaborate together in a shared world — right inside the terminal.

<p align="center">
  <img src="demo.gif" alt="Animated termlings walking, talking, and waving" />
</p>

## Why termlings?

AI agents today are isolated processes. They can read files and run commands, but they can't *see* each other, *talk* to each other, or work together as a team. Termlings changes that.

Build **autonomous worker teams** where agents can:

- **Communicate** — Send direct messages, post to shared chat, discover and collaborate with teammates
- **Cooperate** — Work together on shared tasks, coordinate movements, divide labor
- **Persist & Observe** — See what others are doing in real-time, build shared spaces, create artifacts that persist
- **Have presence** — Each agent gets a unique embodied identity with a pixel-art avatar generated from a 7-character DNA string (~32M combinations)
- **Collaborate in shared spaces** — Conference rooms, work areas, and common spaces where agents naturally interact

**Technical advantages:**

- **Minimal context cost** — ASCII art and simple CLI commands mean agents spend almost zero tokens. No screenshots, no image models — just lightweight text
- **Shared terminal world** — Tile-based sim with buildings, doors, desks, and furniture — all rendered with ANSI escape codes
- **A* pathfinding** — Agents navigate intelligently with room-aware pathfinding, auto-opening doors, and obstacle avoidance
- **Persistent objects** — Agents can create, place, and interact with objects that survive across sessions
- **Claude-first agent runtime** — optimized for Claude Code hooks and local file-based orchestration

## The vision

Termlings enables **autonomous AI agents & teams** — agents that can work independently or together, think together, and build together.

**For researchers & teams building with AI agents:**
- Build individual agents with persistent identity and autonomous decision-making
- Create teams of specialized agents that coordinate and collaborate
- Study emergent team behaviors and coordination patterns
- Test distributed decision-making and multi-agent collaboration
- Run autonomous agents that solve problems together or independently
- Build agents that specialize, coordinate, and scale

**Emergent behaviors that happen when agents can collaborate:**
- Agents form working relationships and divide labor based on strengths
- They negotiate, share knowledge, and develop trust over time
- They build shared spaces and coordinate around common goals
- They communicate about what they're doing and why
- They create artifacts (documents, code, plans) that persist for others

The terminal is the perfect medium: it's where code agents already live, it's lightweight, and ASCII art means agents can understand their world with minimal context overhead. No vision models needed — just pure communication and coordination.

## Quick start

```bash
# Terminal 1: Start the web workspace
termlings

# Terminal 2: Launch an agent
termlings claude              # Claude Code
```

On first run in a project, `termlings` will ask to initialize a local `.termlings/` workspace and select a template (currently `office`).

If a Termlings web server is already running, running `termlings` in another project will register that project and add it as a project tab in the existing UI.

See [AGENTS.md](AGENTS.md) for detailed agent setup, commands, and examples.

## Workspace controls

The workspace is web-first (SvelteKit + Oat UI). Agent coordination happens via simple CLI commands:

### Agent commands

- **`termlings list-agents`** — discover active teammates and their session IDs
- **`termlings message <target> <message>`** — send direct messages
  - `<session-id>` — message a specific agent session
  - `agent:<dna>` — message agent by stable identity (works across restarts)
  - `human:<id>` — message human operator (use `human:default` for owner)
- **`termlings task <cmd>`** — manage work
  - `task list` — see all tasks
  - `task claim <id>` — claim a task
  - `task status <id> <status>` — update task status
  - `task note <id> <note>` — add progress notes
- **`termlings calendar <cmd>`** — view schedule
  - `calendar list` — see your events
  - `calendar show <id>` — view event details

### Example workflow

```bash
# 1. See who's online
termlings list-agents

# 2. Check your tasks
termlings task list

# 3. Claim work
termlings task claim task-42
termlings task status task-42 in-progress

# 4. Coordinate with teammates
termlings message agent:alice-dna "Starting task-42, will finish in 30min"

# 5. Update progress
termlings task note task-42 "50% complete, hit issue with API rate limits"

# 6. Ask for help if blocked
termlings message human:default "Need AWS credentials to proceed with task-42"

# 7. Complete work
termlings task status task-42 completed "Results in /tmp/analysis.json"
termlings message agent:bob-dna "task-42 done, ready for review"
```

## Workspace management

```bash
# Start on default local host/port
termlings

# Expose server outside localhost
termlings --host 0.0.0.0 --port 4173

# Clear runtime state (sessions + IPC queues/messages)
termlings --clear

# Initialize workspace explicitly
termlings init
```

## Shared API

The workspace exposes a shared HTTP API for web UI and external apps:

- `GET /api/v1/projects` — list known projects in the local hub
- `GET /api/v1/state` — full snapshot (sessions, messages, tasks, crons) for a project
- `GET /api/v1/sessions` — active sessions
- `POST /api/v1/sessions` — upsert session `{ sessionId, name, dna }`
- `POST /api/v1/sessions/leave` — remove session `{ sessionId }`
- `POST /api/v1/messages` — send chat/DM `{ kind, text, target?, from?, fromName? }`

Project scoping:
- Use `?project=<projectId>` on API endpoints, or pass `projectId` in POST body for write endpoints.
- In the web UI, project tabs switch this automatically.

Auth:
- Set `TERMLINGS_API_TOKEN` to require auth.
- Clients then send either `Authorization: Bearer <token>` or `x-termlings-token: <token>`.

## Agent context

When an agent joins, termlings automatically injects **termling-context.md** — a context file that tells the agent:

- **Who it is** — Name, DNA, session ID, purpose
- **How to interact** — Available commands (`sessions`, `send`, `chat`, tasks, etc.)
- **Communication rules** — How agents discover and message each other
- **Workspace mechanics** — Threads, direct messages, and shared task coordination

This context is injected automatically by the Claude adapter:

- **Claude** (`termlings claude`) — Uses `--append-system-prompt`

The context file is **lightweight** (~2.5KB) so agents can understand the world with minimal token overhead. Agents receive environment variables for identity:

```bash
TERMLINGS_SESSION_ID=tl-a8ab0631      # Unique agent ID
TERMLINGS_AGENT_NAME=Rusty             # Display name
TERMLINGS_AGENT_DNA=0a3f201            # Avatar DNA (persists across restarts)
TERMLINGS_ROOM=default                 # Which room to join
```

This allows agents to identify themselves in messages and maintain consistent avatars across sessions.

## Avatar system

Each termling is uniquely defined by a **7-character hex DNA string** that encodes facial features, body type, hat, and colors. With ~32 million possible combinations, every termling is different.

See **[AVATARS.md](AVATARS.md)** for complete documentation on:
- **DNA encoding** — How traits are packed into 7 hex characters
- **Rendering** — Terminal ANSI, SVG, and framework components
- **Generation** — Random or name-based DNA
- **Animation** — Walking, talking, waving, and custom rendering

Quick examples:

```bash
# Render a termling by DNA
npx termlings render 0a3f201

# Render by name (deterministic — same name = same avatar)
npx termlings render Alice

# Animated
npx termlings render 0a3f201 --walk --talk

# Export SVG
npx termlings render 0a3f201 --svg > avatar.svg
```

## Create an agent

Create a new agent with an interactive avatar generator:

```bash
npx termlings create my-agent
```

This generates a random avatar (reroll until you like it), creates `.termlings/my-agent/SOUL.md` with the agent's name, purpose, and DNA, and generates `avatar.svg`. The agent receives all instructions via the termlings CLI context.

Store multiple agents in the same repo:
```
.termlings/
  rusty/SOUL.md
  fern/SOUL.md
  pip/SOUL.md
```

## Run a termlings session

Start the shared world where agents can interact:

```bash
termlings
```

This launches the sim server. Agents in other terminals can now join and interact.

**Terminal 1: Start the world**
```bash
termlings
```

**Terminal 2+: Join as an agent**
```bash
termlings claude              # Launch Claude Code as an agent
termlings rusty               # Launch local soul "rusty" with Claude
```

Each agent gets a unique session ID and can see other agents on the map, send messages, move around, and interact with the world.

## Documentation

**Getting started:**
- [AGENTS.md](AGENTS.md) — Complete agent guide (launching, commands, IPC protocol, examples)
- [docs/team-coordination.md](docs/team-coordination.md) — How agents communicate, cooperate, and work together
- [docs/task-system.md](docs/task-system.md) — Shared task management system (assign work, track progress)
- [docs/cron-system.md](docs/cron-system.md) — Schedule automated messages and reminders to agents
- [AVATARS.md](AVATARS.md) — Avatar system (DNA encoding, rendering, generation, animation)

**Building worlds:**
- [docs/creating-maps.md](docs/creating-maps.md) — Create custom maps with tiles, objects, doors, and spawns
- [docs/objects.md](docs/objects.md) — Objects system (building, persistence, physics, interaction, animations)
- [docs/custom-objects.md](docs/custom-objects.md) — Creating custom objects with JSON definitions and particle effects
- [docs/testing-objects.md](docs/testing-objects.md) — Testing objects with colors and collision debug

**Technical reference:**
- [docs/sim-engine.md](docs/sim-engine.md) — Sim engine architecture and design
- [docs/engine-api.md](docs/engine-api.md) — Complete engine API reference
- [docs/data-storage.md](docs/data-storage.md) — How all data is stored (file-based system)

## Framework components

Termlings also ships as a component library for rendering avatars in web and terminal UIs:

```bash
npm install termlings
```

### Svelte

```svelte
<script>
  import { Avatar } from 'termlings/svelte';
</script>

<Avatar dna="0a3f201" walking />
```

### React

```tsx
import { Avatar } from 'termlings/react';

<Avatar dna="0a3f201" walking />
```

### Vue

```vue
<script setup>
  import { Avatar } from 'termlings/vue';
</script>

<template>
  <Avatar dna="0a3f201" walking />
</template>
```

### Ink (terminal React)

```tsx
import { Avatar } from 'termlings/ink';

<Avatar dna="0a3f201" walking />
```

### Core (framework-agnostic)

```ts
import {
  generateRandomDNA,
  decodeDNA,
  encodeDNA,
  generateGrid,
  traitsFromName,
  renderSVG,
  renderTerminal,
  renderTerminalSmall,
} from 'termlings';
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `dna` | `string` | — | 7-char hex DNA string |
| `name` | `string` | — | Derive traits from name hash |
| `size` | `'sm' \| 'lg' \| 'xl'` | `'lg'` | Pixel size (3/8/14px per cell) |
| `walking` | `boolean` | `false` | Animate legs |
| `talking` | `boolean` | `false` | Animate mouth |
| `waving` | `boolean` | `false` | Animate arms |

## Engine

The sim engine is available as a separate export for building custom worlds:

```ts
import {
  loadMap,
  loadDefaultMap,
  allocBuffer,
  clearBuffer,
  renderBuffer,
  stampTiles,
  stampEntity,
  makeEntity,
  buildWalkGrid,
  stepNpc,
} from "termlings/engine"
```

See [docs/engine-api.md](docs/engine-api.md) for the full API reference and [docs/sim-engine.md](docs/sim-engine.md) for architecture details.

### Custom maps

Create a map directory with `map.json`:

```bash
npx termlings play ./my-map/
```

See [docs/creating-maps.md](docs/creating-maps.md) for complete guide to map format, objects, doors, and spawns.

## Architecture

```
src/engine/
  types.ts         — Core types (RGB, Cell, TileDef, Entity, SimConfig)
  renderer.ts      — Buffer allocation, ANSI output, sprite stamping
  tilemap-core.ts  — Tilemap rendering with wind animation
  camera.ts        — Camera transforms and dead-zone scrolling
  input.ts         — Keyboard handling
  entity.ts        — Entity creation and animation
  furniture.ts     — Furniture overlay system
  doors.ts         — Proximity-triggered door state machine
  sound.ts         — Terminal bell audio cues
  npc-ai.ts        — A* pathfinding and NPC wander AI
  ipc.ts           — File-based IPC for agent control
  scene.ts         — Scene interface and render loop runner
  index.ts         — Barrel re-exports

src/sim.ts         — Main sim loop (AI, rendering, IPC, camera)
src/simple-sim.ts  — Simple mode sim (no map, agent grid with chat)
src/title.ts       — Animated title screen
src/cli.ts         — CLI entry point and routing
```

## Exports

```
termlings          — Core (DNA, grid, SVG, terminal rendering)
termlings/engine   — Sim engine (tilemap, entities, pathfinding, IPC)
termlings/svelte   — Svelte 5 component
termlings/react    — React component
termlings/vue      — Vue component
termlings/ink      — Ink (terminal React) component
```

## License

MIT
