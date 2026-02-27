#!/usr/bin/env node
import {
  renderTerminal,
  renderTerminalSmall,
  renderSVG,
  renderLayeredSVG,
  getAvatarCSS,
  getTraitColors,
  decodeDNA,
  encodeDNA,
  generateRandomDNA,
  traitsFromName,
  generateGrid,
  hslToRgb,
  LEGS,
} from "./index.js";
import type { Pixel } from "./index.js";

const args = process.argv.slice(2);
const flags = new Set<string>();
const opts: Record<string, string> = {};
let input: string | undefined;
const positional: string[] = [];
let agentPassthrough: string[] = [];

// Known flags that take a space-separated value (--room village, --name Foo, etc.)
const VALUE_FLAGS = new Set(["room", "name", "dna", "owner", "purpose", "with", "dangerous-skip-confirmation"]);

// Check if first arg is an agent name — if so, pass everything after it through raw
const { agents: _agentRegistry } = await import("./agents/index.js");
if (args[0] && _agentRegistry[args[0]]) {
  positional.push(args[0]);
  agentPassthrough = args.slice(1);

  // Parse --name, --dna, --room for the launcher (strip them from passthrough)
  const filtered: string[] = [];
  for (let i = 0; i < agentPassthrough.length; i++) {
    const a = agentPassthrough[i]!;
    if (a.startsWith("--name=")) {
      opts.name = a.slice(7);
    } else if (a.startsWith("--dna=")) {
      opts.dna = a.slice(6);
    } else if (a.startsWith("--room=")) {
      opts.room = a.slice(7);
    } else if (a === "--room" && i + 1 < agentPassthrough.length) {
      opts.room = agentPassthrough[++i]!;
    } else if (a === "--name" && i + 1 < agentPassthrough.length) {
      opts.name = agentPassthrough[++i]!;
    } else if (a === "--dna" && i + 1 < agentPassthrough.length) {
      opts.dna = agentPassthrough[++i]!;
    } else {
      filtered.push(a);
    }
  }
  agentPassthrough = filtered;
} else {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        opts[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        flags.add(arg.slice(2, eqIdx));
      } else {
        const key = arg.slice(2);
        if (VALUE_FLAGS.has(key) && i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
          opts[key] = args[++i]!;
          flags.add(key);
        } else {
          flags.add(key);
        }
      }
    } else if (arg === "-h") {
      flags.add("help");
    } else {
      positional.push(arg);
      if (!input) input = arg;
    }
  }
}

// --- Routing ---

// 1. Agent launcher: termlings <cli> [--room <slug>] [flags...]
// If there are local agents, show picker. Otherwise launch CLI directly.
let agentAdapter = _agentRegistry[positional[0] ?? ""];

if (agentAdapter) {
  const { discoverLocalAgents } = await import("./agents/discover.js");
  const localAgents = discoverLocalAgents();

  const room = opts.room || "default";
  process.env.TERMLINGS_ROOM = room;

  // If we have agents, show picker. Otherwise launch CLI directly.
  if (localAgents.length > 0) {
    const { selectLocalAgentWithRoom } = await import("./agents/discover.js");
    const selected = await selectLocalAgentWithRoom(localAgents, room);

    if (selected) {
      process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name;
      process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna;
      const commandName = opts.with || selected.soul?.command || positional[0];

      const { launchLocalAgent } = await import("./agents/launcher.js");
      await launchLocalAgent(selected, agentPassthrough, opts, commandName);
      process.exit(0);
    }
  } else {
    // No agents, just launch the CLI directly
    const { launchAgent } = await import("./agents/launcher.js");
    await launchAgent(agentAdapter, agentPassthrough, opts);
  }
}

