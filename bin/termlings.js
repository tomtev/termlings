#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/index.ts
function encodeDNA(traits2) {
  let n = traits2.hatHue;
  n += traits2.faceHue * SLOTS.hues;
  n += traits2.legs * SLOTS.hues * SLOTS.hues;
  n += traits2.body * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  n += traits2.hat * SLOTS.bodies * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  n += traits2.mouth * SLOTS.hats * SLOTS.bodies * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  n += traits2.eyes * SLOTS.mouths * SLOTS.hats * SLOTS.bodies * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  return n.toString(16).padStart(7, "0");
}
function decodeDNA(hex) {
  let n = parseInt(hex, 16);
  const hatHue = n % SLOTS.hues;
  n = Math.floor(n / SLOTS.hues);
  const faceHue = n % SLOTS.hues;
  n = Math.floor(n / SLOTS.hues);
  const legs = n % SLOTS.legs;
  n = Math.floor(n / SLOTS.legs);
  const body = n % SLOTS.bodies;
  n = Math.floor(n / SLOTS.bodies);
  const hat = n % SLOTS.hats;
  n = Math.floor(n / SLOTS.hats);
  const mouth = n % SLOTS.mouths;
  n = Math.floor(n / SLOTS.mouths);
  const eyes = n % SLOTS.eyes;
  return {
    eyes: eyes % EYES.length,
    mouth: mouth % MOUTHS.length,
    hat: hat % HATS.length,
    body: body % BODIES.length,
    legs: legs % LEGS.length,
    faceHue: faceHue % SLOTS.hues,
    hatHue: hatHue % SLOTS.hues
  };
}
function traitsFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.imul(hash ^ hash >>> 16, 73244475);
  hash = Math.imul(hash ^ hash >>> 13, 73244475);
  hash = hash ^ hash >>> 16;
  const h = Math.abs(hash);
  return {
    eyes: h % EYES.length,
    mouth: (h >>> 4) % MOUTHS.length,
    hat: (h >>> 8) % HATS.length,
    body: (h >>> 14) % BODIES.length,
    legs: (h >>> 18) % LEGS.length,
    faceHue: (h >>> 22) % 12,
    hatHue: (h >>> 26) % 12
  };
}
function generateRandomDNA() {
  return encodeDNA({
    eyes: Math.floor(Math.random() * EYES.length),
    mouth: Math.floor(Math.random() * MOUTHS.length),
    hat: Math.floor(Math.random() * HATS.length),
    body: Math.floor(Math.random() * BODIES.length),
    legs: Math.floor(Math.random() * LEGS.length),
    faceHue: Math.floor(Math.random() * SLOTS.hues),
    hatHue: Math.floor(Math.random() * SLOTS.hues)
  });
}
function generateGrid(traits2, frame2 = 0, talkFrame2 = 0, waveFrame2 = 0) {
  const legFrames = LEGS[traits2.legs];
  const legRow = legFrames[frame2 % legFrames.length];
  const mouthRows = talkFrame2 === 0 ? MOUTHS[traits2.mouth] : TALK_FRAMES[(talkFrame2 - 1) % TALK_FRAMES.length];
  const bodyRows = waveFrame2 === 0 ? BODIES[traits2.body] : WAVE_FRAMES[(waveFrame2 - 1) % WAVE_FRAMES.length];
  return [
    ...HATS[traits2.hat],
    F,
    EYES[traits2.eyes],
    ...mouthRows,
    ...bodyRows,
    legRow
  ];
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) {
    [r1, g1, b1] = [c, x, 0];
  } else if (h < 120) {
    [r1, g1, b1] = [x, c, 0];
  } else if (h < 180) {
    [r1, g1, b1] = [0, c, x];
  } else if (h < 240) {
    [r1, g1, b1] = [0, x, c];
  } else if (h < 300) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255)
  ];
}
function getTraitColors(traits2, bw2 = false) {
  if (bw2) {
    const fg = hueToGray(traits2.faceHue);
    const dg = Math.round(fg * 0.55);
    const bg = Math.round(fg * 0.18);
    const hg = hueToGray(traits2.hatHue);
    return {
      faceRgb: [fg, fg, fg],
      darkRgb: [dg, dg, dg],
      hatRgb: [hg, hg, hg],
      bgRgb: [bg, bg, bg]
    };
  }
  const faceHueDeg = traits2.faceHue * 30;
  const hatHueDeg = traits2.hatHue * 30;
  return {
    faceRgb: hslToRgb(faceHueDeg, 0.5, 0.5),
    darkRgb: hslToRgb(faceHueDeg, 0.5, 0.28),
    hatRgb: hslToRgb(hatHueDeg, 0.5, 0.5),
    bgRgb: hslToRgb(faceHueDeg, 0.5, 0.1)
  };
}
function renderSVG(dna2, pixelSize = 10, frame2 = 0, background = "auto", padding = 1, bw2 = false) {
  const traits2 = decodeDNA(dna2);
  const grid = generateGrid(traits2, frame2);
  const { faceRgb: faceRgb2, darkRgb: darkRgb2, hatRgb: hatRgb2, bgRgb } = getTraitColors(traits2, bw2);
  const toHex = (r, g, b) => `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const faceHex = toHex(...faceRgb2);
  const darkHex = toHex(...darkRgb2);
  const hatHex = toHex(...hatRgb2);
  const resolvedBg = background === "auto" ? toHex(...bgRgb) : background;
  const cols2 = 9;
  const rows2 = grid.length;
  const maxRows = 12;
  const pad = padding;
  const side = Math.max(cols2, maxRows) + pad * 2;
  const w = side * pixelSize;
  const h = side * pixelSize;
  const oxPx = Math.round((w - cols2 * pixelSize) / 2);
  const oyPx = Math.round((h - rows2 * pixelSize) / 2);
  const half = Math.round(pixelSize / 2);
  const quarter = Math.round(pixelSize / 4);
  const rects = [];
  for (let y = 0; y < rows2; y++) {
    for (let x = 0; x < cols2; x++) {
      const cell = grid[y][x];
      const rx = x * pixelSize + oxPx;
      const ry = y * pixelSize + oyPx;
      if (cell === "f") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`);
      } else if (cell === "l") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${half}" height="${pixelSize}" fill="${faceHex}"/>`);
      } else if (cell === "a") {
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${pixelSize}" height="${half}" fill="${faceHex}"/>`);
      } else if (cell === "e" || cell === "d") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${darkHex}"/>`);
      } else if (cell === "s") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${pixelSize}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "n") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx + quarter}" y="${ry}" width="${half}" height="${pixelSize}" fill="${darkHex}"/>`);
      } else if (cell === "m") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "q") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx + half}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "r") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`);
        rects.push(`<rect x="${rx}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`);
      } else if (cell === "h") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${hatHex}"/>`);
      } else if (cell === "k") {
        rects.push(`<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${hatHex}"/>`);
      }
    }
  }
  const bg = resolvedBg ? `<rect width="${w}" height="${h}" fill="${resolvedBg}"/>
` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">
${bg}${rects.join("\n")}
</svg>`;
}
function renderTerminal(dna2, frame2 = 0, bw2 = false) {
  const traits2 = decodeDNA(dna2);
  const grid = generateGrid(traits2, frame2);
  const { faceRgb: faceRgb2, darkRgb: darkRgb2, hatRgb: hatRgb2 } = getTraitColors(traits2, bw2);
  const faceAnsi = `\x1B[38;2;${faceRgb2[0]};${faceRgb2[1]};${faceRgb2[2]}m`;
  const darkAnsi = `\x1B[38;2;${darkRgb2[0]};${darkRgb2[1]};${darkRgb2[2]}m`;
  const hatAnsi = `\x1B[38;2;${hatRgb2[0]};${hatRgb2[1]};${hatRgb2[2]}m`;
  const reset = "\x1B[0m";
  const faceBg = `\x1B[48;2;${faceRgb2[0]};${faceRgb2[1]};${faceRgb2[2]}m`;
  const lines = [];
  for (const row of grid) {
    let line = "";
    for (const cell of row) {
      if (cell === "_") {
        line += "  ";
      } else if (cell === "f") {
        line += `${faceAnsi}\u2588\u2588${reset}`;
      } else if (cell === "l") {
        line += `${faceAnsi}\u258C${reset} `;
      } else if (cell === "e" || cell === "d") {
        line += `${darkAnsi}\u2588\u2588${reset}`;
      } else if (cell === "s") {
        line += `${darkAnsi}${faceBg}\u2584\u2584${reset}`;
      } else if (cell === "n") {
        line += `${darkAnsi}${faceBg}\u2590\u258C${reset}`;
      } else if (cell === "m") {
        line += `${darkAnsi}${faceBg}\u2580\u2580${reset}`;
      } else if (cell === "q") {
        line += `${darkAnsi}${faceBg} \u2597${reset}`;
      } else if (cell === "r") {
        line += `${darkAnsi}${faceBg}\u2596 ${reset}`;
      } else if (cell === "a") {
        line += `${faceAnsi}\u2584\u2584${reset}`;
      } else if (cell === "h") {
        line += `${hatAnsi}\u2588\u2588${reset}`;
      } else if (cell === "k") {
        line += `${hatAnsi}\u2590\u258C${reset}`;
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}
function renderLayeredSVG(dna2, pixelSize = 10, bw2 = false, padding = 0) {
  const traits2 = decodeDNA(dna2);
  const { faceRgb: faceRgb2, darkRgb: darkRgb2, hatRgb: hatRgb2, bgRgb } = getTraitColors(traits2, bw2);
  const toHex = (r, g, b) => `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const faceHex = toHex(...faceRgb2);
  const darkHex = toHex(...darkRgb2);
  const hatHex = toHex(...hatRgb2);
  const bgHex = toHex(...bgRgb);
  const half = Math.round(pixelSize / 2);
  const quarter = Math.round(pixelSize / 4);
  const cols2 = 9;
  const hatRows = HATS[traits2.hat];
  const mouthNormal = MOUTHS[traits2.mouth];
  const mouthTalk = TALK_FRAMES[0];
  const bodyNormal = BODIES[traits2.body];
  const waveF1 = WAVE_FRAMES[0];
  const waveF2 = WAVE_FRAMES[1];
  const legVariant = LEGS[traits2.legs];
  const legFrameCount2 = legVariant.length;
  const totalRows = hatRows.length + 1 + 1 + 2 + 2 + 1;
  const maxRows = 12;
  const pad = padding;
  const side = Math.max(cols2, maxRows) + pad * 2;
  const w = side * pixelSize;
  const h = side * pixelSize;
  const oxPx = Math.round((w - cols2 * pixelSize) / 2);
  const oyPx = Math.round((h - totalRows * pixelSize) / 2);
  function px(cell, rx, ry) {
    if (cell === "_") return "";
    if (cell === "f") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`;
    if (cell === "l") return `<rect x="${rx}" y="${ry}" width="${half}" height="${pixelSize}" fill="${faceHex}"/>`;
    if (cell === "a") return `<rect x="${rx}" y="${ry + half}" width="${pixelSize}" height="${half}" fill="${faceHex}"/>`;
    if (cell === "e" || cell === "d") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${darkHex}"/>`;
    if (cell === "s") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx}" y="${ry + half}" width="${pixelSize}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "n") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx + quarter}" y="${ry}" width="${half}" height="${pixelSize}" fill="${darkHex}"/>`;
    if (cell === "m") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx}" y="${ry}" width="${pixelSize}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "q") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx + half}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "r") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "h" || cell === "k") return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${hatHex}"/>`;
    return "";
  }
  function renderRows(rows2, startY) {
    let out = "";
    for (let y = 0; y < rows2.length; y++) {
      for (let x = 0; x < cols2; x++) {
        out += px(rows2[y][x], x * pixelSize + oxPx, (startY + y) * pixelSize + oyPx);
      }
    }
    return out;
  }
  const eyeY = hatRows.length + 1;
  const mY = hatRows.length + 2;
  const staticRects = renderRows([...hatRows, F], 0)
    + renderRows([F], eyeY)
    + renderRows([F, F], mY);
  const eyeRects = renderRows([EYES[traits2.eyes]], eyeY);
  const mouth0 = renderRows(mouthNormal, mY);
  const mouth1 = renderRows(mouthTalk, mY);
  const bY = mY + 2;
  const body0 = renderRows(bodyNormal, bY);
  const body1 = renderRows(waveF1, bY);
  const body2 = renderRows(waveF2, bY);
  const lY = bY + 2;
  const legs0 = renderRows([legVariant[0]], lY);
  const legs1 = legFrameCount2 > 1 ? renderRows([legVariant[1]], lY) : "";
  const legs2 = legFrameCount2 > 2 ? renderRows([legVariant[2]], lY) : "";
  const legs3 = legFrameCount2 > 3 ? renderRows([legVariant[3]], lY) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><g class="tg-bob">${staticRects}<g class="tg-eyes">${eyeRects}</g><g class="tg-mouth-0">${mouth0}</g><g class="tg-mouth-1">${mouth1}</g><g class="tg-body-0">${body0}</g><g class="tg-body-1">${body1}</g><g class="tg-body-2">${body2}</g></g><g class="tg-legs-0">${legs0}</g>` + (legs1 ? `<g class="tg-legs-1">${legs1}</g>` : "") + (legs2 ? `<g class="tg-legs-2">${legs2}</g>` : "") + (legs3 ? `<g class="tg-legs-3">${legs3}</g>` : "") + `</svg>`;
  return { svg, legFrames: legFrameCount2, rows: totalRows, bgHex };
}
function getAvatarCSS() {
  return `
