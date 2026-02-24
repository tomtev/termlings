#!/usr/bin/env bun
/**
 * Generate an animated GIF showing a row of termlings walking, talking, waving.
 */
import { generateGrid, decodeDNA, hslToRgb, LEGS, type Pixel } from "../src/index.js";
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", ".frames");
const OUT_GIF = join(import.meta.dir, "..", "demo.gif");

const agents = [
  { dna: "00028a0", walk: true,  talk: false, wave: false },
  { dna: "0a27b79", walk: false, talk: true,  wave: false },
  { dna: "1503136", walk: true,  talk: false, wave: false },
  { dna: "0546540", walk: false, talk: false, wave: true  },
  { dna: "1ab0557", walk: true,  talk: true,  wave: false },
  { dna: "030185a", walk: false, talk: false, wave: true  },
  { dna: "0c47a25", walk: true,  talk: false, wave: false },
];

const PX = 8;
const PAD = 1;
const GAP = 12;
const TOTAL_FRAMES = 12;
const BG = "#0a0a0a";

const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

function gridToSvgRects(grid: Pixel[][], traits: { faceHue: number; hatHue: number }, offsetX: number, offsetY: number): string {
  const faceRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.5);
  const darkRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.28);
  const hatRgb = hslToRgb(traits.hatHue * 30, 0.5, 0.5);
  const faceHex = toHex(...faceRgb);
  const darkHex = toHex(...darkRgb);
  const hatHex = toHex(...hatRgb);
  const half = Math.round(PX / 2);
  const quarter = Math.round(PX / 4);

  const rects: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < 9; x++) {
      const cell = grid[y][x];
      const rx = offsetX + (x + PAD) * PX;
      const ry = offsetY + (y + PAD) * PX;
      if (cell === "f") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
      } else if (cell === "l") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${half}" height="${PX}" fill="${faceHex}"/>`);
      } else if (cell === "a") {
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${PX}" height="${half}" fill="${faceHex}"/>`);
      } else if (cell === "e" || cell === "d") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${darkHex}"/>`);
      } else if (cell === "s") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${PX}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "n") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx + quarter}" y="${ry}" width="${half}" height="${PX}" fill="${darkHex}"/>`);
      } else if (cell === "m") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "q") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx + half}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "r") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "h") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${hatHex}"/>`);
      } else if (cell === "k") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx + quarter}" y="${ry}" width="${half}" height="${PX}" fill="${hatHex}"/>`);
      }
    }
  }
  return rects.join("\n");
}

// Pre-calculate max height for bottom-alignment
const maxRows = agents.reduce((max, a) => {
  const traits = decodeDNA(a.dna);
  const grid = generateGrid(traits, 0, 0, 0);
  return Math.max(max, grid.length);
}, 0);

const singleW = (9 + PAD * 2) * PX;
const canvasH = (maxRows + PAD * 2) * PX + 40;
const canvasW = agents.length * singleW + (agents.length - 1) * GAP + 60;

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

console.log(`Generating ${TOTAL_FRAMES} frames for ${agents.length} termlings...`);
console.log(`Canvas: ${canvasW}x${canvasH}`);

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  let allRects = "";
  let x = 30;

  for (const agent of agents) {
    const traits = decodeDNA(agent.dna);
    const legFrames = LEGS[traits.legs].length;

    const walkFrame = agent.walk ? frame % legFrames : 0;
    const talkFrame = agent.talk ? frame % 2 : 0;
    const waveFrame = agent.wave ? (frame % 2) + 1 : 0;

    const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);

    // Bottom-align: offset Y so all termlings sit on same baseline
    const gridH = (grid.length + PAD * 2) * PX;
    const yOff = canvasH - 20 - gridH;

    allRects += gridToSvgRects(grid, traits, x, yOff);
    x += singleW + GAP;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" shape-rendering="crispEdges">
<rect width="${canvasW}" height="${canvasH}" fill="${BG}"/>
${allRects}
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: "original" } });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT_DIR, `frame-${String(frame).padStart(4, "0")}.png`), png);
  process.stdout.write(`\r  Frame ${frame + 1}/${TOTAL_FRAMES}`);
}

console.log("\nEncoding GIF...");

execSync(
  `ffmpeg -y -framerate 4 -i "${OUT_DIR}/frame-%04d.png" -vf "split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=none" "${OUT_GIF}"`,
  { stdio: "inherit" }
);

rmSync(OUT_DIR, { recursive: true, force: true });
console.log(`Done: ${OUT_GIF}`);
