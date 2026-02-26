# Termlings Game Engine — WIP

A terminal game engine for humans and AI agents. Pixel creatures walk around tile-based worlds — locally or together over the network.

## Status: v2 (Multiplayer + AI Agent API)

### What's done

- **Engine extracted** from monolithic `game.ts` into `src/engine/` modules
- **Custom map support** — load any directory with a `map.txt` and optional `tiles.json`
- **CLI integration** — `termlings play ./my-map/` or `termlings --play`
- **Multiplayer** — real-time WebSocket rooms via Cloudflare Durable Objects
- **AI Agent API** — `GET /api/room/:name/state` returns CSV grid + JSON metadata

### Architecture

```
src/engine/
  types.ts           — RGB, Cell, TileDef, Entity, GameConfig, ParsedMap
  renderer.ts        — buffer allocation, ANSI output, sprite stamping, HUD
  tilemap-core.ts    — pure tilemap functions (no Node.js deps, server-safe)
  tilemap.ts         — re-exports core + Node-dependent loadMap/loadDefaultMap
  camera.ts          — coordinate transforms, camera centering
  input.ts           — keyboard handling, direction tracking
  entity.ts          — entity creation, animation ticks, name labels
  net.ts             — WebSocket client for multiplayer
  index.ts           — barrel re-exports

src/game.ts          — game loop, NPC AI (single-player), multiplayer sync
src/cli.ts           — CLI entry point (play, join subcommands)
src/default-map/     — built-in map

server/
  src/index.ts       — Cloudflare Worker router (HTTP + WebSocket → DOs)
  src/room.ts        — GameRoom Durable Object (players, NPCs, 20Hz tick, AI API)
  src/lobby.ts       — Lobby Durable Object (room CRUD)
  src/protocol.ts    — WebSocket message types (shared client/server)
  wrangler.toml      — Cloudflare Workers config
```

### Multiplayer

Players connect from multiple terminals to shared rooms. The server runs NPC AI and broadcasts state at 20Hz. Player moves are relayed instantly for low latency.

```
Terminal A ──ws──▶ CF Worker ──▶ GameRoom DO ◀──ws── Terminal B
                      │                │
AI Agent ──GET────────┘          alarm() @ 20Hz
```

#### Join a room

```bash
# Start the server
cd server && npx wrangler dev

# Terminal 1
bun src/cli.ts join "ws://localhost:8787/ws/room/test?name=Tommy&dna=0a3f201"

# Terminal 2
bun src/cli.ts join "ws://localhost:8787/ws/room/test?name=Pip&dna=0142a30"
```

The HUD shows player count and connection status. When a player disconnects, others see them disappear.

### AI Agent API

`GET /api/room/:name/state` returns the game world as a CSV grid with entity positions overlaid, followed by a JSON metadata line.

```bash
curl http://localhost:8787/api/room/test/state
```

Response:

```
#,#,#,#,#,#,#,#,#,#
#,.,.,.,.,.,.,.,.,#
#,.,.,P1,.,.,N1,.,.,#
#,.,.,.,.,.,.,.,.,#
#,.,.,.,.,P2,.,.,.,#
#,#,#,#,#,#,#,#,#,#

{"players":{"P1":{"name":"Tommy","dna":"0a3f201","x":3,"y":2,"walking":true,"talking":false,"waving":false},"P2":{"name":"Pip","dna":"0142a30","x":5,"y":4,"walking":false,"talking":false,"waving":false}},"npcs":{"N1":{"name":"Mox","x":6,"y":2}}}
```

The grid uses raw tile characters (`.`, `#`, `,`, `~`, etc.) with entities replacing tiles at their foot position. Split on the blank line, parse each half — one `fetch()` call is all an AI agent needs.

### Map format

A map is a directory:
```
my-map/
  map.txt       # ASCII tile grid (required)
  tiles.json    # Custom tile definitions (optional)
```

**map.txt** — one char per tile:
```
##########
#........#
#...P....#
#........#
#...S....#
##########
```

Tile legend: ` ` void, `.` floor, `#` stone wall, `B` brick, `W` white wall, `G` green wall, `,` grass, `*` flower, `~` water, `T` tree, `D` door, `P` NPC spawn, `S` player spawn

**tiles.json** — override/add tile types:
```json
{
  "name": "My Map",
  "tiles": {
    "~": { "ch": "≈", "fg": [40, 100, 200], "bg": [10, 30, 60], "walkable": false },
    "X": { "ch": "╬", "fg": [200, 50, 50], "walkable": false }
  }
}
```

### What works

- [x] Engine module extraction (types, renderer, tilemap, camera, input, entity)
- [x] `loadMap(dir)` — reads map.txt + tiles.json, merges with defaults
- [x] `loadDefaultMap()` — loads built-in map
- [x] Custom tile definitions (colors, characters, walkability)
- [x] Map name shown in HUD when tiles.json has `"name"`
- [x] `termlings play ./path/` CLI subcommand
- [x] Backward compatible — `termlings --play` still loads built-in map
- [x] All controls work (arrows, t, w, z, d, q)
- [x] NPC spawning, wander AI, name labels
- [x] Zoom toggle on custom maps
- [x] Package export: `termlings/engine`
- [x] Multiplayer via WebSocket rooms (Cloudflare Durable Objects)
- [x] Remote player rendering with names and animations
- [x] Server-authoritative NPC AI at 20Hz
- [x] AI Agent API — CSV grid + JSON metadata
- [x] Lobby API — list/create rooms
- [x] `termlings join <ws-url>` CLI subcommand
- [x] HUD shows player count + connection status

### What's next (v3+)

- [ ] **Scripting/events** — tile triggers, NPC dialogue, collectibles
- [ ] **Game modes** — pacman, bomberman, etc. as map + script bundles
- [ ] **Tile animations** — water ripple, flickering torches
- [ ] **Collision layers** — separate walkability from visual tiles
- [ ] **NPCs in tiles.json** — define NPC DNA, names, behavior per map
- [ ] **Sound** — terminal bell or BEL-based audio cues
- [ ] **Map editor** — in-terminal tile painting
- [ ] **Chat** — in-game text messages between players
- [ ] **Custom maps per room** — upload maps to server via API

### Game ideas

- **Pacman** — maze map, pellet tiles, ghost NPCs with chase AI
- **Bomberman** — destructible wall tiles, bomb placement, chain explosions
- **Roguelike** — procedural dungeon generation, items, combat
- **Social hub** — connected rooms, NPC conversations, quests
- **AI arena** — agents navigate the world, interact, compete

### Running

```bash
# Built-in map (single-player)
bun src/cli.ts --play

# Custom map (single-player)
bun src/cli.ts play ./test-map/

# With specific player DNA
bun src/cli.ts --play 0a3f201

# Start multiplayer server
cd server && npx wrangler dev

# Join a room
bun src/cli.ts join "ws://localhost:8787/ws/room/test?name=Tommy&dna=0a3f201"

# Query AI agent API
curl http://localhost:8787/api/room/test/state
```