// 2. Agent IPC subcommands: termlings action <verb>
if (positional[0] === "action") {
  // Set room from env so IPC reads/writes go to the correct directory
  const room = process.env.TERMLINGS_ROOM || "default";
  const { setRoom } = await import("./engine/ipc.js");
  setRoom(room);

  const verb = positional[1];

  if (!verb) {
    console.error(`Usage: termlings action <command>

Commands:
  walk <x>,<y>                Walk avatar to coordinates
  talk                       Toggle talk animation
  gesture --wave             Wave gesture
  stop                       Stop current action
  map                        Structured map with rooms, agents, distances
  map --ascii [--large]      ASCII grid (--large for bigger view)
  map --sessions             Quick session ID list
  chat <message>             Post to sim chat log (visible to owner)
  send <session-id> <msg>    Direct message to a specific agent
  inbox                      Read messages from other agents
  build <type> <x>,<y>       Build an object (tree, rock, sign, etc.)
  destroy <x>,<y>            Destroy an agent-built object`);
    process.exit(1);
  }

  // Common env vars for agent commands
  const _agentName = process.env.TERMLINGS_AGENT_NAME || undefined;
  const _agentDna = process.env.TERMLINGS_AGENT_DNA || undefined;

  if (verb === "walk") {
    const { readState, writeCommand } = await import("./engine/ipc.js");
    const _state = readState();
    if (_state?.map?.mode === "simple") {
      console.error("Error: walk is disabled in simple mode");
      process.exit(1);
    }
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const coord = positional[2];
    if (!coord || !coord.includes(",")) {
      console.error("Usage: termlings action walk <x>,<y>");
      process.exit(1);
    }
    const [xStr, yStr] = coord.split(",");
    const x = parseInt(xStr!, 10);
    const y = parseInt(yStr!, 10);
    if (isNaN(x) || isNaN(y)) {
      console.error("Error: coordinates must be numbers");
      process.exit(1);
    }
    writeCommand(sessionId, { action: "walk", x, y, name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log(`Walk command sent → (${x}, ${y})`);
    process.exit(0);
  }

  if (verb === "talk") {
    const { writeCommand } = await import("./engine/ipc.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    writeCommand(sessionId, { action: "gesture", type: "talk", name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log("Talk gesture sent");
    process.exit(0);
  }

  if (verb === "gesture") {
    const { writeCommand } = await import("./engine/ipc.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const type = flags.has("wave") ? "wave" as const : "talk" as const;
    writeCommand(sessionId, { action: "gesture", type, name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log(`Gesture sent: ${type}`);
    process.exit(0);
  }

  if (verb === "stop") {
    const { writeCommand } = await import("./engine/ipc.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    writeCommand(sessionId, { action: "stop", name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log("Stop command sent");
    process.exit(0);
  }

  if (verb === "map") {
    const { readState, IPC_DIR } = await import("./engine/ipc.js");
    const { FURNITURE_DEFS } = await import("./engine/furniture.js");
    const { describeRelative } = await import("./engine/room-detect.js");
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");

    const state = readState();
    if (!state) {
      console.error("No sim state found. Is termlings --play running?");
      process.exit(1);
    }

    // Sessions-only mode: show just session IDs and positions
    if (flags.has("sessions")) {
      const mySessionId = process.env.TERMLINGS_SESSION_ID;
      for (const e of state.entities) {
        const status = e.idle ? "idle" : "active";
        const isMe = e.sessionId === mySessionId;
        console.log(`${e.sessionId.padEnd(16)} (${e.x}, ${e.footY}) [${status}]${isMe ? " (you)" : ""}`);
      }
      process.exit(0);
    }

    // Simple mode: show agent list instead of terrain
    if (state.map.mode === "simple") {
      const mySessionId = process.env.TERMLINGS_SESSION_ID;
      console.log("Simple mode (no map)\n");
      console.log("Agents:");
      for (const e of state.entities) {
        const status = e.idle ? "idle" : "active";
        const isMe = e.sessionId === mySessionId;
        console.log(`  ${e.name.padEnd(14)} ${e.sessionId.padEnd(16)} [${status}]${isMe ? "  (you)" : ""}`);
      }
      console.log("\nUse: termlings action send <session-id> <message>");
      process.exit(0);
    }

    const { width, height, name, tiles, rooms: stateRooms } = state.map;
    const mySessionId = process.env.TERMLINGS_SESSION_ID;

    // Find "me" for centering the local view
    const me = state.entities.find(e => e.sessionId === mySessionId);
    const centerX = me ? me.x : (state.entities[0]?.x ?? Math.floor(width / 2));
    const centerY = me ? me.footY : (state.entities[0]?.footY ?? Math.floor(height / 2));

    // Helper: find which room a coordinate is in
    type StateRoom = NonNullable<typeof stateRooms>[number];
    function findRoom(x: number, y: number): StateRoom | null {
      if (!stateRooms) return null;
      for (const r of stateRooms) {
        const b = r.bounds;
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return r;
      }
      return null;
    }

    // --- ASCII mode (--ascii flag) ---
    if (flags.has("ascii")) {
      const tileChar: Record<string, string> = {
        " ": " ", ".": "·", ",": ",", "#": "#", "B": "#", "W": "#", "G": "#",
        "T": "T", "~": "~", "D": "D", "e": ".", "p": ".", "n": ".", "h": ".",
        "*": ",", "f": ",", "c": ",", "r": ",", "v": ",", "o": ",", "w": ",",
        "P": ".", "S": ".",
      };

      const largeMap = flags.has("large");
      const viewW = largeMap ? 140 : 70;
      const viewH = largeMap ? 60 : 30;
      const x0 = Math.max(0, Math.min(centerX - Math.floor(viewW / 2), width - viewW));
      const y0 = Math.max(0, Math.min(centerY - Math.floor(viewH / 2), height - viewH));

      console.log(`Map: ${name || "unknown"} (${width}x${height})  View: (${x0},${y0}) to (${x0 + viewW},${y0 + viewH})`);
      console.log();

      const grid = Array.from({ length: viewH }, (_, vy) =>
        Array.from({ length: viewW }, (_, vx) => {
          if (!tiles) return " ";
          const tile = tiles[y0 + vy]?.[x0 + vx] ?? " ";
          return tileChar[tile] ?? tile;
        })
      );

      // Convert door markers to [door] label
      for (let vy = 0; vy < viewH; vy++) {
        for (let vx = 0; vx < viewW; vx++) {
          if (grid[vy]![vx] !== "D") continue;
          const leftDoor = vx > 0 && grid[vy]![vx - 1] === "D";
          const upDoor = vy > 0 && grid[vy - 1]![vx] === "D";
          if (!leftDoor && !upDoor) {
            const label = "[door]";
            for (let c = 0; c < label.length; c++) {
              if (vx + c < viewW) grid[vy]![vx + c] = label[c]!;
            }
          } else {
            if (grid[vy]![vx] === "D") grid[vy]![vx] = " ";
          }
        }
      }

      // Load agent-built objects from placements.json
      interface Placement { def: string; x: number; y: number }
      let placements: Placement[] = [];
      const placementsFile = join(IPC_DIR, "placements.json");
      if (existsSync(placementsFile)) {
        try {
          placements = JSON.parse(readFileSync(placementsFile, "utf8")) as Placement[];
        } catch {}
      }

      const objectLegend: { num: number; name: string; x: number; y: number }[] = [];
      let objNum = 1;
      for (const p of placements) {
        const def = FURNITURE_DEFS[p.def];
        if (!def) continue;
        const objW = def.width;
        const objH = def.height;
        const vx0 = p.x - x0;
        const vy0 = p.y - y0;
        if (vx0 + objW <= 0 || vx0 >= viewW || vy0 + objH <= 0 || vy0 >= viewH) continue;

        const bracketedName = `[${p.def}]`;
        const bracketedNum = `[${objNum}]`;
        let label: string;
        if (objW >= bracketedName.length) {
          label = bracketedName;
        } else if (objW >= bracketedNum.length) {
          label = bracketedNum;
          objectLegend.push({ num: objNum, name: p.def, x: p.x, y: p.y });
        } else {
          label = `${objNum}`;
          objectLegend.push({ num: objNum, name: p.def, x: p.x, y: p.y });
        }
        objNum++;

        const startCol = vx0 + Math.max(0, Math.floor((objW - label.length) / 2));
        const stampY = Math.max(0, vy0);
        if (stampY >= viewH) continue;
        for (let c = 0; c < label.length; c++) {
          const gx = startCol + c;
          if (gx >= 0 && gx < viewW) grid[stampY]![gx] = label[c]!;
        }
      }

      // Place entities
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i]!;
        const footLeft = e.x + 1 - x0;
        const gy = e.footY - y0;
        if (gy < 0 || gy >= viewH) continue;
        const eName = e.name || "???";
        const inner = eName.length <= 5 ? eName.padStart(Math.ceil((5 + eName.length) / 2)).padEnd(5) : eName.slice(0, 5);
        const label = `[${inner}]`;
        for (let c = 0; c < 7; c++) {
          const gx = footLeft + c;
          if (gx < 0 || gx >= viewW) continue;
          grid[gy]![gx] = label[c]!;
        }
      }

      for (const row of grid) console.log(row.join(""));

      console.log();
      console.log("Agents:");
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i]!;
        const status = e.idle ? "idle" : "active";
        const isMe = e.sessionId === mySessionId;
        const eName = e.name || "???";
        console.log(`  [${eName.padEnd(5).slice(0, 5)}]  ${eName.padEnd(14)} ${e.sessionId.padEnd(16)} (${e.x + 4}, ${e.footY}) [${status}]${isMe ? " (you)" : ""}`);
      }

      if (objectLegend.length > 0) {
        console.log();
        console.log("Objects:");
        for (const obj of objectLegend) {
          console.log(`  [${obj.num}] ${obj.name.padEnd(14)} (${obj.x}, ${obj.y})`);
        }
      }

      console.log();
      console.log("Legend: [Name] = agent  # = wall  T = tree  ~ = water  , = grass  · = path  [door] = door");
      if (!flags.has("large")) console.log("Use --large for a bigger view");
      process.exit(0);
    }

    // --- Structured output (default) ---

    const myRoom = me ? findRoom(me.x + 4, me.footY) : null;
    const myX = me ? me.x + 4 : centerX;
    const myY = me ? me.footY : centerY;

    // Header
    console.log(`Map: ${name || "unknown"} (${width}x${height})`);
    if (me) {
      const roomLabel = myRoom ? `in ${myRoom.wallType} room (room${myRoom.id})` : "outdoors";
      console.log(`You: (${myX}, ${myY}) — ${roomLabel}`);
    }

    // Rooms section
    if (stateRooms && stateRooms.length > 0) {
      console.log();
      console.log(`Rooms (${stateRooms.length}):`);
      for (const r of stateRooms) {
        const b = r.bounds;
        // Group doors by direction+target to avoid listing 8 individual door tiles
        const doorGroups = new Map<string, { dir: string; target: string; count: number; x: number; y: number }>();
        for (const d of r.doors) {
          let dir = "";
          if (d.x <= b.x) dir = "west";
          else if (d.x >= b.x + b.w - 1) dir = "east";
          else if (d.y <= b.y) dir = "north";
          else dir = "south";
          const target = d.toRoom ? `room${d.toRoom}` : "outside";
          const key = `${dir}-${target}`;
          const existing = doorGroups.get(key);
          if (existing) {
            existing.count++;
          } else {
            doorGroups.set(key, { dir, target, count: 1, x: d.x, y: d.y });
          }
        }
        const doorParts: string[] = [];
        for (const g of doorGroups.values()) {
          doorParts.push(`${g.dir}(${g.x},${g.y})->${g.target}`);
        }
        const doorsStr = doorParts.length > 0 ? `  doors: ${doorParts.join(" ")}` : "";
        console.log(`  room${String(r.id).padEnd(4)} ${r.wallType.padEnd(6)} (${b.x},${b.y})-(${b.x + b.w},${b.y + b.h})${doorsStr}`);
      }
    }

    // Agents section
    console.log();
    console.log("Agents:");
    for (const e of state.entities) {
      const status = e.idle ? "idle" : "active";
      const isMe = e.sessionId === mySessionId;
      const eName = e.name || "???";
      const ex = e.x + 4;
      const ey = e.footY;
      const eRoom = findRoom(ex, ey);
      const roomLabel = eRoom ? `room${eRoom.id}` : "outdoors";
      const rel = isMe ? "(you)" : describeRelative(myX, myY, ex, ey);
      console.log(`  ${eName.padEnd(10)} ${e.sessionId.padEnd(16)} (${ex},${ey})  ${status.padEnd(6)}  ${roomLabel.padEnd(10)}  ${rel}`);
    }

    // Objects section
    interface Placement { def: string; x: number; y: number }
    let placements: Placement[] = [];
    const placementsFile = join(IPC_DIR, "placements.json");
    if (existsSync(placementsFile)) {
      try {
        placements = JSON.parse(readFileSync(placementsFile, "utf8")) as Placement[];
      } catch {}
    }

    if (placements.length > 0) {
      console.log();
      console.log("Objects:");
      for (const p of placements) {
        const oRoom = findRoom(p.x, p.y);
        const roomLabel = oRoom ? `room${oRoom.id}` : "outdoors";
        console.log(`  ${p.def.padEnd(16)} (${p.x},${p.y})  ${roomLabel}`);
      }
    }

    // Nearby doors from "me"
    if (me && stateRooms && stateRooms.length > 0) {
      const allDoors: { x: number; y: number; toRoom: number | null; fromRoom: number }[] = [];
      for (const r of stateRooms) {
        for (const d of r.doors) {
          allDoors.push({ ...d, fromRoom: r.id });
        }
      }
      // Sort by distance from me
      allDoors.sort((a, b) => {
        const da = Math.abs(a.x - myX) + Math.abs(a.y - myY);
        const db = Math.abs(b.x - myX) + Math.abs(b.y - myY);
        return da - db;
      });
      // Show closest 5 unique doors
      const shown = new Set<string>();
      const nearby: typeof allDoors = [];
      for (const d of allDoors) {
        const key = `${d.x},${d.y}`;
        if (shown.has(key)) continue;
        shown.add(key);
        nearby.push(d);
        if (nearby.length >= 5) break;
      }
      if (nearby.length > 0) {
        console.log();
        console.log("Nearby doors:");
        for (const d of nearby) {
          const target = d.toRoom ? `room${d.toRoom}` : "outside";
          const rel = describeRelative(myX, myY, d.x, d.y);
          console.log(`  (${d.x},${d.y}) -> ${target.padEnd(10)}  ${rel}`);
        }
      }
    }

    console.log();
    console.log("Use --ascii for visual map, --sessions for session IDs only");
    process.exit(0);
  }

  if (verb === "send") {
    const { writeCommand } = await import("./engine/ipc.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const target = positional[2];
    const text = positional.slice(3).join(" ");
    if (!target || !text) {
      console.error("Usage: termlings action send <session-id> <message>");
      process.exit(1);
    }
    writeCommand(sessionId, { action: "send", target, text, name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log(`Sent to ${target}: "${text}"`);
    process.exit(0);
  }

  if (verb === "chat") {
    const { writeCommand } = await import("./engine/ipc.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const text = positional.slice(2).join(" ");
    if (!text) {
      console.error("Usage: termlings action chat <message>");
      process.exit(1);
    }
    writeCommand(sessionId, { action: "chat", text, name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log(`Chat: "${text}"`);
    process.exit(0);
  }

  if (verb === "inbox") {
    const { readMessages } = await import("./engine/ipc.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const messages = readMessages(sessionId);
    if (messages.length === 0) {
      // Silent when empty — clean for PTY injection and hook usage
    } else {
      for (const msg of messages) {
        console.log(`[${msg.fromName}] ${msg.text}`);
      }
    }
    process.exit(0);
  }

  if (verb === "build") {
    const { readState: readStateBuild, writeCommand } = await import("./engine/ipc.js");
    const _stateBuild = readStateBuild();
    if (_stateBuild?.map?.mode === "simple") {
      console.error("Error: build is disabled in simple mode");
      process.exit(1);
    }
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const objectType = positional[2];
    const coord = positional[3];
    if (!objectType) {
      console.error("Usage: termlings action build <objectType> <x>,<y>");
      process.exit(1);
    }
    let x: number | undefined;
    let y: number | undefined;
    if (coord && coord.includes(",")) {
      const [xStr, yStr] = coord.split(",");
      x = parseInt(xStr!, 10);
      y = parseInt(yStr!, 10);
      if (isNaN(x) || isNaN(y)) {
        console.error("Error: coordinates must be numbers");
        process.exit(1);
      }
    }
    writeCommand(sessionId, { action: "build", objectType, x, y, name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log(`Build command sent: ${objectType}${x !== undefined ? ` at (${x},${y})` : ""}`);
    process.exit(0);
  }

  if (verb === "destroy") {
    const { readState: readStateDestroy, writeCommand } = await import("./engine/ipc.js");
    const _stateDestroy = readStateDestroy();
    if (_stateDestroy?.map?.mode === "simple") {
      console.error("Error: destroy is disabled in simple mode");
      process.exit(1);
    }
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }
    const coord = positional[2];
    if (!coord || !coord.includes(",")) {
      console.error("Usage: termlings action destroy <x>,<y>");
      process.exit(1);
    }
    const [xStr, yStr] = coord.split(",");
    const x = parseInt(xStr!, 10);
    const y = parseInt(yStr!, 10);
    if (isNaN(x) || isNaN(y)) {
      console.error("Error: coordinates must be numbers");
      process.exit(1);
    }
    writeCommand(sessionId, { action: "destroy", x, y, name: _agentName, dna: _agentDna, ts: Date.now() });
    console.log(`Destroy command sent at (${x},${y})`);
    process.exit(0);
  }

  console.error(`Unknown action: ${verb}`);
  process.exit(1);
}

// 3. Render subcommand: termlings render [dna|name] [options]
if (positional[0] === "render") {
  // Use positional[1] as the render input (DNA or name)
  input = positional[1];

  if (flags.has("random") || !input) {
    input = generateRandomDNA();
  }

  // Resolve DNA: hex string or name
  const isDNA = /^[0-9a-f]{6,7}$/i.test(input);
  const dna = isDNA ? input : encodeDNA(traitsFromName(input));

  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";

  if (!isDNA) {
    console.log(`${DIM}"${input}" → dna: ${dna}${RESET}\n`);
  } else {
    console.log(`${DIM}dna: ${dna}${RESET}\n`);
  }

  const bw = flags.has("bw");

  if (flags.has("info")) {
    const traits = decodeDNA(dna);
    console.log("Traits:", JSON.stringify(traits, null, 2));
    console.log();
  }

  if (flags.has("svg")) {
    const size = opts.size ? parseInt(opts.size, 10) : 10;
    const padding = opts.padding !== undefined ? parseInt(opts.padding, 10) : 1;
    const bg = opts.bg === "none" || !opts.bg ? null : opts.bg;

    if (flags.has("animated")) {
      // Animated SVG with embedded CSS keyframes
      const { svg, legFrames } = renderLayeredSVG(dna, size, bw);
      const css = getAvatarCSS();
      const classes = ["tg-avatar"];
      if (flags.has("walk")) classes.push("walking");
      if (flags.has("talk")) classes.push("talking");
      if (flags.has("wave")) classes.push("waving");
      if (legFrames === 3) classes.push("walk-3f");
      if (legFrames === 4) classes.push("walk-4f");
      if (!flags.has("walk") && !flags.has("talk") && !flags.has("wave")) classes.push("idle");

      // Wrap SVG in a container with animation classes and inject CSS
      const animated = svg
        .replace("<svg ", `<svg class="${classes.join(" ")}" `)
        .replace("</svg>", `<style>${css}</style></svg>`);

      if (bg) {
        // Insert background rect after opening tag
        const insertIdx = animated.indexOf(">") + 1;
        const widthMatch = animated.match(/width="(\d+)"/);
        const heightMatch = animated.match(/height="(\d+)"/);
        const w = widthMatch?.[1] ?? "90";
        const h = heightMatch?.[1] ?? "90";
        console.log(
          animated.slice(0, insertIdx) +
          `<rect width="${w}" height="${h}" fill="${bg}"/>` +
          animated.slice(insertIdx)
        );
      } else {
        console.log(animated);
      }
    } else {
      // Static SVG
      console.log(renderSVG(dna, size, 0, bg, padding, bw));
    }
    process.exit(0);
  }

  if (flags.has("mp4")) {
    // Export animated MP4 — requires ffmpeg
    const { execSync, execFileSync } = await import("child_process");
    const { mkdirSync, writeFileSync, rmSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    // Check ffmpeg
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
    } catch {
      console.error("Error: ffmpeg is required for --mp4. Install it: https://ffmpeg.org/download.html");
      process.exit(1);
    }

    const mp4Traits = decodeDNA(dna);
    const mp4LegFrames = LEGS[mp4Traits.legs].length;
    const fps = opts.fps ? parseInt(opts.fps, 10) : 4;
    const duration = opts.duration ? parseInt(opts.duration, 10) : 3;
    const totalFrames = fps * duration;
    const outFile = opts.out || "termling.mp4";
    const size = opts.size ? parseInt(opts.size, 10) : 10;
    const padding = opts.padding !== undefined ? parseInt(opts.padding, 10) : 1;
    const bg = opts.bg === "none" ? null : opts.bg || "#000";

    const doWalk = flags.has("walk");
    const doTalk = flags.has("talk");
    const doWave = flags.has("wave");

    const { faceRgb: faceRgbMp4, darkRgb: darkRgbMp4, hatRgb: hatRgbMp4 } = getTraitColors(mp4Traits, bw);

    const cols = 9;
    const half = Math.round(size / 2);
    const quarter = Math.round(size / 4);

    // Parse hex color to RGB
    function hexToRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    const bgRgb: [number, number, number] = bg ? hexToRgb(bg) : [0, 0, 0];

    function gridToPPM(grid: typeof generateGrid extends (...a: any[]) => infer R ? R : never): Buffer {
      const rows = grid.length;
      const w = (cols + padding * 2) * size;
      const h = (rows + padding * 2) * size;
      const pixels = Buffer.alloc(w * h * 3);

      // Fill background
      for (let i = 0; i < w * h; i++) {
        if (bg) {
          pixels[i * 3] = bgRgb[0];
          pixels[i * 3 + 1] = bgRgb[1];
          pixels[i * 3 + 2] = bgRgb[2];
        }
      }

      function fillRect(rx: number, ry: number, rw: number, rh: number, r: number, g: number, b: number) {
        for (let py = ry; py < ry + rh && py < h; py++) {
          for (let px = rx; px < rx + rw && px < w; px++) {
            const idx = (py * w + px) * 3;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
          }
        }
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cell = grid[y][x];
          const rx = (x + padding) * size;
          const ry = (y + padding) * size;
          const [fR, fG, fB] = faceRgbMp4;
          const [dR, dG, dB] = darkRgbMp4;
          const [hR, hG, hB] = hatRgbMp4;

          if (cell === "f") fillRect(rx, ry, size, size, fR, fG, fB);
          else if (cell === "l") fillRect(rx, ry, half, size, fR, fG, fB);
          else if (cell === "a") fillRect(rx, ry + half, size, half, fR, fG, fB);
          else if (cell === "e" || cell === "d") fillRect(rx, ry, size, size, dR, dG, dB);
          else if (cell === "s") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx, ry + half, size, half, dR, dG, dB); }
          else if (cell === "n") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx + quarter, ry, half, size, dR, dG, dB); }
          else if (cell === "m") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx, ry, size, half, dR, dG, dB); }
          else if (cell === "q") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx + half, ry + half, half, half, dR, dG, dB); }
          else if (cell === "r") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx, ry + half, half, half, dR, dG, dB); }
          else if (cell === "h") fillRect(rx, ry, size, size, hR, hG, hB);
          else if (cell === "k") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx + quarter, ry, half, size, hR, hG, hB); }
        }
      }

      const header = `P6\n${w} ${h}\n255\n`;
      return Buffer.concat([Buffer.from(header), pixels]);
    }

    const tmpDir = join(tmpdir(), `termlings-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    console.log(`Generating ${totalFrames} frames...`);
    for (let f = 0; f < totalFrames; f++) {
      const walkF = doWalk ? f % mp4LegFrames : 0;
      const talkF = doTalk ? f % 2 : 0;
      const waveF = doWave ? (f % 2) + 1 : 0;
      const grid = generateGrid(mp4Traits, walkF, talkF, waveF);
      const ppm = gridToPPM(grid);
      writeFileSync(join(tmpDir, `frame-${String(f).padStart(4, "0")}.ppm`), ppm);
    }

    console.log(`Encoding ${outFile}...`);
    execSync(
      `ffmpeg -y -framerate ${fps} -i "${tmpDir}/frame-%04d.ppm" -c:v libx264 -pix_fmt yuv420p -crf 18 -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" "${outFile}"`,
      { stdio: "inherit" }
    );

    rmSync(tmpDir, { recursive: true, force: true });
    console.log(`Done: ${outFile}`);
    process.exit(0);
  }

  const animate = flags.has("walk") || flags.has("talk") || flags.has("wave");
  const compact = flags.has("compact");

  if (!animate) {
    // Static render
    const output = compact
      ? renderTerminalSmall(dna, 0, bw)
      : renderTerminal(dna, 0, bw);
    console.log(output);
    process.exit(0);
  }

  // --- Animated render with ANSI escape codes ---
  const traits = decodeDNA(dna);
  const legFrameCount = LEGS[traits.legs].length;
  const { faceRgb, darkRgb, hatRgb } = getTraitColors(traits, bw);

  let walkFrame = 0;
  let talkFrame = 0;
  let waveFrame = 0;
  let tick = 0;

  // Hide cursor
  process.stdout.write("\x1b[?25l");

  function cleanup() {
    process.stdout.write("\x1b[?25h\n");
    process.exit(0);
  }
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Draw first frame
  const firstGrid = generateGrid(traits, 0, 0, 0);
  const firstOutput = compact
    ? renderSmallFromGrid(firstGrid, faceRgb, darkRgb, hatRgb)
    : renderFromGrid(firstGrid, faceRgb, darkRgb, hatRgb);
  const lineCount = firstOutput.split("\n").length;
  process.stdout.write(firstOutput + "\n");

  setInterval(() => {
    tick++;

    if (flags.has("walk")) walkFrame = tick % legFrameCount;
    if (flags.has("talk")) talkFrame = tick % 2;
    if (flags.has("wave")) waveFrame = (tick % 2) + 1;

    const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);
    const output = compact
      ? renderSmallFromGrid(grid, faceRgb, darkRgb, hatRgb)
      : renderFromGrid(grid, faceRgb, darkRgb, hatRgb);

    // Move cursor up to overwrite previous frame
    process.stdout.write(`\x1b[${lineCount}A`);
    process.stdout.write(output + "\n");
  }, 300);

  // Keep alive
  await new Promise(() => {});
}