.tg-avatar .tg-mouth-1,
.tg-avatar .tg-body-1,
.tg-avatar .tg-body-2,
.tg-avatar .tg-legs-1,
.tg-avatar .tg-legs-2,
.tg-avatar .tg-legs-3 { opacity: 0 }

@keyframes tg-toggle {
  0%, 49.99% { opacity: 1 }
  50%, 100% { opacity: 0 }
}
@keyframes tg-toggle-3 {
  0%, 33.32% { opacity: 1 }
  33.33%, 100% { opacity: 0 }
}
@keyframes tg-toggle-4 {
  0%, 24.99% { opacity: 1 }
  25%, 100% { opacity: 0 }
}
@keyframes tg-idle-bob {
  0%, 30%, 100% { transform: translateY(0) }
  35%, 65% { transform: translateY(1px) }
}

.tg-avatar.idle .tg-bob {
  animation: tg-idle-bob 3s steps(1) infinite;
  animation-delay: var(--tg-idle-delay, 0s);
}

.tg-avatar.walking .tg-legs-0 { animation: tg-toggle 800ms steps(1) infinite }
.tg-avatar.walking .tg-legs-1 { animation: tg-toggle 800ms steps(1) infinite; animation-delay: -400ms }
.tg-avatar.walking.walk-3f .tg-legs-0 { animation: tg-toggle-3 1200ms steps(1) infinite }
.tg-avatar.walking.walk-3f .tg-legs-1 { animation: tg-toggle-3 1200ms steps(1) infinite; animation-delay: -800ms }
.tg-avatar.walking.walk-3f .tg-legs-2 { animation: tg-toggle-3 1200ms steps(1) infinite; animation-delay: -400ms }
.tg-avatar.walking.walk-4f .tg-legs-0 { animation: tg-toggle-4 1200ms steps(1) infinite }
.tg-avatar.walking.walk-4f .tg-legs-1 { animation: tg-toggle-4 1200ms steps(1) infinite; animation-delay: -900ms }
.tg-avatar.walking.walk-4f .tg-legs-2 { animation: tg-toggle-4 1200ms steps(1) infinite; animation-delay: -600ms }
.tg-avatar.walking.walk-4f .tg-legs-3 { animation: tg-toggle-4 1200ms steps(1) infinite; animation-delay: -300ms }

