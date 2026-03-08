#!/usr/bin/env bun
/**
 * Generate OG image for termlings.com
 * Usage: bun run scripts/gen-og.ts
 */
import { renderSVG, encodeDNA, type DecodedDNA } from "termlings";
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";

// Hand-picked diverse avatars for a nice spread
const avatars: DecodedDNA[] = [
  { eyes: 0, mouth: 0, hat: 1, body: 1, legs: 0, faceHue: 2, hatHue: 8 },   // tophat, green face, purple hat
  { eyes: 6, mouth: 4, hat: 5, body: 0, legs: 2, faceHue: 0, hatHue: 4 },   // squint, horns, red face
  { eyes: 4, mouth: 0, hat: 3, body: 3, legs: 3, faceHue: 6, hatHue: 1 },   // big eyes, crown, cyan face
  { eyes: 8, mouth: 3, hat: 14, body: 5, legs: 4, faceHue: 9, hatHue: 10 }, // narrow, party hat, magenta face
  { eyes: 2, mouth: 1, hat: 0, body: 1, legs: 1, faceHue: 4, hatHue: 0 },   // close eyes, no hat, blue face
  { eyes: 10, mouth: 6, hat: 12, body: 4, legs: 5, faceHue: 11, hatHue: 3 }, // narrow close, ears, pink face
  { eyes: 1, mouth: 2, hat: 6, body: 0, legs: 0, faceHue: 7, hatHue: 6 },   // wide eyes, mohawk, teal face
];

const dnas = avatars.map(a => encodeDNA(a));

// Generate individual SVGs at a large pixel size for embedding
const pixelSize = 8;
const avatarSVGs = dnas.map(dna => renderSVG(dna, pixelSize, 0, null));

// Parse dimensions from each SVG
function parseSvgDims(svg: string): { w: number; h: number } {
  const wMatch = svg.match(/width="(\d+)"/);
  const hMatch = svg.match(/height="(\d+)"/);
  return {
    w: parseInt(wMatch![1]),
    h: parseInt(hMatch![1]),
  };
}

// Extract inner content (everything between <svg...> and </svg>)
function extractSvgContent(svg: string): string {
  return svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
}

const ogW = 1200;
const ogH = 630;

// Layout: homepage-style left aligned hero with avatar row
const avatarDims = avatarSVGs.map(parseSvgDims);
const gap = 20;
const startX = 72;

// Find the tallest avatar to vertically center them
const maxH = Math.max(...avatarDims.map(d => d.h));
const avatarBaseY = 486; // top of avatar area

let avatarGroups = "";
let curX = startX;
for (let i = 0; i < avatarSVGs.length; i++) {
  const content = extractSvgContent(avatarSVGs[i]);
  const d = avatarDims[i];
  // Bottom-align avatars (taller ones start higher)
  const yOffset = avatarBaseY + (maxH - d.h);
  avatarGroups += `<g transform="translate(${Math.round(curX)}, ${yOffset})">${content}</g>\n`;
  curX += d.w + gap;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ogW}" height="${ogH}" viewBox="0 0 ${ogW} ${ogH}">
  <rect width="${ogW}" height="${ogH}" fill="#04090a"/>

  <!-- Eyebrow -->
  <text x="72" y="88" text-anchor="start" font-family="'Courier New', monospace" font-size="22" fill="#6ea99f" letter-spacing="2.4">TERMINAL-FIRST MULTI-AGENT WORKSPACE</text>

  <!-- Headline -->
  <text x="72" y="210" text-anchor="start" font-family="'Inter', 'SF Pro Display', Arial, sans-serif" font-size="86" font-weight="800" fill="#e9f7f2">AI agents that build</text>
  <text x="72" y="306" text-anchor="start" font-family="'Inter', 'SF Pro Display', Arial, sans-serif" font-size="86" font-weight="800" fill="#e9f7f2">and run companies.</text>

  <!-- Body -->
  <text x="72" y="368" text-anchor="start" font-family="'Inter', 'SF Pro Text', Arial, sans-serif" font-size="36" fill="#b7d6cd">Run your AI team in one shared terminal workspace.</text>
  <text x="72" y="414" text-anchor="start" font-family="'Inter', 'SF Pro Text', Arial, sans-serif" font-size="30" fill="#9fc4ba">Message agents, tasks, calendar, and browser workflows.</text>

  <!-- Avatars -->
  ${avatarGroups}
</svg>`;

const outDir = path.join(projectRoot, "static");
writeFileSync(`${outDir}/og.svg`, svg);
console.log(`Written og.svg (${svg.length} bytes)`);

// Convert SVG to PNG using resvg
const resvg = new Resvg(svg, {
  fitTo: {
    mode: "width",
    value: 1200,
  },
  font: {
    loadSystemFonts: true,
  },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();
writeFileSync(`${outDir}/og.png`, pngBuffer);
console.log(`Written og.png (${pngBuffer.length} bytes)`);
console.log(`Avatar DNAs: ${dnas.join(", ")}`);
