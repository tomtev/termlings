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

// Check if first arg is an agent name — if so, pass everything after it through raw
const { agents: _agentRegistry } = await import("./agents/index.js");
if (args[0] && _agentRegistry[args[0]]) {
  positional.push(args[0]);
  agentPassthrough = args.slice(1);

  // Still parse --name and --dna for the launcher (strip them from passthrough)
  const filtered: string[] = [];
  for (let i = 0; i < agentPassthrough.length; i++) {
    const a = agentPassthrough[i]!;
    if (a.startsWith("--name=")) {
      opts.name = a.slice(7);
    } else if (a.startsWith("--dna=")) {
      opts.dna = a.slice(6);
    } else {
      filtered.push(a);
    }
  }
  agentPassthrough = filtered;
} else {
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        opts[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        flags.add(arg.slice(2, eqIdx));
      } else {
        flags.add(arg.slice(2));
      }
    } else if (arg === "-h") {
      flags.add("help");
    } else {
      positional.push(arg);
      if (!input) input = arg;
    }
  }
}

// Support "play" as a subcommand: termlings play [./path]
if (positional[0] === "play") {
  flags.add("play");
}

// Support "join" as a subcommand: termlings join <ws-url>
if (positional[0] === "join") {
  flags.add("join");
}

// Support "create" as a subcommand: termlings create [folder] --name "X" --owner "Y" --purpose "Z"
if (positional[0] === "create") {
  flags.add("create");
}

// --- Agent launcher: termlings <agent> (claude, codex, etc.) ---

const agentAdapter = _agentRegistry[positional[0] ?? ""];

if (agentAdapter) {
  const { launchAgent } = await import("./agents/launcher.js");
  await launchAgent(agentAdapter, agentPassthrough, opts);
}

// --- Agent IPC subcommands: termlings action <verb> ---