.tg-avatar.talking .tg-mouth-0 { animation: tg-toggle 400ms steps(1) infinite }
.tg-avatar.talking .tg-mouth-1 { animation: tg-toggle 400ms steps(1) infinite; animation-delay: -200ms }

.tg-avatar.waving .tg-body-0 { opacity: 0 }
.tg-avatar.waving .tg-body-1 { animation: tg-toggle 1200ms steps(1) infinite }
.tg-avatar.waving .tg-body-2 { animation: tg-toggle 1200ms steps(1) infinite; animation-delay: -600ms }

.tg-avatar.backside .tg-eyes,
.tg-avatar.backside .tg-mouth-0,
.tg-avatar.backside .tg-mouth-1 { display: none }
`;
}
function renderTerminalSmall(dna2, frame2 = 0, bw2 = false) {
  const traits2 = decodeDNA(dna2);
  const grid = generateGrid(traits2, frame2);
  const { faceRgb: faceRgb2, darkRgb: darkRgb2, hatRgb: hatRgb2 } = getTraitColors(traits2, bw2);
  function cellRgb(cell) {
    if (cell === "f" || cell === "l" || cell === "a" || cell === "q" || cell === "r") return faceRgb2;
    if (cell === "e" || cell === "s" || cell === "n" || cell === "d" || cell === "m") return darkRgb2;
    if (cell === "h" || cell === "k") return hatRgb2;
    return null;
  }
  const reset = "\x1B[0m";
  const lines = [];
  for (let r = 0; r < grid.length; r += 2) {
    const topRow = grid[r];
    const botRow = r + 1 < grid.length ? grid[r + 1] : null;
    let line = "";
    for (let c = 0; c < topRow.length; c++) {
      const top = cellRgb(topRow[c]);
      const bot = botRow ? cellRgb(botRow[c]) : null;
      if (top && bot) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m\x1B[48;2;${bot[0]};${bot[1]};${bot[2]}m\u2580${reset}`;
      } else if (top) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m\u2580${reset}`;
      } else if (bot) {
        line += `\x1B[38;2;${bot[0]};${bot[1]};${bot[2]}m\u2584${reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}
function hueToGray(hueIndex) {
  return Math.round(89 + hueIndex / 11 * 77);
}
var F, EYES, MOUTHS, HATS, BODIES, LEGS, SLOTS, WAVE_FRAMES, TALK_FRAMES;
var init_index = __esm({
  "src/index.ts"() {
    F = ["_", "f", "f", "f", "f", "f", "f", "f", "_"];
    EYES = [
      ["_", "f", "e", "f", "f", "f", "e", "f", "_"],
      // normal
      ["_", "e", "f", "f", "f", "f", "f", "e", "_"],
      // wide
      ["_", "f", "f", "e", "f", "e", "f", "f", "_"],
      // close
      ["_", "f", "e", "f", "f", "f", "e", "f", "_"],
      // normal-alt
      ["_", "e", "e", "f", "f", "f", "e", "e", "_"],
      // big
      ["_", "f", "e", "e", "f", "e", "e", "f", "_"],
      // big close
      ["_", "f", "s", "f", "f", "f", "s", "f", "_"],
      // squint
      ["_", "s", "f", "f", "f", "f", "f", "s", "_"],
      // squint wide
      ["_", "f", "n", "f", "f", "f", "n", "f", "_"],
      // narrow
      ["_", "n", "f", "f", "f", "f", "f", "n", "_"],
      // narrow wide
      ["_", "f", "f", "n", "f", "n", "f", "f", "_"]
      // narrow close
    ];
    MOUTHS = [
      [
        // smile (default)
        ["_", "f", "q", "f", "f", "f", "r", "f", "_"],
        ["_", "f", "f", "m", "m", "m", "f", "f", "_"]
      ],
      [
        // smirk left
        ["_", "f", "q", "f", "f", "f", "f", "f", "_"],
        ["_", "f", "f", "m", "m", "m", "f", "f", "_"]
      ],
      [
        // smirk right
        ["_", "f", "f", "f", "f", "f", "r", "f", "_"],
        ["_", "f", "f", "m", "m", "m", "f", "f", "_"]
      ],
      [
        // narrow
        ["_", "f", "f", "q", "f", "r", "f", "f", "_"],
        ["_", "f", "f", "f", "m", "f", "f", "f", "_"]
      ],
      [
        // wide smile
        ["_", "q", "f", "f", "f", "f", "f", "r", "_"],
        ["_", "f", "m", "m", "m", "m", "m", "f", "_"]
      ],
      [
        // wide smirk left
        ["_", "q", "f", "f", "f", "f", "f", "f", "_"],
        ["_", "f", "m", "m", "m", "m", "m", "f", "_"]
      ],
      [
        // wide smirk right
        ["_", "f", "f", "f", "f", "f", "f", "r", "_"],
        ["_", "f", "m", "m", "m", "m", "m", "f", "_"]
      ]
    ];
    HATS = [
      [],
      // none
      [
        // tophat
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
      ],
      [
        // beanie
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"]
      ],
      [
        // crown
        ["_", "_", "h", "_", "h", "_", "h", "_", "_"],
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"]
      ],
      [
        // cap
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
        ["h", "h", "h", "h", "h", "h", "h", "_", "_"]
      ],
      [
        // horns
        ["_", "h", "_", "_", "_", "_", "_", "h", "_"],
        ["_", "h", "h", "_", "_", "_", "h", "h", "_"]
      ],
      [
        // mohawk
        ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"]
      ],
      [
        // antenna
        ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
        ["_", "_", "_", "_", "h", "_", "_", "_", "_"]
      ],
      [
        // halo
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"]
      ],
      [
        // bandage
        ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
      ],
      [
        // wide brim
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
        ["h", "h", "h", "h", "h", "h", "h", "h", "h"]
      ],
      [
        // unicorn horn
        ["_", "_", "_", "_", "k", "_", "_", "_", "_"],
        ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"]
      ],
      [
        // ears
        ["_", "h", "h", "_", "_", "_", "h", "h", "_"]
      ],
      [
        // spikes
        ["_", "h", "_", "h", "_", "h", "_", "h", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
      ],
      [
        // party hat
        ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"]
      ],
      [
        // flat top
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
      ],
      [
        // afro
        ["_", "_", "k", "h", "h", "h", "k", "_", "_"],
        ["_", "k", "h", "h", "h", "h", "h", "k", "_"]
      ],
      [
        // side sweep
        ["_", "_", "_", "_", "h", "h", "h", "k", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
      ],
      [
        // cowboy hat
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
        ["h", "h", "h", "h", "h", "h", "h", "h", "h"]
      ],
      [
        // knitted hat
        ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
        ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
        ["_", "h", "f", "h", "f", "h", "f", "h", "_"]
      ],
      [
        // clown hair
        ["h", "h", "_", "_", "_", "_", "_", "h", "h"],
        ["h", "h", "h", "_", "_", "_", "h", "h", "h"]
      ],
      [
        // stovepipe
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
        ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
        ["_", "d", "d", "d", "d", "d", "d", "d", "_"],
        ["h", "h", "h", "h", "h", "h", "h", "h", "h"]
      ]
    ];
    BODIES = [
      [
        // normal
        ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
        ["_", "f", "f", "f", "f", "f", "f", "f", "_"]
      ],
      [
        // normal-arms
        ["a", "f", "f", "f", "f", "f", "f", "f", "a"],
        ["_", "f", "f", "f", "f", "f", "f", "f", "_"]
      ],
      [
        // narrow
        ["_", "_", "f", "f", "f", "f", "f", "_", "_"],
        ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
      ],
      [
        // narrow-arms
        ["_", "a", "f", "f", "f", "f", "f", "a", "_"],
        ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
      ],
      [
        // tapered
        ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
        ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
      ],
      [
        // tapered-arms
        ["a", "f", "f", "f", "f", "f", "f", "f", "a"],
        ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
      ]
    ];
    LEGS = [
      [
        // biped
        ["_", "_", "f", "_", "_", "f", "_", "_", "_"],
        ["_", "f", "_", "_", "_", "_", "f", "_", "_"]
      ],
      [
        // outer (thin, alternating pairs)
        ["_", "_", "l", "_", "_", "_", "_", "l", "_"],
        ["_", "_", "_", "l", "_", "l", "_", "_", "_"]
      ],
      [
        // tentacles (outer thick, inner stagger)
        ["_", "f", "_", "l", "_", "l", "_", "f", "_"],
        ["_", "f", "_", "f", "_", "l", "_", "f", "_"],
        ["_", "f", "_", "l", "_", "f", "_", "f", "_"]
      ],
      [
        // thin biped
        ["_", "_", "l", "_", "_", "_", "l", "_", "_"],
        ["_", "_", "_", "l", "_", "l", "_", "_", "_"]
      ],
      [
        // wide stance
        ["_", "f", "_", "_", "_", "_", "_", "f", "_"],
        ["_", "_", "f", "_", "_", "_", "f", "_", "_"]
      ],
      [
        // thin narrow
        ["_", "_", "_", "l", "_", "l", "_", "_", "_"],
        ["_", "_", "l", "_", "_", "_", "l", "_", "_"]
      ]
    ];
    SLOTS = {
      eyes: 12,
      mouths: 12,
      hats: 24,
      bodies: 8,
      legs: 8,
      hues: 12
    };
    WAVE_FRAMES = [
      [
        // left up, right down
        ["a", "f", "f", "f", "f", "f", "f", "f", "_"],
        ["_", "f", "f", "f", "f", "f", "f", "f", "a"]
      ],
      [
        // left down, right up
        ["_", "f", "f", "f", "f", "f", "f", "f", "a"],
        ["a", "f", "f", "f", "f", "f", "f", "f", "_"]
      ]
    ];
    TALK_FRAMES = [
      [
        // open mouth (full dark, no corners)
        ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
        ["_", "f", "f", "d", "d", "d", "f", "f", "_"]
      ]
    ];
  }
});

// src/game.ts
var game_exports = {};
function cleanup() {
  stdout.write("\x1B[?25h\x1B[?1049l");
  process.exit(0);
}
function makeEntity(dna2, x, y, opts2 = {}) {
  const traits2 = decodeDNA(dna2);
  const { faceRgb: faceRgb2, darkRgb: darkRgb2, hatRgb: hatRgb2 } = getTraitColors(traits2);
  return {
    dna: dna2,
    x,
    y,
    walkFrame: 0,
    talkFrame: 0,
    waveFrame: opts2.waving ? 1 : 0,
    flipped: opts2.flipped ?? false,
    traits: traits2,
    faceRgb: faceRgb2,
    darkRgb: darkRgb2,
    hatRgb: hatRgb2,
    legFrames: LEGS[traits2.legs].length,
    height: HATS[traits2.hat].length + 7,
    walking: opts2.walking ?? false,
    talking: opts2.talking ?? false,
    waving: opts2.waving ?? false,
    idle: opts2.idle ?? false
  };
}
function pixelCell(p, face, dark, hat, flipped) {
  let chars;
  let fg = null;
  let bg = null;
  switch (p) {
    case "f":
      chars = "\u2588\u2588";
      fg = face;
      break;
    case "l":
      chars = flipped ? " \u2590" : "\u258C ";
      fg = face;
      break;
    case "a":
      chars = "\u2584\u2584";
      fg = face;
      break;
    case "e":
    case "d":
      chars = "\u2588\u2588";
      fg = dark;
      break;
    case "s":
      chars = "\u2584\u2584";
      fg = dark;
      bg = face;
      break;
    case "n":
      chars = "\u2590\u258C";
      fg = dark;
      bg = face;
      break;
    case "m":
      chars = "\u2580\u2580";
      fg = dark;
      bg = face;
      break;
    case "q":
      chars = flipped ? "\u2596 " : " \u2597";
      fg = dark;
      bg = face;
      break;
    case "r":
      chars = flipped ? " \u2597" : "\u2596 ";
      fg = dark;
      bg = face;
      break;
    case "h":
      chars = "\u2588\u2588";
      fg = hat;
      break;
    case "k":
      chars = "\u2590\u258C";
      fg = hat;
      break;
    default:
      return null;
  }
  return { chars, fg, bg };
}
function allocBuffer() {
  buffer = [];
  for (let y = 0; y < rows; y++) {
    buffer[y] = [];
    for (let x = 0; x < cols; x++) {
      buffer[y][x] = { ch: " ", fg: null, bg: null };
    }
  }
}
function clearBuffer() {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = buffer[y][x];
      c.ch = " ";
      c.fg = null;
      c.bg = null;
    }
  }
}
function stampEntity(e) {
  const grid = generateGrid(e.traits, e.walkFrame, e.talkFrame, e.waveFrame);
  const rendered = e.flipped ? grid.map((row) => [...row].reverse()) : grid;
  for (let gy = 0; gy < rendered.length; gy++) {
    const row = rendered[gy];
    for (let gx = 0; gx < row.length; gx++) {
      const pixel = row[gx];
      if (pixel === "_") continue;
      const result = pixelCell(pixel, e.faceRgb, e.darkRgb, e.hatRgb, e.flipped);
      if (!result) continue;
      const sx = e.x + gx * 2;
      const sy = e.y + gy;
      if (sy < 0 || sy >= rows) continue;
      for (let ci = 0; ci < 2; ci++) {
        const bx = sx + ci;
        if (bx < 0 || bx >= cols) continue;
        buffer[sy][bx] = {
          ch: result.chars[ci],
          fg: result.fg,
          bg: result.bg
        };
      }
    }
  }
  const shadowY = e.y + rendered.length;
  if (shadowY >= 0 && shadowY < rows) {
    let minC = 9, maxC = 0;
    for (const row of rendered) {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== "_") {
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }
    const shadowFg = [50, 50, 50];
    for (let gx = minC; gx <= maxC; gx++) {
      const sx = e.x + gx * 2;
      for (let ci = 0; ci < 2; ci++) {
        const bx = sx + ci;
        if (bx >= 0 && bx < cols) {
          buffer[shadowY][bx] = { ch: "\u2591", fg: shadowFg, bg: null };
        }
      }
    }
  }
}
function renderBuffer() {
  let out = "\x1B[H";
  let lastFg = null;
  let lastBg = null;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = buffer[y][x];
      const fgStr = cell.fg ? `\x1B[38;2;${cell.fg[0]};${cell.fg[1]};${cell.fg[2]}m` : null;
      const bgStr = cell.bg ? `\x1B[48;2;${cell.bg[0]};${cell.bg[1]};${cell.bg[2]}m` : null;
      if (cell.fg || cell.bg) {
        if (fgStr !== lastFg || bgStr !== lastBg) {
          out += "\x1B[0m";
          if (fgStr) out += fgStr;
          if (bgStr) out += bgStr;
          lastFg = fgStr;
          lastBg = bgStr;
        }
      } else if (lastFg || lastBg) {
        out += "\x1B[0m";
        lastFg = null;
        lastBg = null;
      }
      out += cell.ch;
    }
  }
  if (lastFg || lastBg) out += "\x1B[0m";
  stdout.write(out);
}
function stampUI(hud) {
  const borderFg = [80, 80, 80];
  for (let x = 0; x < cols; x++) {
    buffer[0][x] = { ch: x === 0 ? "\u256D" : x === cols - 1 ? "\u256E" : "\u2500", fg: borderFg, bg: null };
    buffer[rows - 1][x] = { ch: x === 0 ? "\u2570" : x === cols - 1 ? "\u256F" : "\u2500", fg: borderFg, bg: null };
  }
  for (let y = 1; y < rows - 1; y++) {
    buffer[y][0] = { ch: "\u2502", fg: borderFg, bg: null };
    buffer[y][cols - 1] = { ch: "\u2502", fg: borderFg, bg: null };
  }
  const dimFg = [120, 120, 120];
  const activeFg = [255, 220, 80];
  let cx = 2;
  for (const seg of hud) {
    const fg = seg.fg ?? (seg.active ? activeFg : dimFg);
    for (const ch of seg.text) {
      if (cx < cols - 1) {
        buffer[rows - 1][cx] = { ch, fg, bg: null };
        cx++;
      }
    }
  }
}
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = seed.charCodeAt(i) + ((h << 5) - h);
  }
  h = Math.abs(h);
  return () => {
    h = Math.imul(h ^ h >>> 16, 73244475);
    h = Math.imul(h ^ h >>> 13, 73244475);
    h = (h ^ h >>> 16) >>> 0;
    return h / 4294967296;
  };
}
function resolvePlayerDna() {
  if (!argDna) return generateRandomDNA();
  if (/^[0-9a-f]{6,7}$/i.test(argDna)) return argDna.toLowerCase();
  return encodeDNA(traitsFromName(argDna));
}
function generateNpcDNAs(count, playerHue, rng2) {
  const hues = Array.from({ length: 12 }, (_, i) => i).filter((h) => h !== playerHue);
  for (let i = hues.length - 1; i > 0; i--) {
    const j = Math.floor(rng2() * (i + 1));
    [hues[i], hues[j]] = [hues[j], hues[i]];
  }
  return Array.from({ length: count }, (_, i) => {
    const traits2 = {
      eyes: Math.floor(rng2() * 11),
      mouth: Math.floor(rng2() * 7),
      hat: Math.floor(rng2() * HATS.length),
      body: Math.floor(rng2() * 6),
      legs: Math.floor(rng2() * 6),
      faceHue: hues[i % hues.length],
      hatHue: Math.floor(rng2() * 12)
    };
    return encodeDNA(traits2);
  });
}
function startMoving() {
  isMoving = true;
  player.walking = true;
  if (moveStopTimer) clearTimeout(moveStopTimer);
  moveStopTimer = setTimeout(() => {
    isMoving = false;
    player.walking = false;
    player.walkFrame = 0;
  }, 400);
}
function updateAnimations() {
  tick++;
  if (tick % 12 === 0) {
    for (const e of [...npcs, player]) {
      if (e.walking) {
        e.walkFrame = (e.walkFrame + 1) % e.legFrames;
      }
    }
  }
  if (tick % 6 === 0) {
    for (const e of [...npcs, player]) {
      if (e.talking) {
        e.talkFrame = (e.talkFrame + 1) % 2;
      }
    }
  }
  if (tick % 18 === 0) {
    for (const e of [...npcs, player]) {
      if (e.waving) {
        e.waveFrame = e.waveFrame === 1 ? 2 : 1;
      }
    }
  }
  if (tick % 75 === 0) {
    for (const e of [...npcs, player]) {
      if (e.idle || !e.walking && !e.talking && !e.waving) {
        e.walkFrame = (e.walkFrame + 1) % e.legFrames;
      }
    }
  }
  for (const e of [...npcs, player]) {
    if (!e.talking && (e.idle || !e.walking && !e.waving)) {
      if (Math.random() < 0.03) {
        e.talkFrame = 1;
      } else if (e.talkFrame === 1 && Math.random() < 0.3) {
        e.talkFrame = 0;
      }
    }
  }
  for (const npc of npcs) {
    if (npc.idleTicks != null && npc.idleTicks > 0) {
      npc.idleTicks--;
      npc.walking = false;
      npc.idle = true;
      continue;
    }
    if (npc.targetX == null || npc.targetY == null) {
      npc.targetX = 4 + Math.floor(Math.random() * (cols - 30));
      npc.targetY = 2 + Math.floor(Math.random() * (rows - 16));
      npc.walking = true;
      npc.idle = false;
      npc.talking = Math.random() < 0.2;
      npc.waving = Math.random() < 0.15;
      if (npc.waving) npc.waveFrame = 1;
    }
    if (tick % 3 === 0) {
      const dx = npc.targetX - npc.x;
      const dy = npc.targetY - npc.y;
      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 1) {
        npc.targetX = void 0;
        npc.targetY = void 0;
        npc.walking = false;
        npc.talking = false;
        npc.waving = false;
        npc.waveFrame = 0;
        npc.talkFrame = 0;
        npc.idle = true;
        npc.idleTicks = Math.floor(60 + Math.random() * 150);
      } else {
        if (Math.abs(dx) > 2) {
          npc.x += dx > 0 ? 2 : -2;
          npc.flipped = dx < 0;
        }
        if (Math.abs(dy) > 1) {
          npc.y += dy > 0 ? 1 : -1;
        }
      }
    }
  }
}
function buildHud() {
  return [
    { text: " \u2588\u2588 ", fg: player.faceRgb },
    { text: `${playerDna} ` },
    { text: `| room: ${roomLabel} ` },
    { text: "| Arrows: move " },
    { text: "| " },
    { text: "[T]alk", active: player.talking },
    { text: " | " },
    { text: "[W]ave", active: player.waving },
    { text: " | Q: quit " }
  ];
}
function frame() {
  updateAnimations();
  clearBuffer();
  const all = [...npcs, player].sort((a, b) => a.y + a.height - (b.y + b.height));
  for (const entity of all) {
    stampEntity(entity);
  }
  stampUI(buildHud());
  renderBuffer();
}
var rawArgs, positional, argDna, argRoom, stdout, cols, rows, stdin, buffer, playerDna, playerTraits, rng, npcDNAs, player, npcs, isMoving, moveStopTimer, tick, roomLabel;
var init_game = __esm({
  "src/game.ts"() {
    init_index();
    rawArgs = process.argv.slice(2);
    positional = [];
    for (const a of rawArgs) {
      if (!a.startsWith("-")) positional.push(a);
    }
    argDna = positional[0] || null;
    argRoom = positional[1] || null;
    stdout = process.stdout;
    cols = stdout.columns || 80;
    rows = stdout.rows || 24;
    stdout.write("\x1B[?1049h\x1B[?25l");
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    buffer = [];
    allocBuffer();
    stdout.on("resize", () => {
      cols = stdout.columns || 80;
      rows = stdout.rows || 24;
      allocBuffer();
      stdout.write("\x1B[2J");
      player.x = Math.min(player.x, cols - 20);
      player.y = Math.min(player.y, rows - player.height - 2);
    });
    playerDna = resolvePlayerDna();
    playerTraits = decodeDNA(playerDna);
    rng = seededRandom(argRoom ?? "default");
    npcDNAs = generateNpcDNAs(5, playerTraits.faceHue, rng);
    player = makeEntity(playerDna, Math.floor(cols / 2) - 9, Math.floor(rows / 2) - 5);
    npcs = Array.from({ length: 5 }, (_, i) => {
      const x = 4 + Math.floor(rng() * (cols - 30));
      const y = 2 + Math.floor(rng() * (rows - 16));
      const e = makeEntity(npcDNAs[i], x, y, { idle: true });
      e.idleTicks = Math.floor(30 + Math.random() * 90);
      return e;
    });
    isMoving = false;
    moveStopTimer = null;
    stdin.on("data", (key) => {
      if (key === "q" || key === "") cleanup();
      const step = 2;
      if (key === "\x1B[A") {
        player.y = Math.max(1, player.y - 1);
        startMoving();
      } else if (key === "\x1B[B") {
        player.y = Math.min(rows - player.height - 2, player.y + 1);
        startMoving();
      } else if (key === "\x1B[D") {
        player.x = Math.max(2, player.x - step);
        player.flipped = true;
        startMoving();
      } else if (key === "\x1B[C") {
        player.x = Math.min(cols - 20, player.x + step);
        player.flipped = false;
        startMoving();
      } else if (key === "t") {
        player.talking = !player.talking;
        if (!player.talking) player.talkFrame = 0;
      } else if (key === "w") {
        player.waving = !player.waving;
        if (!player.waving) player.waveFrame = 0;
        else player.waveFrame = 1;
      }
    });
    tick = 0;
    roomLabel = argRoom ?? "default";
    setInterval(frame, 33);
  }
});

