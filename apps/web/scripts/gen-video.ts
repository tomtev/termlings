#!/usr/bin/env bun
/**
 * Generate a looping MP4 of animated termlings in a grid.
 */
import { generateGrid, decodeDNA, hslToRgb, LEGS, type Pixel } from "termlings";
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", ".video-frames");
const OUT_MP4 = join(import.meta.dir, "..", "termlings-promo.mp4");

const FPS = 8;
const DURATION = 3;
const TOTAL_FRAMES = FPS * DURATION;
const ANIM_INTERVAL = 2; // change termling frame every N video frames

const CANVAS_W = 1080;
const CANVAS_H = 1080;
const BG = "#0a0a0a";
const PX = 11;
const PAD = 1;

const allAgents = [
  // Row 1
  { dna: "00028a0", walk: true,  talk: false, wave: false },
  { dna: "1013524", walk: false, talk: true,  wave: false },
  { dna: "0a27b79", walk: true,  talk: false, wave: false },
  { dna: "1503136", walk: false, talk: false, wave: true  },
  { dna: "0546540", walk: true,  talk: true,  wave: false },
  { dna: "1ab0557", walk: false, talk: false, wave: true  },
  { dna: "030185a", walk: true,  talk: false, wave: false },
  { dna: "0c47a25", walk: false, talk: true,  wave: false },
  { dna: "0f12a30", walk: true,  talk: false, wave: false },
  { dna: "0812c4f", walk: false, talk: false, wave: true  },
  { dna: "0bf1a32", walk: true,  talk: true,  wave: false },
  { dna: "05d4c81", walk: false, talk: true,  wave: false },
  // Row 2
  { dna: "0e8b3d4", walk: true,  talk: false, wave: false },
  { dna: "029f6a5", walk: false, talk: false, wave: true  },
  { dna: "07c1d93", walk: true,  talk: false, wave: false },
  { dna: "0b5e2f6", walk: false, talk: true,  wave: false },
  { dna: "0321a50", walk: false, talk: false, wave: true  },
  { dna: "0a41b62", walk: true,  talk: true,  wave: false },
  { dna: "0c62d83", walk: true,  talk: false, wave: false },
  { dna: "0d83e94", walk: false, talk: true,  wave: false },
  { dna: "0ea4fa5", walk: true,  talk: false, wave: true  },
  { dna: "0fb50b6", walk: false, talk: false, wave: true  },
  { dna: "00c61c7", walk: true,  talk: true,  wave: false },
  { dna: "01d72d8", walk: true,  talk: false, wave: false },
];

const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

function gridToSvgRects(grid: Pixel[][], traits: { faceHue: number; hatHue: number }, ox: number, oy: number): string {
  const faceRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.5);
  const darkRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.28);
  const hatRgb = hslToRgb(traits.hatHue * 30, 0.5, 0.5);
  const fH = toHex(...faceRgb), dH = toHex(...darkRgb), hH = toHex(...hatRgb);
  const half = Math.round(PX / 2);
  const quarter = Math.round(PX / 4);
  const rects: string[] = [];

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < 9; x++) {
      const cell = grid[y][x];
      const rx = ox + (x + PAD) * PX;
      const ry = oy + (y + PAD) * PX;
      if (cell === "f") rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
      else if (cell === "l") rects.push(`<rect x="${rx}" y="${ry}" width="${half}" height="${PX}" fill="${fH}"/>`);
      else if (cell === "a") rects.push(`<rect x="${rx}" y="${ry + half}" width="${PX}" height="${half}" fill="${fH}"/>`);
      else if (cell === "e" || cell === "d") rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${dH}"/>`);
      else if (cell === "s") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${PX}" height="${half}" fill="${dH}"/>`);
      } else if (cell === "n") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
        rects.push(`<rect x="${rx + quarter}" y="${ry}" width="${half}" height="${PX}" fill="${dH}"/>`);
      } else if (cell === "m") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${half}" fill="${dH}"/>`);
      } else if (cell === "q") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
        rects.push(`<rect x="${rx + half}" y="${ry + half}" width="${half}" height="${half}" fill="${dH}"/>`);
      } else if (cell === "r") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${half}" height="${half}" fill="${dH}"/>`);
      } else if (cell === "h") rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${hH}"/>`);
      else if (cell === "k") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${PX}" height="${PX}" fill="${fH}"/>`);
        rects.push(`<rect x="${rx + quarter}" y="${ry}" width="${half}" height="${PX}" fill="${hH}"/>`);
      }
    }
  }
  return rects.join("\n");
}

const singleW = (9 + PAD * 2) * PX;
const singleH = 14 * PX;

const AGENTS_PER_ROW = 6;
const NUM_ROWS = 4;
const COL_GAP = 14;
const ROW_GAP = 14;
const rowW = AGENTS_PER_ROW * singleW + (AGENTS_PER_ROW - 1) * COL_GAP;
const gridH = NUM_ROWS * singleH + (NUM_ROWS - 1) * ROW_GAP;
const rowStartX = (CANVAS_W - rowW) / 2;
const gridStartY = (CANVAS_H - gridH) / 2;

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

console.log(`Generating ${TOTAL_FRAMES} frames at ${FPS}fps (${DURATION}s loop)...`);

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  const animFrame = Math.floor(frame / ANIM_INTERVAL);
  let avatarRects = "";

  for (let row = 0; row < NUM_ROWS; row++) {
    for (let col = 0; col < AGENTS_PER_ROW; col++) {
      const idx = row * AGENTS_PER_ROW + col;
      if (idx >= allAgents.length) break;
      const agent = allAgents[idx];

      const traits = decodeDNA(agent.dna);
      const legFrames = LEGS[traits.legs].length;
      const walkFrame = agent.walk ? animFrame % legFrames : 0;
      const talkFrame = agent.talk ? animFrame % 2 : 0;
      const waveFrame = agent.wave ? (animFrame % 2) + 1 : 0;

      const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);
      const gridPixH = (grid.length + PAD * 2) * PX;

      const x = rowStartX + col * (singleW + COL_GAP);
      const y = gridStartY + row * (singleH + ROW_GAP) + singleH - gridPixH;

      avatarRects += gridToSvgRects(grid, traits, x, y);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" shape-rendering="crispEdges">
<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${BG}"/>
${avatarRects}
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: "original" } });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT_DIR, `frame-${String(frame).padStart(4, "0")}.png`), png);
  process.stdout.write(`\r  Frame ${frame + 1}/${TOTAL_FRAMES}`);
}

console.log("\nEncoding MP4...");

execSync(
  `ffmpeg -y -framerate ${FPS} -i "${OUT_DIR}/frame-%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" "${OUT_MP4}"`,
  { stdio: "inherit" }
);

rmSync(OUT_DIR, { recursive: true, force: true });
const size = (readFileSync(OUT_MP4).length / 1024).toFixed(0);
console.log(`Done: ${OUT_MP4} (${size}KB)`);