// 4. Join multiplayer: termlings join <ws-url>
if (positional[0] === "join") {
  const wsUrl = positional[1];
  if (!wsUrl) {
    console.error("Usage: termlings join <ws-url>");
    console.error("Example: termlings join ws://localhost:8787/ws/room/test?name=Tommy&dna=0a3f201");
    process.exit(1);
  }
  process.env.TERMLINGS_WS_URL = wsUrl;
  await import("./sim.js");
  await new Promise(() => {});
}

// 5. Create agent scaffold: termlings create [folder]
if (positional[0] === "create") {
  const { runCreate } = await import("./create.js");
  await runCreate();
  process.exit(0);
}

// 6. Help
if (flags.has("help") || flags.has("h")) {
  console.log(`Usage: termlings [options]
       termlings render [dna|name] [options]
       termlings <agent> [options]

Sim (default):
  termlings                Start the sim (default room)
  termlings --room <slug>  Start the sim in a named room
  termlings --simple       Start in simple mode (no map, agent grid)

Agents:
  claude [flags...]        Start Claude Code as an agent
  codex [flags...]         Start Codex CLI as an agent
  --room <slug>            Join a specific room (default: "default")
  --name <name>            Agent display name
  --dna <hex>              Agent avatar DNA

Render:
  render [dna|name]        Render a termling in the terminal
  render --svg             Output SVG
  render --mp4             Export animated MP4
  render --walk/--talk/--wave  Animate
  render --compact         Half-height
  render --info            Show DNA traits
  render --bw              Black & white
  render --random          Random termling
  render --animated        SVG with CSS animation
  render --size=<px>       SVG pixel size (default: 10)
  render --bg=<color>      SVG background (hex or "none")
  render --padding=<n>     SVG padding in pixels (default: 1)
  render --out=<file>      MP4 output path (default: termling.mp4)
  render --fps=<n>         MP4 frame rate (default: 4)
  render --duration=<n>    MP4 duration in seconds (default: 3)

Other:
  action <verb> [args]     Agent IPC commands (walk, map, chat, etc.)
  join <ws-url>            Join multiplayer server
  create [folder]          Scaffold a new agent
  --help                   Show this help`);
  process.exit(0);
}

