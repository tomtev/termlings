#!/usr/bin/env node
import { dirname } from "path";
import { fileURLToPath } from "url";
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

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flags = new Set<string>();
const opts: Record<string, string> = {};
let input: string | undefined;
const positional: string[] = [];
let agentPassthrough: string[] = [];

// Known flags that take a space-separated value (--name Foo, --dna abc123, etc.)
const VALUE_FLAGS = new Set(["name", "dna", "owner", "purpose", "with", "dangerous-skip-confirmation"]);

// Check if first arg is an agent name — if so, pass everything after it through raw
const { agents: _agentRegistry } = await import("./agents/index.js");
if (args[0] && _agentRegistry[args[0]]) {
  positional.push(args[0]);
  agentPassthrough = args.slice(1);

  // Parse --name, --dna for the launcher (strip them from passthrough)
  const filtered: string[] = [];
  for (let i = 0; i < agentPassthrough.length; i++) {
    const a = agentPassthrough[i]!;
    if (a.startsWith("--name=")) {
      opts.name = a.slice(7);
    } else if (a.startsWith("--dna=")) {
      opts.dna = a.slice(6);
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

// 0. Clear command: termlings --clear
if (flags.has("clear")) {
  const { rmSync, readdirSync } = await import("fs");
  const { join } = await import("path");
  const ipcDir = join(process.cwd(), ".termlings");

  try {
    // Only clear IPC state files (agent sessions, queue files, messages, state)
    // Keep .termlings/agent-name/, .termlings/agents/, .termlings/map/, .termlings/store/, etc.
    const entries = readdirSync(ipcDir);
    for (const entry of entries) {
      // Clear IPC files: *.queue.jsonl, *.msg.json, state.json, hook files
      // Don't clear persistent data directories
      if (entry.startsWith(".") ||
          ["agents", "map", "store", "objects"].includes(entry)) {
        continue;
      }
      if (entry.endsWith(".queue.jsonl") ||
          entry.endsWith(".msg.json") ||
          entry === "state.json" ||
          entry.endsWith(".hook.json")) {
        rmSync(join(ipcDir, entry), { force: true });
      }
    }
    console.log(`✓ Cleared agent sessions and IPC state`);
    console.log(`✓ Kept: saved agents and persistent data in .termlings/`);
  } catch (e) {
    console.error(`Failed to clear game state: ${e}`);
    process.exit(1);
  }
  process.exit(0);
}

// 1. Agent launcher: termlings <cli> [flags...]
// If there are local agents, show picker. Otherwise launch CLI directly.
let agentAdapter = _agentRegistry[positional[0] ?? ""];

if (agentAdapter) {
  const { discoverLocalAgents } = await import("./agents/discover.js");
  const localAgents = discoverLocalAgents();

  // If we have agents, show picker. Otherwise launch CLI directly.
  if (localAgents.length > 0) {
    const { selectLocalAgentWithRoom } = await import("./agents/discover.js");
    const selected = await selectLocalAgentWithRoom(localAgents);

    if (selected === "create-random") {
      // Generate random agent
      const { generateRandomDNA } = await import("./index.js");
      const randomDna = generateRandomDNA();
      const randomNames = ["Pixel", "Sprout", "Ember", "Nimbus", "Glitch", "Ziggy", "Quill", "Cosmo", "Maple", "Flint", "Wren", "Dusk", "Byte", "Fern", "Spark", "Nova", "Haze", "Basil", "Reef", "Orbit", "Sage", "Rusty", "Coral", "Luna", "Cinder", "Pip", "Storm", "Ivy", "Blaze", "Mochi"];
      const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];

      opts.name = opts.name || randomName;
      opts.dna = opts.dna || randomDna;

      const { launchAgent } = await import("./agents/launcher.js");
      await launchAgent(agentAdapter, agentPassthrough, opts);
    } else if (selected) {
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
  // IPC reads/writes go to the current project's .termlings directory

  const verb = positional[1];
  const helpText = `Usage: termlings action <command>

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
  cron list                  See your scheduled cron jobs
  cron show <id>             See cron job details
  task list                  See all project tasks
  task show <id>             See task details
  task claim <id>            Claim a task to work on
  task status <id> <status>  Update task (in-progress|completed|blocked)
  task note <id> <note>      Add a note to a task
  place <type> <x>,<y>       Place object at coordinates
  destroy <x>,<y>            Destroy an object`;

  if (!verb || verb === "--help" || verb === "-h") {
    console.error(helpText);
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
    const { readState } = await import("./engine/ipc.js");
    const { OBJECT_DEFS } = await import("./engine/objects.js");
    const { describeRelative } = await import("./engine/room-detect.js");
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    // Compute IPC_DIR based on room from environment
    const IPC_DIR = join(process.cwd(), ".termlings");

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

      // Load all objects from state (both map-defined and agent-built)
      const placements = state.objects || [];

      const objectLegend: { num: number; name: string; x: number; y: number }[] = [];
      let objNum = 1;
      for (const p of placements) {
        const def = OBJECT_DEFS[p.type];
        if (!def) continue;
        const objW = def.width;
        const objH = def.height;
        const vx0 = p.x - x0;
        const vy0 = p.y - y0;
        if (vx0 + objW <= 0 || vx0 >= viewW || vy0 + objH <= 0 || vy0 >= viewH) continue;

        const bracketedName = `[${p.type}]`;
        const bracketedNum = `[${objNum}]`;
        let label: string;
        if (objW >= bracketedName.length) {
          label = bracketedName;
        } else if (objW >= bracketedNum.length) {
          label = bracketedNum;
          objectLegend.push({ num: objNum, name: p.type, x: p.x, y: p.y });
        } else {
          label = `${objNum}`;
          objectLegend.push({ num: objNum, name: p.type, x: p.x, y: p.y });
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

    // Objects section — show both map-defined and agent-built objects from state
    if (state.objects && state.objects.length > 0) {
      console.log();
      console.log("Objects:");
      for (const o of state.objects) {
        const oRoom = findRoom(o.x, o.y);
        const roomLabel = oRoom ? `room${oRoom.id}` : "outdoors";
        // Show object with room indicator
        const roomInfo = o.roomId !== undefined ? ` [room${o.roomId}]` : "";
        const occupancy = o.occupants && o.occupants.length > 0 ? ` — ${o.occupants.length} agent(s)` : "";
        console.log(`  ${o.type.padEnd(16)} (${o.x},${o.y})  ${roomLabel}${roomInfo}${occupancy}`);
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


  if (verb === "place") {
    const { readState: readStatePlace, writeCommand } = await import("./engine/ipc.js");
    const { OBJECT_DEFS, renderObjectToTerminal } = await import("./engine/objects.js");
    const { loadCustomObjects } = await import("./engine/custom-objects.js");
    const _statePlace = readStatePlace();
    const customObjects = loadCustomObjects("default");
    if (_statePlace?.map?.mode === "simple") {
      console.error("Error: place is disabled in simple mode");
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
      console.error("Usage: termlings action place <objectType> <x>,<y>");
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

    // Handle --preview flag
    if (flags.has("preview")) {
      const color = opts.color
        ? opts.color.split(",").map((c: string) => parseInt(c.trim(), 10)) as [number, number, number]
        : undefined;

      // Check both built-in and custom objects
      const allDefs = { ...OBJECT_DEFS, ...customObjects };
      if (!allDefs[objectType]) {
        console.error(`Unknown object type: ${objectType}`);
        console.error(`Use 'termlings action list-objects' to see available types`);
        process.exit(1);
      }

      const colorLabel = color ? ` [color: rgb(${color.join(", ")})]` : "";
      const coordLabel = x !== undefined ? ` at (${x}, ${y})` : "";
      console.log(`\nPreview: ${objectType}${colorLabel}${coordLabel}\n`);
      console.log(renderObjectToTerminal(objectType, color, allDefs));
      console.log();
      console.log(`To place this object, run:`);
      const colorOpt = color ? ` --color "${color.join(",")}"` : "";
      const coordStr = x !== undefined ? ` ${x},${y}` : "";
      console.log(`  termlings action place ${objectType}${coordStr}${colorOpt}`);
      console.log();
      process.exit(0);
    }

    // If coordinates provided, walk nearby first, then place
    if (x !== undefined && y !== undefined) {
      // Walk to a nearby location (above the placement) so agent can reach it
      const walkX = x;
      const walkY = Math.max(0, y - 5); // Walk 5 cells above placement location
      writeCommand(sessionId, { action: "walk", x: walkX, y: walkY, name: _agentName, dna: _agentDna, ts: Date.now() });
      // Queue the place command to follow after walking
      writeCommand(sessionId, { action: "place", objectType, x, y, name: _agentName, dna: _agentDna, ts: Date.now() + 1 });
      console.log(`Walk queued to (${walkX},${walkY}) near (${x},${y}), then place ${objectType}`);
    } else {
      // No coordinates: place at current location
      writeCommand(sessionId, { action: "place", objectType, name: _agentName, dna: _agentDna, ts: Date.now() });
      console.log(`Place command sent: ${objectType}`);
    }
    process.exit(0);
  }

  // Inspect existing object JSON
  if (verb === "inspect-object") {
    const { OBJECT_DEFS } = await import("./engine/objects.js");
    const { loadCustomObjects } = await import("./engine/custom-objects.js");
    const objectType = positional[2];
    if (!objectType) {
      console.error("Usage: termlings action inspect-object <type>");
      process.exit(1);
    }

    // Check both built-in and custom objects
    const customObjects = loadCustomObjects("default");
    const allObjects = { ...OBJECT_DEFS, ...customObjects };
    const def = allObjects[objectType];
    if (!def) {
      console.error(`Unknown object type: ${objectType}`);
      console.error(`Available types: ${Object.keys(allObjects).join(", ")}`);
      process.exit(1);
    }

    // Format for display
    const cellsForDisplay = def.cells.map(row =>
      row.map(cell =>
        cell === null ? null : {
          ch: cell.ch,
          fg: cell.fg,
          bg: cell.bg,
          walkable: cell.walkable
        }
      )
    );

    const output = {
      name: def.name,
      width: def.width,
      height: def.height,
      cells: cellsForDisplay
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }

  // Create custom object
  if (verb === "create-object") {
    const { createCustomObject } = await import("./engine/custom-objects.js");
    const objectName = positional[2];
    const jsonString = positional[3];

    if (!objectName || !jsonString) {
      console.error("Usage: termlings action create-object <name> <json-definition>");
      console.error("Example: termlings action create-object my-bench '{\"width\": 5, \"height\": 2, \"cells\": ...}'");
      process.exit(1);
    }

    let definition: unknown;
    try {
      definition = JSON.parse(jsonString);
    } catch (e) {
      console.error(`Invalid JSON: ${e}`);
      process.exit(1);
    }

    const result = createCustomObject(objectName, definition, "default");
    if (!result.success) {
      console.error(`Error creating object: ${result.error}`);
      process.exit(1);
    }

    console.log(`✓ Created custom object: ${objectName}`);
    console.log(`You can now use: termlings action place ${objectName} <x>,<y>`);
    process.exit(0);
  }

  // List all objects (built-in and custom)
  if (verb === "list-objects") {
    const { loadCustomObjects } = await import("./engine/custom-objects.js");
    const customObjects = loadCustomObjects("default");

    if (Object.keys(customObjects).length > 0) {
      console.log("\n✨ Custom Objects:\n");
      for (const [name, def] of Object.entries(customObjects)) {
        console.log(`  • ${name.padEnd(15)} (${def.width}×${def.height})`);
      }
      console.log();
    } else {
      console.log("\nNo objects yet. Agents can create custom objects with:");
      console.log("  termlings action create-object <name> '<json>'");
      console.log();
    }

    process.exit(0);
  }

  if (verb === "cron") {
    const { getAgentCrons, getCron, formatCron, formatCronList } = await import("./engine/cron.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;

    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }

    const subcommand = positional[2];
    const cronId = positional[3];

    if (subcommand === "list") {
      const crons = getAgentCrons(sessionId);
      if (crons.length === 0) {
        console.log("No scheduled cron jobs for you");
      } else {
        const lines: string[] = [];
        lines.push(`⏰ Your Scheduled Jobs (${crons.length}):`);
        lines.push("");
        for (const cron of crons) {
          const status = cron.enabled ? "✓" : "✗";
          const nextDate = cron.nextRun ? new Date(cron.nextRun).toLocaleString() : "unknown";
          const msg = cron.message.substring(0, 50) + (cron.message.length > 50 ? "..." : "");
          lines.push(`${status} [${cron.id}] ${msg}`);
          lines.push(`   Next: ${nextDate}`);
        }
        lines.push("");
        lines.push("Use: termlings action cron show <id> - See full details");
        console.log(lines.join("\n"));
      }
      process.exit(0);
    }

    if (subcommand === "show") {
      if (!cronId) {
        console.error("Usage: termlings action cron show <cron-id>");
        process.exit(1);
      }
      const cron = getCron(cronId);
      if (!cron) {
        console.error(`Cron not found: ${cronId}`);
        process.exit(1);
      }
      console.log(formatCron(cron));
      process.exit(0);
    }

    console.error("Usage: termlings action cron <list|show>");
    process.exit(1);
  }

  if (verb === "task") {
    const { getTask, getAllTasks, claimTask, updateTaskStatus, addTaskNote, formatTask, formatAgentTaskList } = await import("./engine/tasks.js");
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent";

    if (!sessionId) {
      console.error("Error: TERMLINGS_SESSION_ID env var not set");
      process.exit(1);
    }

    const subcommand = positional[2];
    const taskId = positional[3];

    if (subcommand === "list") {
      const tasks = getAllTasks();
      console.log(formatAgentTaskList(tasks, sessionId));
      process.exit(0);
    }

    if (subcommand === "show") {
      if (!taskId) {
        console.error("Usage: termlings action task show <task-id>");
        process.exit(1);
      }
      const task = getTask(taskId);
      if (!task) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
      console.log(formatTask(task));
      process.exit(0);
    }

    if (subcommand === "claim") {
      if (!taskId) {
        console.error("Usage: termlings action task claim <task-id>");
        process.exit(1);
      }
      const task = claimTask(taskId, sessionId, agentName, "default");
      if (!task) {
        console.error(`Cannot claim task: ${taskId} (not found or already claimed)`);
        process.exit(1);
      }
      console.log(`✓ Task claimed: ${task.title}`);
      process.exit(0);
    }

    if (subcommand === "status") {
      const newStatus = positional[4];
      const note = positional.slice(5).join(" ");
      if (!taskId || !newStatus) {
        console.error("Usage: termlings action task status <task-id> <open|claimed|in-progress|completed|blocked> [note]");
        process.exit(1);
      }
      const task = updateTaskStatus(taskId, newStatus as any, sessionId, agentName, note || undefined, "default");
      if (!task) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
      console.log(`✓ Status updated: ${newStatus}`);
      process.exit(0);
    }

    if (subcommand === "note") {
      const text = positional.slice(4).join(" ");
      if (!taskId || !text) {
        console.error("Usage: termlings action task note <task-id> <note...>");
        process.exit(1);
      }
      const task = addTaskNote(taskId, text, sessionId, agentName, "default");
      if (!task) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
      console.log(`✓ Note added`);
      process.exit(0);
    }

    console.error("Usage: termlings action task <list|show|claim|status|note>");
    process.exit(1);
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

// 2a. Owner cron management: termlings cron <create|list|show|edit|delete|enable|disable>
if (positional[0] === "cron") {
  const { createCronJob, getAllCrons, getAgentCrons, getCron, updateCron, deleteCron, toggleCron, formatCron, formatCronList, formatSchedule } = await import("./engine/cron.js");

  const subcommand = positional[1];

  if (subcommand === "create") {
    const agentId = positional[2];
    const schedule = positional[3];
    const message = positional.slice(4).join(" ");

    if (!agentId || !schedule || !message) {
      console.error("Usage: termlings cron create <agent-id> <schedule> <message...>");
      console.error("Examples:");
      console.error("  termlings cron create tl-alice hourly \"Check for new data\"");
      console.error("  termlings cron create tl-bob \"0 9 * * *\" \"Good morning, process today's files\"");
      console.error("  termlings cron create tl-carol \"daily@14:30\" \"Run validation tests\"");
      process.exit(1);
    }

    // Get agent name from session if available
    const agentName = positional[2] || "Unknown";
    const cron = createCronJob(agentId, agentName, schedule, message, "default");

    console.log(`✓ Cron job created: ${cron.id}`);
    console.log(`Schedule: ${formatSchedule(cron.schedule)}`);
    console.log(`Agent: ${agentName}`);
    console.log(`Message: "${message}"`);
    process.exit(0);
  }

  if (subcommand === "list") {
    const agentId = positional[2] === "--agent" ? positional[3] : null;
    const crons = agentId ? getAgentCrons(agentId) : getAllCrons();

    console.log(formatCronList(crons));
    process.exit(0);
  }

  if (subcommand === "show") {
    const cronId = positional[2];
    if (!cronId) {
      console.error("Usage: termlings cron show <cron-id>");
      process.exit(1);
    }

    const cron = getCron(cronId, "default");
    if (!cron) {
      console.error(`Cron not found: ${cronId}`);
      process.exit(1);
    }

    console.log(formatCron(cron));
    process.exit(0);
  }

  if (subcommand === "edit") {
    const cronId = positional[2];
    if (!cronId) {
      console.error("Usage: termlings cron edit <cron-id> [--schedule SCHED] [--message MSG]");
      process.exit(1);
    }

    const updates: any = {};
    for (let i = 3; i < positional.length; i += 2) {
      if (positional[i] === "--schedule") {
        updates.schedule = positional[i + 1];
      } else if (positional[i] === "--message") {
        updates.message = positional.slice(i + 1).join(" ");
        break;
      }
    }

    const cron = updateCron(cronId, updates);
    if (!cron) {
      console.error(`Cron not found: ${cronId}`);
      process.exit(1);
    }

    console.log(`✓ Cron job updated`);
    console.log(formatCron(cron));
    process.exit(0);
  }

  if (subcommand === "delete") {
    const cronId = positional[2];
    if (!cronId) {
      console.error("Usage: termlings cron delete <cron-id>");
      process.exit(1);
    }

    if (deleteCron(cronId)) {
      console.log(`✓ Cron job deleted`);
    } else {
      console.error(`Cron not found: ${cronId}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (subcommand === "enable") {
    const cronId = positional[2];
    if (!cronId) {
      console.error("Usage: termlings cron enable <cron-id>");
      process.exit(1);
    }

    const cron = toggleCron(cronId, true);
    if (!cron) {
      console.error(`Cron not found: ${cronId}`);
      process.exit(1);
    }

    console.log(`✓ Cron job enabled`);
    process.exit(0);
  }

  if (subcommand === "disable") {
    const cronId = positional[2];
    if (!cronId) {
      console.error("Usage: termlings cron disable <cron-id>");
      process.exit(1);
    }

    const cron = toggleCron(cronId, false);
    if (!cron) {
      console.error(`Cron not found: ${cronId}`);
      process.exit(1);
    }

    console.log(`✓ Cron job disabled`);
    process.exit(0);
  }

  console.error("Usage: termlings cron <create|list|show|edit|delete|enable|disable>");
  process.exit(1);
}

// 2b. Owner task management: termlings task <create|list|show|assign|delete>
if (positional[0] === "task") {
  const { createTask, getAllTasks, getTask, assignTask, deleteTask, formatTask, formatTaskList } = await import("./engine/tasks.js");

  const subcommand = positional[1];

  if (subcommand === "create") {
    const title = positional[2];
    const description = positional[3];
    const priority = (positional[4] || "medium") as any;

    if (!title || !description) {
      console.error("Usage: termlings task create <title> <description> [priority]");
      console.error("Priority: low, medium (default), high");
      process.exit(1);
    }

    const task = createTask(title, description, priority, undefined, "default");
    console.log(`✓ Task created: ${task.id}`);
    console.log(formatTask(task));
    process.exit(0);
  }

  if (subcommand === "list") {
    const tasks = getAllTasks();
    console.log(formatTaskList(tasks));
    process.exit(0);
  }

  if (subcommand === "show") {
    const taskId = positional[2];
    if (!taskId) {
      console.error("Usage: termlings task show <task-id>");
      process.exit(1);
    }
    const task = getTask(taskId);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(formatTask(task));
    process.exit(0);
  }

  if (subcommand === "assign") {
    const taskId = positional[2];
    const agentId = positional[3];
    const agentName = positional[4];

    if (!taskId || !agentId || !agentName) {
      console.error("Usage: termlings task assign <task-id> <agent-id> <agent-name>");
      process.exit(1);
    }

    const task = assignTask(taskId, agentId, agentName, "default");
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(`✓ Task assigned to ${agentName}`);
    process.exit(0);
  }

  if (subcommand === "delete") {
    const taskId = positional[2];
    if (!taskId) {
      console.error("Usage: termlings task delete <task-id>");
      process.exit(1);
    }
    if (deleteTask(taskId, "default")) {
      console.log(`✓ Task deleted`);
    } else {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error("Usage: termlings task <create|list|show|assign|delete>");
  process.exit(1);
}

// 2b-scheduler. Run cron scheduler: termlings scheduler [--daemon]
if (positional[0] === "scheduler") {
  const { executeScheduledCrons, formatExecutionResults, startScheduler } = await import("./engine/cron-scheduler.js");

  if (flags.has("daemon")) {
    // Run as background daemon (keeps running)
    console.log("⏰ Starting cron scheduler daemon (press Ctrl+C to stop)");
    const interval = startScheduler("default", 60); // Check every 60 seconds

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n⏰ Stopping cron scheduler");
      clearInterval(interval);
      process.exit(0);
    });
  } else {
    // Single check
    const results = executeScheduledCrons("default");
    if (results.length > 0) {
      console.log(formatExecutionResults(results));
    } else {
      console.log("No cron jobs to execute");
    }
    process.exit(0);
  }
}

// 3. Render subcommand: termlings render [avatar|object] [dna|name|type] [options]
if (positional[0] === "render") {
  const { OBJECT_DEFS, renderObjectToTerminal } = await import("./engine/objects.js");

  // Check if rendering object or avatar
  let renderType = positional[1] === "object" ? "object" : "avatar";
  let renderInput = renderType === "object" ? positional[2] : positional[1];

  // Handle object rendering
  if (renderType === "object") {
    if (flags.has("list")) {
      const { loadCustomObjects } = await import("./engine/custom-objects.js");
      const customObjects = loadCustomObjects("default");
      const allObjects = { ...OBJECT_DEFS, ...customObjects };

      console.log("\nAvailable object types:\n");
      if (Object.keys(allObjects).length === 0) {
        console.log("No objects yet. Create custom objects with:");
        console.log("  termlings action create-object <name> '<json>'");
      } else {
        for (const [name, def] of Object.entries(allObjects)) {
          console.log(`  • ${name.padEnd(15)} (${def.width}×${def.height})`);
        }
      }
      console.log();
      process.exit(0);
    }

    const objectType = renderInput;
    const color = opts.color
      ? opts.color.split(",").map((c: string) => parseInt(c.trim(), 10)) as [number, number, number]
      : undefined;

    const { loadCustomObjects } = await import("./engine/custom-objects.js");
    const customObjects = loadCustomObjects("default");
    const allObjects = { ...OBJECT_DEFS, ...customObjects };

    if (!allObjects[objectType]) {
      console.error(`Unknown object type: ${objectType}`);
      const available = Object.keys(allObjects);
      if (available.length > 0) {
        console.error(`Available types: ${available.join(", ")}`);
      }
      process.exit(1);
    }

    const debugCollision = flags.has("debug-collision");
    const debugLabel = debugCollision ? " [collision debug]" : "";
    console.log(`\n${objectType}${color ? ` [color: rgb(${color.join(", ")})]` : ""}${debugLabel}\n`);

    if (debugCollision) {
      console.log("Collision legend:");
      console.log("  · = transparent");
      console.log("  █ = blocking");
      console.log("  ░ = walkable");
      console.log();
    }

    console.log(renderObjectToTerminal(objectType, color, allObjects, debugCollision));
    console.log();
    process.exit(0);
  }

  // Avatar rendering (existing code)
  input = renderInput;

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

// 4. Create agent scaffold: termlings create [folder]
if (positional[0] === "create") {
  const { runCreate } = await import("./create.js");
  await runCreate();
  process.exit(0);
}

// 5. List agents: termlings list-agents [--saved|--online|--full]
if (positional[0] === "list-agents") {
  const { discoverLocalAgents } = await import("./agents/discover.js");
  const { readState } = await import("./engine/ipc.js");
  const { mergeSavedWithOnline, formatAgentListCompact, formatAgentListFull } = await import("./engine/agent-listing.js");

  const saved = discoverLocalAgents();
  const state = readState();
  const online = state?.entities || [];

  const merged = mergeSavedWithOnline(saved, online);

  const isFull = flags.has("full");
  const filterSaved = flags.has("saved");
  const filterOnline = flags.has("online");

  const output = isFull
    ? formatAgentListFull(merged, { filterSaved, filterOnline })
    : formatAgentListCompact(merged, { filterSaved, filterOnline });

  console.log(output);
  process.exit(0);
}

// 6. Help
if (flags.has("help") || flags.has("h")) {
  console.log(`Usage: termlings [options]
       termlings render [dna|name] [options]
       termlings <agent> [options]

Sim (default):
  termlings                Start the sim
  termlings --simple       Start in simple mode (no map, agent grid)

Game management:
  --clear                  Clear game state (all agents, objects)

Scheduler:
  scheduler                Run cron scheduler (check for due jobs)
  scheduler --daemon       Run scheduler in background (checks every 60 seconds)

Spectator (owner commands):
  cron create <agent-id> <schedule> <msg>  Schedule a message to an agent
  cron list [--agent <id>] List scheduled cron jobs
  cron show <id>           Show cron job details
  cron edit <id> --schedule ... --message ...  Edit a cron job
  cron delete <id>         Delete a cron job
  cron enable <id>         Enable a disabled cron job
  cron disable <id>        Disable a cron job
  task create <title> <description> [priority]  Create a new task
  task list                List all project tasks
  task show <id>           Show task details and updates
  task assign <id> <session-id> <name>  Assign task to an agent
  task delete <id>         Delete a task

Agents (shared task system):
  claude [flags...]        Start Claude Code as an agent
  codex [flags...]         Start Codex CLI as an agent
  pi [flags...]            Start Pi coding agent
  <name> [flags...]        Launch saved agent (e.g., "termlings my-agent")
  --name <name>            Agent display name
  --dna <hex>              Agent avatar DNA
  --with <cli> <name>      Use different CLI for saved agent

Create:
  create [folder]          Interactive avatar builder for new agent
  create --name <name>     Create with specific name
  create --dna <hex>       Create with specific DNA

List agents:
  list-agents              List all agents (saved + online)
  list-agents --saved      Show only saved agents
  list-agents --online     Show only online agents
  list-agents --full       Show detailed information

Render:
  render [dna|name]                          Render a termling in the terminal
  render object <type>                       Render an object
  render object <type> --color R,G,B         Render object with custom color
  render object <type> --debug-collision     Show collision boundaries
  render --svg                               Output SVG
  render --mp4                               Export animated MP4
  render --walk/--talk/--wave                Animate
  render --compact                           Half-height
  render --info                              Show DNA traits
  render --bw                                Black & white
  render --random                            Random termling
  render --animated                          SVG with CSS animation
  render --size=<px>                         SVG pixel size (default: 10)
  render --bg=<color>                        SVG background (hex or "none")
  render --padding=<n>                       SVG padding in pixels (default: 1)
  render --out=<file>                        MP4 output path (default: termling.mp4)
  render object --list                       List all object types
  render --fps=<n>         MP4 frame rate (default: 4)
  render --duration=<n>    MP4 duration in seconds (default: 3)

Actions (in-game):
  action walk <x>,<y>      Walk avatar to coordinates
  action map [--ascii|--sessions]  See the world
  action send <id> <msg>   Direct message to agent
  action chat <msg>        Post to shared chat
  action place <type> <x>,<y>                Place object at coordinates
  action place <type> <x>,<y> --preview      Preview object before placing
  action place <type> <x>,<y> --color R,G,B  Place with custom color
  action inspect-object <type>                Show object JSON (for inspiration)
  action create-object <name> '<json>'        Create custom object from JSON
  action list-objects                         List all objects (built-in + custom)
  action destroy <x>,<y>                      Remove object
  action talk              Toggle talk animation
  action gesture --wave    Wave gesture
  action stop              Stop current action

Options:
  --help, -h               Show this help`);
  process.exit(0);
}

// 7. Default: launch sim
//    termlings              → start sim (shows title screen first)
//    termlings play [path]  → backward compat for play subcommand
//    termlings --play       → backward compat for --play flag
{
  // Check if .termlings exists, if not offer to initialize
  const { join } = await import("path");
  const { existsSync } = await import("fs");
  const { createInterface } = await import("readline");

  const termlingsDir = join(process.cwd(), ".termlings");
  if (!existsSync(termlingsDir)) {
    const cyan = "\x1b[36m";
    const yellow = "\x1b[33m";
    const reset = "\x1b[0m";

    console.log(`\n${yellow}✦ Welcome to termlings!${reset}\n`);
    console.log("This project doesn't have a .termlings directory yet.");
    console.log("Let's set up your first agent.\n");

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const confirmed = await new Promise<boolean>((resolve) => {
      rl.question("Create .termlings and initialize first agent? (y/n) ", (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y");
      });
    });

    if (!confirmed) {
      console.log("\nRun 'termlings --help' to see all commands.");
      process.exit(0);
    }

    // Show fancy logo with termfont
    const { composeText, applyPadding } = await import("termfont");

    console.log();
    console.log(`${yellow}    ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦${reset}`);
    console.log();

    try {
      const logoText = composeText("termlings", 3, [100, 150, 255]);
      const paddedLogo = applyPadding(logoText, 2, 1);
      console.log(paddedLogo);
    } catch {
      // Fallback to simple text if termfont fails
      console.log(`${cyan}termlings${reset}`);
    }

    console.log(`${yellow}         Build autonomous AI agents & teams${reset}`);
    console.log();
    console.log(`${yellow}    ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧ ✦${reset}`);
    console.log();

    // Ask whether to create single agent or team
    const { selectMenu } = await import("./interactive-menu.js");
    const setupChoice = await selectMenu(
      [
        { label: "Single Agent", value: "single", description: "Create one agent to start" },
        { label: "5-Person Team", value: "team", description: "Create a full SaaS Strike Team (CEO, CTO, CMO, CRO, COO)" },
      ],
      "How would you like to set up your project?"
    );

    const useTeam = setupChoice === "team";

    // Load template (default to office)
    const templateName = opts.template || "office";
    const templatePath = join(__dirname, "..", "..", "templates", templateName);

    // Copy template directory if it exists
    const { mkdirSync, copyFileSync, readdirSync } = await import("fs");
    const { cp } = await import("fs/promises");

    if (existsSync(templatePath)) {
      // Copy entire template to .termlings/
      try {
        await cp(templatePath, termlingsDir, { recursive: true });
        console.log(`✓ Loaded template: ${templateName}`);
      } catch (e) {
        console.error(`Failed to copy template: ${e}`);
        // Continue anyway - create empty structure below
      }
    } else {
      // Fallback: create empty structure
      mkdirSync(termlingsDir, { recursive: true });
      mkdirSync(join(termlingsDir, "map"), { recursive: true });
      mkdirSync(join(termlingsDir, "agents"), { recursive: true });
      mkdirSync(join(termlingsDir, "store"), { recursive: true });
      mkdirSync(join(termlingsDir, "objects"), { recursive: true });
    }

    // Use create command to set up agents
    const { generateRandomDNA, encodeDNA, traitsFromName } = await import("./index.js");
    const { writeFileSync } = await import("fs");

    if (useTeam) {
      // Create 5-person leadership team
      console.log("\n👥 Creating 5-person SaaS Strike Team...\n");

      const { getTeamRolesInOrder, generateTeamMemberSoul, getRandomTeamMemberName } =
        await import("./team-roles.js");

      const roles = getTeamRolesInOrder();
      const usedNames = new Set<string>();
      const createdAgents: string[] = [];

      for (const role of roles) {
        const randomName = getRandomTeamMemberName(usedNames);
        usedNames.add(randomName);
        const dna = generateRandomDNA();

        // Create agent directory
        const agentDir = join(termlingsDir, randomName.toLowerCase());
        mkdirSync(agentDir, { recursive: true });

        // Generate SOUL.md with team role context
        const soulContent = generateTeamMemberSoul(randomName, dna, role);
        writeFileSync(join(agentDir, "SOUL.md"), soulContent);

        createdAgents.push(randomName);
        console.log(`  ✓ ${randomName.padEnd(15)} (${role.title})`);
      }

      console.log(`\n✓ Created team: ${createdAgents.join(", ")}`);
      console.log(`✓ Initialized project structure in .termlings/`);
      console.log(`\n🚀 Ready to go! Run 'termlings' to start the sim.\n`);
    } else {
      // Single agent setup
      console.log("🎨 Creating your first agent...\n");

      const rl3 = createInterface({ input: process.stdin, output: process.stdout });

      const agentName = await new Promise<string>((resolve) => {
        rl3.question("Agent name (or Enter for random): ", (answer) => {
          rl3.close();
          resolve(answer.trim() || "");
        });
      });

      const randomNames = [
        "Pixel",
        "Sprout",
        "Ember",
        "Nimbus",
        "Glitch",
        "Ziggy",
        "Quill",
        "Cosmo",
        "Maple",
        "Flint",
        "Wren",
        "Dusk",
        "Byte",
        "Fern",
        "Spark",
        "Nova",
        "Haze",
        "Basil",
        "Reef",
        "Orbit",
        "Sage",
        "Rusty",
        "Coral",
        "Luna",
        "Cinder",
        "Pip",
        "Storm",
        "Ivy",
        "Blaze",
        "Mochi",
      ];

      const finalName = agentName || randomNames[Math.floor(Math.random() * randomNames.length)]!;
      const dna = agentName ? encodeDNA(traitsFromName(agentName)) : generateRandomDNA();

      // Create agent directory (agents live at .termlings/agent-name/)
      const agentDir = join(termlingsDir, finalName.toLowerCase());
      mkdirSync(agentDir, { recursive: true });

      // Write SOUL.md
      const soulContent = `# ${finalName}

**DNA**: ${dna}
**Purpose**: Autonomous agent

---

This agent will join the termlings world and work together with other agents.
`;
      writeFileSync(join(agentDir, "SOUL.md"), soulContent);

      console.log(`✓ Created agent "${finalName}" in .termlings/${finalName.toLowerCase()}/`);
      console.log(`✓ Initialized project structure in .termlings/`);
      console.log(`\n🚀 Ready to go! Run 'termlings' to start the sim.\n`);
    }

    process.exit(0);
  }

  const { showTitleScreen, roomHasAgents } = await import("./title.js");
  if (!roomHasAgents("default")) {
    await showTitleScreen("default");
  }

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