// src/cli.ts
init_index();
var args = process.argv.slice(2);
var flags = /* @__PURE__ */ new Set();
var opts = {};
var input;
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
  <name>      Any string \u2014 generates deterministic avatar

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
  --play           Launch interactive game mode
  --info           Show DNA traits info
  --help           Show this help`);
  process.exit(0);
}
if (flags.has("play")) {
  await Promise.resolve().then(() => (init_game(), game_exports));
  await new Promise(() => {
  });
}
if (flags.has("random") || !input) {
  input = generateRandomDNA();
}
var isDNA = /^[0-9a-f]{6,7}$/i.test(input);
var dna = isDNA ? input : encodeDNA(traitsFromName(input));
var DIM = "\x1B[2m";
var RESET = "\x1B[0m";
if (!isDNA) {
  console.log(`${DIM}"${input}" \u2192 dna: ${dna}${RESET}
`);
} else {
  console.log(`${DIM}dna: ${dna}${RESET}
`);
}
var bw = flags.has("bw");
if (flags.has("info")) {
  const traits2 = decodeDNA(dna);
  console.log("Traits:", JSON.stringify(traits2, null, 2));
  console.log();
}
if (flags.has("svg")) {
  const size = opts.size ? parseInt(opts.size, 10) : 10;
  const padding = opts.padding !== void 0 ? parseInt(opts.padding, 10) : 1;
  const bg = opts.bg === "none" || !opts.bg ? null : opts.bg;
  if (flags.has("animated")) {
    const { svg, legFrames } = renderLayeredSVG(dna, size, bw);
    const css = getAvatarCSS();
    const classes = ["tg-avatar"];
    if (flags.has("walk")) classes.push("walking");
    if (flags.has("talk")) classes.push("talking");
    if (flags.has("wave")) classes.push("waving");
    if (legFrames === 3) classes.push("walk-3f");
    if (legFrames === 4) classes.push("walk-4f");
    if (!flags.has("walk") && !flags.has("talk") && !flags.has("wave")) classes.push("idle");
    const animated = svg.replace("<svg ", `<svg class="${classes.join(" ")}" `).replace("</svg>", `<style>${css}</style></svg>`);
    if (bg) {
      const insertIdx = animated.indexOf(">") + 1;
      const widthMatch = animated.match(/width="(\d+)"/);
      const heightMatch = animated.match(/height="(\d+)"/);
      const w = widthMatch?.[1] ?? "90";
      const h = heightMatch?.[1] ?? "90";
      console.log(
        animated.slice(0, insertIdx) + `<rect width="${w}" height="${h}" fill="${bg}"/>` + animated.slice(insertIdx)
      );
    } else {
      console.log(animated);
    }
  } else {
    console.log(renderSVG(dna, size, 0, bg, padding, bw));
  }
  process.exit(0);
}
if (flags.has("mp4")) {
  let hexToRgb = function(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }, gridToPPM = function(grid) {
    const rows2 = grid.length;
    const w = (cols2 + padding * 2) * size;
    const h = (rows2 + padding * 2) * size;
    const pixels = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      if (bg) {
        pixels[i * 3] = bgRgb[0];
        pixels[i * 3 + 1] = bgRgb[1];
        pixels[i * 3 + 2] = bgRgb[2];
      }
    }
    function fillRect(rx, ry, rw, rh, r, g, b) {
      for (let py = ry; py < ry + rh && py < h; py++) {
        for (let px = rx; px < rx + rw && px < w; px++) {
          const idx = (py * w + px) * 3;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
        }
      }
    }
    for (let y = 0; y < rows2; y++) {
      for (let x = 0; x < cols2; x++) {
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
        else if (cell === "s") {
          fillRect(rx, ry, size, size, fR, fG, fB);
          fillRect(rx, ry + half, size, half, dR, dG, dB);
        } else if (cell === "n") {
          fillRect(rx, ry, size, size, fR, fG, fB);
          fillRect(rx + quarter, ry, half, size, dR, dG, dB);
        } else if (cell === "m") {
          fillRect(rx, ry, size, size, fR, fG, fB);
          fillRect(rx, ry, size, half, dR, dG, dB);
        } else if (cell === "q") {
          fillRect(rx, ry, size, size, fR, fG, fB);
          fillRect(rx + half, ry + half, half, half, dR, dG, dB);
        } else if (cell === "r") {
          fillRect(rx, ry, size, size, fR, fG, fB);
          fillRect(rx, ry + half, half, half, dR, dG, dB);
        } else if (cell === "h") fillRect(rx, ry, size, size, hR, hG, hB);
        else if (cell === "k") {
          fillRect(rx, ry, size, size, fR, fG, fB);
          fillRect(rx + quarter, ry, half, size, hR, hG, hB);
        }
      }
    }
    const header = `P6
