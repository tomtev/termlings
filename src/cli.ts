#!/usr/bin/env node
import {
  renderTerminal,
  renderTerminalSmall,
  renderSVG,
  renderLayeredSVG,
  getAvatarCSS,
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
  } else if (!input) {
    input = arg;
  }
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
  --random         Generate a random termling
  --svg            Output SVG to stdout
  --size=<px>      SVG pixel size (default: 10)
  --bg=<color>     SVG background (hex or "none", default: none)
  --padding=<n>    SVG padding in pixels (default: 1)
  --animated       SVG with CSS animation (use with --walk, --talk, --wave)
  --info           Show DNA traits info
  --help           Show this help`);
  process.exit(0);
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
    const { svg, legFrames } = renderLayeredSVG(dna, size);
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
    console.log(renderSVG(dna, size, 0, bg, padding));
  }
  process.exit(0);
}

const animate = flags.has("walk") || flags.has("talk") || flags.has("wave");
const compact = flags.has("compact");

if (!animate) {
  // Static render using ANSI colors
  const output = compact ? renderTerminalSmall(dna) : renderTerminal(dna);
  console.log(output);
  process.exit(0);
}

// --- Animated render with ANSI escape codes ---
const traits = decodeDNA(dna);
const legFrameCount = LEGS[traits.legs].length;
const faceRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.5);
const darkRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.28);
const hatRgb = hslToRgb(traits.hatHue * 30, 0.5, 0.5);

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