// 7. Default: launch sim
//    termlings              → default room (shows title screen first)
//    termlings --room village → named room (skips title)
//    termlings play [path]  → backward compat for play subcommand
//    termlings --play       → backward compat for --play flag
{
  const selectedRoom = opts.room || "default";

  const { showTitleScreen, roomHasAgents } = await import("./title.js");
  if (!roomHasAgents(selectedRoom)) {
    await showTitleScreen(selectedRoom);
  }

  process.env.TERMLINGS_ROOM = selectedRoom;

  if (flags.has("simple")) {
    process.env.TERMLINGS_SIMPLE = "1";
    await import("./simple-sim.js");
    await new Promise(() => {});
  }

  // Support "play ./path" and "--play" for backward compat
  const mapArg = positional[0] === "play" ? (positional[1] || null) : null;
  if (mapArg) process.env.TERMLINGS_MAP_PATH = mapArg;

  await import("./sim.js");
  await new Promise(() => {});
}

// --- Render helper functions (used by render subcommand) ---

function renderFromGrid(grid: Pixel[][], faceRgb: [number, number, number], darkRgb: [number, number, number], hatRgb: [number, number, number]): string {
  const faceAnsi = `\x1b[38;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;
  const darkAnsi = `\x1b[38;2;${darkRgb[0]};${darkRgb[1]};${darkRgb[2]}m`;
  const hatAnsi = `\x1b[38;2;${hatRgb[0]};${hatRgb[1]};${hatRgb[2]}m`;
  const reset = "\x1b[0m";
  const faceBg = `\x1b[48;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;

  const lines: string[] = [];
  for (const row of grid) {
    let line = "";
    for (const cell of row) {
      if (cell === "_") line += "  ";
      else if (cell === "f") line += `${faceAnsi}██${reset}`;
      else if (cell === "l") line += `${faceAnsi}▌${reset} `;
      else if (cell === "e" || cell === "d") line += `${darkAnsi}██${reset}`;
      else if (cell === "s") line += `${darkAnsi}${faceBg}▄▄${reset}`;
      else if (cell === "n") line += `${darkAnsi}${faceBg}▐▌${reset}`;
      else if (cell === "m") line += `${darkAnsi}${faceBg}▀▀${reset}`;
      else if (cell === "q") line += `${darkAnsi}${faceBg} ▗${reset}`;
      else if (cell === "r") line += `${darkAnsi}${faceBg}▖ ${reset}`;
      else if (cell === "a") line += `${faceAnsi}▄▄${reset}`;
      else if (cell === "h") line += `${hatAnsi}██${reset}`;
      else if (cell === "k") line += `${hatAnsi}▐▌${reset}`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function renderSmallFromGrid(grid: Pixel[][], faceRgb: [number, number, number], darkRgb: [number, number, number], hatRgb: [number, number, number]): string {
  const reset = "\x1b[0m";

  function cellRgb(cell: Pixel): [number, number, number] | null {
    if (cell === "f" || cell === "l" || cell === "a" || cell === "q" || cell === "r") return faceRgb;
    if (cell === "e" || cell === "s" || cell === "n" || cell === "d" || cell === "m") return darkRgb;
    if (cell === "h" || cell === "k") return hatRgb;
    return null;
  }

  const lines: string[] = [];
  for (let r = 0; r < grid.length; r += 2) {
    const topRow = grid[r];
    const botRow = r + 1 < grid.length ? grid[r + 1] : null;
    let line = "";
    for (let c = 0; c < topRow.length; c++) {
      const top = cellRgb(topRow[c]);
      const bot = botRow ? cellRgb(botRow[c]) : null;
      if (top && bot) {
        line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m\x1b[48;2;${bot[0]};${bot[1]};${bot[2]}m▀${reset}`;
      } else if (top) {
        line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m▀${reset}`;
      } else if (bot) {
        line += `\x1b[38;2;${bot[0]};${bot[1]};${bot[2]}m▄${reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}