${w} ${h}
255
`;
    return Buffer.concat([Buffer.from(header), pixels]);
  };
  const { execSync, execFileSync } = await import("child_process");
  const { mkdirSync, writeFileSync, rmSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
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
  const padding = opts.padding !== void 0 ? parseInt(opts.padding, 10) : 1;
  const bg = opts.bg === "none" ? null : opts.bg || "#000";
  const doWalk = flags.has("walk");
  const doTalk = flags.has("talk");
  const doWave = flags.has("wave");
  const { faceRgb: faceRgbMp4, darkRgb: darkRgbMp4, hatRgb: hatRgbMp4 } = getTraitColors(mp4Traits, bw);
  const cols2 = 9;
  const half = Math.round(size / 2);
  const quarter = Math.round(size / 4);
  const bgRgb = bg ? hexToRgb(bg) : [0, 0, 0];
  const tmpDir = join(tmpdir(), `termlings-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  console.log(`Generating ${totalFrames} frames...`);
  for (let f = 0; f < totalFrames; f++) {
    const walkF = doWalk ? f % mp4LegFrames : 0;
    const talkF = doTalk ? f % 2 : 0;
    const waveF = doWave ? f % 2 + 1 : 0;
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
var animate = flags.has("walk") || flags.has("talk") || flags.has("wave");
var compact = flags.has("compact");
if (!animate) {
  const output = compact ? renderTerminalSmall(dna, 0, bw) : renderTerminal(dna, 0, bw);
  console.log(output);
  process.exit(0);
}
var traits = decodeDNA(dna);
var legFrameCount = LEGS[traits.legs].length;
var { faceRgb, darkRgb, hatRgb } = getTraitColors(traits, bw);
var walkFrame = 0;
var talkFrame = 0;
var waveFrame = 0;
var tick2 = 0;
process.stdout.write("\x1B[?25l");
function cleanup2() {
  process.stdout.write("\x1B[?25h\n");
  process.exit(0);
}
process.on("SIGINT", cleanup2);
process.on("SIGTERM", cleanup2);
var firstGrid = generateGrid(traits, 0, 0, 0);
var firstOutput = compact ? renderSmallFromGrid(firstGrid) : renderFromGrid(firstGrid);
var lineCount = firstOutput.split("\n").length;
process.stdout.write(firstOutput + "\n");
setInterval(() => {
  tick2++;
  if (flags.has("walk")) walkFrame = tick2 % legFrameCount;
  if (flags.has("talk")) talkFrame = tick2 % 2;
  if (flags.has("wave")) waveFrame = tick2 % 2 + 1;
  const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);
  const output = compact ? renderSmallFromGrid(grid) : renderFromGrid(grid);
  process.stdout.write(`\x1B[${lineCount}A`);
  process.stdout.write(output + "\n");
}, 300);
function renderFromGrid(grid) {
  const faceAnsi = `\x1B[38;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;
  const darkAnsi = `\x1B[38;2;${darkRgb[0]};${darkRgb[1]};${darkRgb[2]}m`;
  const hatAnsi = `\x1B[38;2;${hatRgb[0]};${hatRgb[1]};${hatRgb[2]}m`;
  const reset = "\x1B[0m";
  const faceBg = `\x1B[48;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;
  const lines = [];
  for (const row of grid) {
    let line = "";
    for (const cell of row) {
      if (cell === "_") line += "  ";
      else if (cell === "f") line += `${faceAnsi}\u2588\u2588${reset}`;
      else if (cell === "l") line += `${faceAnsi}\u258C${reset} `;
      else if (cell === "e" || cell === "d") line += `${darkAnsi}\u2588\u2588${reset}`;
      else if (cell === "s") line += `${darkAnsi}${faceBg}\u2584\u2584${reset}`;
      else if (cell === "n") line += `${darkAnsi}${faceBg}\u2590\u258C${reset}`;
      else if (cell === "m") line += `${darkAnsi}${faceBg}\u2580\u2580${reset}`;
      else if (cell === "q") line += `${darkAnsi}${faceBg} \u2597${reset}`;
      else if (cell === "r") line += `${darkAnsi}${faceBg}\u2596 ${reset}`;
      else if (cell === "a") line += `${faceAnsi}\u2584\u2584${reset}`;
      else if (cell === "h") line += `${hatAnsi}\u2588\u2588${reset}`;
      else if (cell === "k") line += `${hatAnsi}\u2590\u258C${reset}`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}
function renderSmallFromGrid(grid) {
  const reset = "\x1B[0m";
  function cellRgb(cell) {
    if (cell === "f" || cell === "l" || cell === "a" || cell === "q" || cell === "r") return faceRgb;
    if (cell === "e" || cell === "s" || cell === "n" || cell === "d" || cell === "m") return darkRgb;
    if (cell === "h" || cell === "k") return hatRgb;
    return null;
  }
  const lines = [];
  for (let r = 0; r < grid.length; r += 2) {
    const topRow = grid[r];
    const botRow = r + 1 < grid.length ? grid[r + 1] : null;
    let line = "";
    for (let c = 0; c < topRow.length; c++) {
      const top = cellRgb(topRow[c]);
      const bot = botRow ? cellRgb(botRow[c]) : null;
      if (top && bot) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m\x1B[48;2;${bot[0]};${bot[1]};${bot[2]}m\u2580${reset}`;
      } else if (top) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m\u2580${reset}`;
      } else if (bot) {
        line += `\x1B[38;2;${bot[0]};${bot[1]};${bot[2]}m\u2584${reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}