if (positional[0] === "action") {
  const verb = positional[1];

  if (!verb) {
    console.error(`Usage: termlings action <command>

Commands:
  walk <x>,<y>                Walk avatar to coordinates
  talk                       Toggle talk animation
  gesture --wave             Wave gesture
  stop                       Stop current action
  map                        Show ASCII map with entity positions
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
    const { writeCommand } = await import("./engine/ipc.js");
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
    const state = readState();
    if (!state) {
      console.error("No sim state found. Is termlings --play running?");
      process.exit(1);
    }
    const { width, height, name, tiles } = state.map;
    const mySessionId = process.env.TERMLINGS_SESSION_ID;

    // Tile → ASCII character mapping
    const tileChar: Record<string, string> = {
      " ": " ", ".": "·", ",": ",", "#": "#", "B": "#", "W": "#", "G": "#",
      "T": "T", "~": "~", "D": ":", "e": ".", "p": ".", "n": ".", "h": ".",
      "*": "*", "f": "*", "c": "*", "r": "*", "v": "*", "o": "*", "w": "*",
      "P": ".", "S": ".",
    };

    // Find "me" for centering the local view
    const me = state.entities.find(e => e.sessionId === mySessionId);
    const centerX = me ? me.x : (state.entities[0]?.x ?? Math.floor(width / 2));
    const centerY = me ? me.footY : (state.entities[0]?.footY ?? Math.floor(height / 2));

    // Local view: 1:1 scale, 70 wide x 30 tall centered on caller
    const viewW = 70;
    const viewH = 30;
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

    // Place entities
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i]!;
      const gx = e.x - x0;
      const gy = e.footY - y0;
      if (gx >= 0 && gx < viewW && gy >= 0 && gy < viewH) {
        if (e.sessionId === mySessionId) {
          grid[gy]![gx] = "*";
        } else if (e.sessionId === "player") {
          grid[gy]![gx] = "@";
        } else {
          grid[gy]![gx] = String(i % 10);
        }
      }
    }

    for (const row of grid) {
      console.log(row.join(""));
    }

    // Entity list
    console.log();
    console.log("Agents:");
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i]!;
      const status = e.idle ? "idle" : "active";
      let marker: string;
      if (e.sessionId === mySessionId) {
        marker = "*";
      } else if (e.sessionId === "player") {
        marker = "@";
      } else {
        marker = String(i % 10);
      }
      console.log(`  ${marker}  ${(e.name || "???").padEnd(14)} ${e.sessionId.padEnd(16)} (${e.x}, ${e.footY}) [${status}]`);
    }

    console.log();
    console.log("Legend: @ = player  * = you  0-9 = agents");
    console.log("        # = wall  T = tree  ~ = water  , = grass  · = path  : = door");
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
    const { writeCommand } = await import("./engine/ipc.js");
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
    const { writeCommand } = await import("./engine/ipc.js");
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

if (flags.has("help") || flags.has("h")) {
  console.log(`Usage: termlings [dna-or-name] [options]

Render a termling in your terminal.

Arguments:
  <dna>       7-char hex DNA string (e.g. 0a3f201)
  <name>      Any string — generates deterministic avatar

Options:
  --walk           Animate walking
  --talk           Animate talking
  --wave           Animate waving
  --compact        Half-height rendering
  --bw             Black & white (shade characters, no colors)
  --random         Generate a random termling
  --svg            Output SVG to stdout
  --size=<px>      SVG pixel size (default: 10)
  --bg=<color>     SVG background (hex or "none", default: none)
  --padding=<n>    SVG padding in pixels (default: 1)
  --animated       SVG with CSS animation (use with --walk, --talk, --wave)
  --mp4            Export animated MP4 (requires ffmpeg)
  --out=<file>     Output file path for --mp4 (default: termling.mp4)
  --fps=<n>        MP4 frame rate (default: 4)
  --duration=<n>   MP4 duration in seconds (default: 3)
  --play           Launch interactive sim mode
  play <path>      Play a custom map directory (with map.txt)
  create [folder]  Scaffold a new agent
  join <ws-url>    Join a multiplayer server
  --info           Show DNA traits info
  --help           Show this help

Create options:
  --name <name>    Agent name
  --owner <name>   Owner name
  --purpose <text> Agent purpose

Agent launchers (flags after agent name are passed through):
  claude [flags...]            Start Claude Code as an agent
  codex [flags...]             Start Codex CLI as an agent
  Termlings options (parsed before passthrough):
    --name=<name>              Agent display name
    --dna=<hex>                Agent avatar DNA

Agent actions (used by agents inside a session):
  action walk <x>,<y>          Walk avatar to coordinates
  action talk                  Toggle talk animation
  action gesture --wave        Wave gesture
  action stop                  Stop current action
  action map                   Show ASCII map with entities
  action chat <message>        Post to sim chat log (visible to owner)
  action send <id> <message>   Direct message to a specific agent
  action inbox                 Read messages from other agents
  action build <type> <x>,<y>  Build an object at coordinates
  action destroy <x>,<y>       Destroy an agent-built object`);
  process.exit(0);
}

if (flags.has("create")) {
  const { runCreate } = await import("./create.js");
  await runCreate();
}

if (flags.has("join")) {
  // Join a multiplayer server: termlings join ws://localhost:8787/ws/room/test?name=Tommy&dna=0a3f201
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

if (flags.has("play")) {
  // Pass map path to sim module via env var
  // "play ./my-map/" → positional[1] is the path
  const mapArg = positional[0] === "play" ? positional[1] : null;
  process.env.TERMLINGS_MAP_PATH = mapArg ?? "";
  await import("./sim.js");
  await new Promise(() => {});
}

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
  ? renderSmallFromGrid(firstGrid)
  : renderFromGrid(firstGrid);
const lineCount = firstOutput.split("\n").length;
process.stdout.write(firstOutput + "\n");

setInterval(() => {
  tick++;

  if (flags.has("walk")) walkFrame = tick % legFrameCount;
  if (flags.has("talk")) talkFrame = tick % 2;
  if (flags.has("wave")) waveFrame = (tick % 2) + 1;

  const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);
  const output = compact
    ? renderSmallFromGrid(grid)
    : renderFromGrid(grid);

  // Move cursor up to overwrite previous frame
  process.stdout.write(`\x1b[${lineCount}A`);
  process.stdout.write(output + "\n");
}, 300);

function renderFromGrid(grid: Pixel[][]): string {
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

function renderSmallFromGrid(grid: Pixel[][]): string {
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


