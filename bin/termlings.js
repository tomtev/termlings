#!/usr/bin/env node

// packages/termlings/src/index.ts
var F = ["_", "f", "f", "f", "f", "f", "f", "f", "_"];
var EYES = [
  ["_", "f", "e", "f", "f", "f", "e", "f", "_"],
  ["_", "e", "f", "f", "f", "f", "f", "e", "_"],
  ["_", "f", "f", "e", "f", "e", "f", "f", "_"],
  ["_", "f", "e", "f", "f", "f", "e", "f", "_"],
  ["_", "e", "e", "f", "f", "f", "e", "e", "_"],
  ["_", "f", "e", "e", "f", "e", "e", "f", "_"],
  ["_", "f", "s", "f", "f", "f", "s", "f", "_"],
  ["_", "s", "f", "f", "f", "f", "f", "s", "_"],
  ["_", "f", "n", "f", "f", "f", "n", "f", "_"],
  ["_", "n", "f", "f", "f", "f", "f", "n", "_"],
  ["_", "f", "f", "n", "f", "n", "f", "f", "_"]
];
var MOUTHS = [
  [
    ["_", "f", "q", "f", "f", "f", "r", "f", "_"],
    ["_", "f", "f", "m", "m", "m", "f", "f", "_"]
  ],
  [
    ["_", "f", "q", "f", "f", "f", "f", "f", "_"],
    ["_", "f", "f", "m", "m", "m", "f", "f", "_"]
  ],
  [
    ["_", "f", "f", "f", "f", "f", "r", "f", "_"],
    ["_", "f", "f", "m", "m", "m", "f", "f", "_"]
  ],
  [
    ["_", "f", "f", "q", "f", "r", "f", "f", "_"],
    ["_", "f", "f", "f", "m", "f", "f", "f", "_"]
  ],
  [
    ["_", "q", "f", "f", "f", "f", "f", "r", "_"],
    ["_", "f", "m", "m", "m", "m", "m", "f", "_"]
  ],
  [
    ["_", "q", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "f", "m", "m", "m", "m", "m", "f", "_"]
  ],
  [
    ["_", "f", "f", "f", "f", "f", "f", "r", "_"],
    ["_", "f", "m", "m", "m", "m", "m", "f", "_"]
  ]
];
var HATS = [
  [],
  [
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
  ],
  [
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"]
  ],
  [
    ["_", "_", "h", "_", "h", "_", "h", "_", "_"],
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"]
  ],
  [
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
    ["h", "h", "h", "h", "h", "h", "h", "_", "_"]
  ],
  [
    ["_", "h", "_", "_", "_", "_", "_", "h", "_"],
    ["_", "h", "h", "_", "_", "_", "h", "h", "_"]
  ],
  [
    ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"]
  ],
  [
    ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
    ["_", "_", "_", "_", "h", "_", "_", "_", "_"]
  ],
  [
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"]
  ],
  [
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
  ],
  [
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
    ["h", "h", "h", "h", "h", "h", "h", "h", "h"]
  ],
  [
    ["_", "_", "_", "_", "k", "_", "_", "_", "_"],
    ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"]
  ],
  [
    ["_", "h", "h", "_", "_", "_", "h", "h", "_"]
  ],
  [
    ["_", "h", "_", "h", "_", "h", "_", "h", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
  ],
  [
    ["_", "_", "_", "_", "h", "_", "_", "_", "_"],
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"]
  ],
  [
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
  ],
  [
    ["_", "_", "k", "h", "h", "h", "k", "_", "_"],
    ["_", "k", "h", "h", "h", "h", "h", "k", "_"]
  ],
  [
    ["_", "_", "_", "_", "h", "h", "h", "k", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"]
  ],
  [
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
    ["h", "h", "h", "h", "h", "h", "h", "h", "h"]
  ],
  [
    ["_", "_", "_", "h", "h", "h", "_", "_", "_"],
    ["_", "_", "h", "h", "h", "h", "h", "_", "_"],
    ["_", "h", "f", "h", "f", "h", "f", "h", "_"]
  ],
  [
    ["h", "h", "_", "_", "_", "_", "_", "h", "h"],
    ["h", "h", "h", "_", "_", "_", "h", "h", "h"]
  ],
  [
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
    ["_", "h", "h", "h", "h", "h", "h", "h", "_"],
    ["_", "d", "d", "d", "d", "d", "d", "d", "_"],
    ["h", "h", "h", "h", "h", "h", "h", "h", "h"]
  ]
];
var BODIES = [
  [
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"]
  ],
  [
    ["a", "f", "f", "f", "f", "f", "f", "f", "a"],
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"]
  ],
  [
    ["_", "_", "f", "f", "f", "f", "f", "_", "_"],
    ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
  ],
  [
    ["_", "a", "f", "f", "f", "f", "f", "a", "_"],
    ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
  ],
  [
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
  ],
  [
    ["a", "f", "f", "f", "f", "f", "f", "f", "a"],
    ["_", "_", "f", "f", "f", "f", "f", "_", "_"]
  ]
];
var LEGS = [
  [
    ["_", "_", "f", "_", "_", "f", "_", "_", "_"],
    ["_", "f", "_", "_", "_", "_", "f", "_", "_"]
  ],
  [
    ["_", "_", "l", "_", "_", "_", "_", "l", "_"],
    ["_", "_", "_", "l", "_", "l", "_", "_", "_"]
  ],
  [
    ["_", "f", "_", "l", "_", "l", "_", "f", "_"],
    ["_", "f", "_", "f", "_", "l", "_", "f", "_"],
    ["_", "f", "_", "l", "_", "f", "_", "f", "_"]
  ],
  [
    ["_", "_", "l", "_", "_", "_", "l", "_", "_"],
    ["_", "_", "_", "l", "_", "l", "_", "_", "_"]
  ],
  [
    ["_", "f", "_", "_", "_", "_", "_", "f", "_"],
    ["_", "_", "f", "_", "_", "_", "f", "_", "_"]
  ],
  [
    ["_", "_", "_", "l", "_", "l", "_", "_", "_"],
    ["_", "_", "l", "_", "_", "_", "l", "_", "_"]
  ]
];
var SLOTS = {
  eyes: 12,
  mouths: 12,
  hats: 24,
  bodies: 8,
  legs: 8,
  hues: 12
};
function encodeDNA(traits) {
  let n = traits.hatHue;
  n += traits.faceHue * SLOTS.hues;
  n += traits.legs * SLOTS.hues * SLOTS.hues;
  n += traits.body * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  n += traits.hat * SLOTS.bodies * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  n += traits.mouth * SLOTS.hats * SLOTS.bodies * SLOTS.legs * SLOTS.hues * SLOTS.hues;
  n += traits.eyes * SLOTS.mouths * SLOTS.hats * SLOTS.bodies * SLOTS.legs * SLOTS.hues * SLOTS.hues;
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
  for (let i = 0;i < name.length; i++) {
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
var WAVE_FRAMES = [
  [
    ["a", "f", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "f", "f", "f", "f", "f", "f", "f", "a"]
  ],
  [
    ["_", "f", "f", "f", "f", "f", "f", "f", "a"],
    ["a", "f", "f", "f", "f", "f", "f", "f", "_"]
  ]
];
var TALK_FRAMES = [
  [
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "f", "f", "d", "d", "d", "f", "f", "_"]
  ]
];
function generateGrid(traits, frame = 0, talkFrame = 0, waveFrame = 0) {
  const legFrames = LEGS[traits.legs];
  const legRow = legFrames[frame % legFrames.length];
  const mouthRows = talkFrame === 0 ? MOUTHS[traits.mouth] : TALK_FRAMES[(talkFrame - 1) % TALK_FRAMES.length];
  const bodyRows = waveFrame === 0 ? BODIES[traits.body] : WAVE_FRAMES[(waveFrame - 1) % WAVE_FRAMES.length];
  return [
    ...HATS[traits.hat],
    F,
    EYES[traits.eyes],
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
function renderSVG(dna, pixelSize = 10, frame = 0, background = "#000") {
  const traits = decodeDNA(dna);
  const grid = generateGrid(traits, frame);
  const faceHueDeg = traits.faceHue * 30;
  const hatHueDeg = traits.hatHue * 30;
  const faceRgb = hslToRgb(faceHueDeg, 0.5, 0.5);
  const darkRgb = hslToRgb(faceHueDeg, 0.5, 0.28);
  const hatRgb = hslToRgb(hatHueDeg, 0.5, 0.5);
  const toHex = (r, g, b) => `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const faceHex = toHex(...faceRgb);
  const darkHex = toHex(...darkRgb);
  const hatHex = toHex(...hatRgb);
  const cols = 9;
  const rows = grid.length;
  const pad = 1;
  const w = (cols + pad * 2) * pixelSize;
  const h = (rows + pad * 2) * pixelSize;
  const half = Math.round(pixelSize / 2);
  const quarter = Math.round(pixelSize / 4);
  const rects = [];
  for (let y = 0;y < rows; y++) {
    for (let x = 0;x < cols; x++) {
      const cell = grid[y][x];
      const rx = (x + pad) * pixelSize;
      const ry = (y + pad) * pixelSize;
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
  const bg = background ? `<rect width="${w}" height="${h}" fill="${background}"/>
` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">
${bg}${rects.join(`
`)}
</svg>`;
}
function renderTerminal(dna, frame = 0) {
  const traits = decodeDNA(dna);
  const grid = generateGrid(traits, frame);
  const faceHueDeg = traits.faceHue * 30;
  const hatHueDeg = traits.hatHue * 30;
  const faceRgb = hslToRgb(faceHueDeg, 0.5, 0.5);
  const darkRgb = hslToRgb(faceHueDeg, 0.5, 0.28);
  const hatRgb = hslToRgb(hatHueDeg, 0.5, 0.5);
  const faceAnsi = `\x1B[38;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;
  const darkAnsi = `\x1B[38;2;${darkRgb[0]};${darkRgb[1]};${darkRgb[2]}m`;
  const hatAnsi = `\x1B[38;2;${hatRgb[0]};${hatRgb[1]};${hatRgb[2]}m`;
  const reset = "\x1B[0m";
  const faceBg = `\x1B[48;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;
  const lines = [];
  for (const row of grid) {
    let line = "";
    for (const cell of row) {
      if (cell === "_") {
        line += "  ";
      } else if (cell === "f") {
        line += `${faceAnsi}██${reset}`;
      } else if (cell === "l") {
        line += `${faceAnsi}▌${reset} `;
      } else if (cell === "e" || cell === "d") {
        line += `${darkAnsi}██${reset}`;
      } else if (cell === "s") {
        line += `${darkAnsi}${faceBg}▄▄${reset}`;
      } else if (cell === "n") {
        line += `${darkAnsi}${faceBg}▐▌${reset}`;
      } else if (cell === "m") {
        line += `${darkAnsi}${faceBg}▀▀${reset}`;
      } else if (cell === "q") {
        line += `${darkAnsi}${faceBg} ▗${reset}`;
      } else if (cell === "r") {
        line += `${darkAnsi}${faceBg}▖ ${reset}`;
      } else if (cell === "a") {
        line += `${faceAnsi}▄▄${reset}`;
      } else if (cell === "h") {
        line += `${hatAnsi}██${reset}`;
      } else if (cell === "k") {
        line += `${hatAnsi}▐▌${reset}`;
      }
    }
    lines.push(line);
  }
  return lines.join(`
`);
}
function renderLayeredSVG(dna, pixelSize = 10) {
  const traits = decodeDNA(dna);
  const faceHueDeg = traits.faceHue * 30;
  const hatHueDeg = traits.hatHue * 30;
  const faceRgb = hslToRgb(faceHueDeg, 0.5, 0.5);
  const darkRgb = hslToRgb(faceHueDeg, 0.5, 0.28);
  const hatRgb = hslToRgb(hatHueDeg, 0.5, 0.5);
  const toHex = (r, g, b) => `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const faceHex = toHex(...faceRgb);
  const darkHex = toHex(...darkRgb);
  const hatHex = toHex(...hatRgb);
  const half = Math.round(pixelSize / 2);
  const quarter = Math.round(pixelSize / 4);
  const cols = 9;
  const hatRows = HATS[traits.hat];
  const mouthNormal = MOUTHS[traits.mouth];
  const mouthTalk = TALK_FRAMES[0];
  const bodyNormal = BODIES[traits.body];
  const waveF1 = WAVE_FRAMES[0];
  const waveF2 = WAVE_FRAMES[1];
  const legVariant = LEGS[traits.legs];
  const legFrameCount = legVariant.length;
  const totalRows = hatRows.length + 1 + 1 + 2 + 2 + 1;
  const w = cols * pixelSize;
  const h = totalRows * pixelSize;
  function px(cell, rx, ry) {
    if (cell === "_")
      return "";
    if (cell === "f")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/>`;
    if (cell === "l")
      return `<rect x="${rx}" y="${ry}" width="${half}" height="${pixelSize}" fill="${faceHex}"/>`;
    if (cell === "a")
      return `<rect x="${rx}" y="${ry + half}" width="${pixelSize}" height="${half}" fill="${faceHex}"/>`;
    if (cell === "e" || cell === "d")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${darkHex}"/>`;
    if (cell === "s")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx}" y="${ry + half}" width="${pixelSize}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "n")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx + quarter}" y="${ry}" width="${half}" height="${pixelSize}" fill="${darkHex}"/>`;
    if (cell === "m")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx}" y="${ry}" width="${pixelSize}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "q")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx + half}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "r")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${faceHex}"/><rect x="${rx}" y="${ry + half}" width="${half}" height="${half}" fill="${darkHex}"/>`;
    if (cell === "h" || cell === "k")
      return `<rect x="${rx}" y="${ry}" width="${pixelSize}" height="${pixelSize}" fill="${hatHex}"/>`;
    return "";
  }
  function renderRows(rows, startY) {
    let out = "";
    for (let y = 0;y < rows.length; y++) {
      for (let x = 0;x < cols; x++) {
        out += px(rows[y][x], x * pixelSize, (startY + y) * pixelSize);
      }
    }
    return out;
  }
  const staticRects = renderRows([...hatRows, F, EYES[traits.eyes]], 0);
  const mY = hatRows.length + 2;
  const mouth0 = renderRows(mouthNormal, mY);
  const mouth1 = renderRows(mouthTalk, mY);
  const bY = mY + 2;
  const body0 = renderRows(bodyNormal, bY);
  const body1 = renderRows(waveF1, bY);
  const body2 = renderRows(waveF2, bY);
  const lY = bY + 2;
  const legs0 = renderRows([legVariant[0]], lY);
  const legs1 = legFrameCount > 1 ? renderRows([legVariant[1]], lY) : "";
  const legs2 = legFrameCount > 2 ? renderRows([legVariant[2]], lY) : "";
  const legs3 = legFrameCount > 3 ? renderRows([legVariant[3]], lY) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">` + `<g class="tg-bob">${staticRects}` + `<g class="tg-mouth-0">${mouth0}</g>` + `<g class="tg-mouth-1">${mouth1}</g>` + `<g class="tg-body-0">${body0}</g>` + `<g class="tg-body-1">${body1}</g>` + `<g class="tg-body-2">${body2}</g>` + `</g>` + `<g class="tg-legs-0">${legs0}</g>` + (legs1 ? `<g class="tg-legs-1">${legs1}</g>` : "") + (legs2 ? `<g class="tg-legs-2">${legs2}</g>` : "") + (legs3 ? `<g class="tg-legs-3">${legs3}</g>` : "") + `</svg>`;
  return { svg, legFrames: legFrameCount, rows: totalRows };
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
`;
}
function renderTerminalSmall(dna, frame = 0) {
  const traits = decodeDNA(dna);
  const grid = generateGrid(traits, frame);
  const faceHueDeg = traits.faceHue * 30;
  const hatHueDeg = traits.hatHue * 30;
  const faceRgb = hslToRgb(faceHueDeg, 0.5, 0.5);
  const darkRgb = hslToRgb(faceHueDeg, 0.5, 0.28);
  const hatRgb = hslToRgb(hatHueDeg, 0.5, 0.5);
  function cellRgb(cell) {
    if (cell === "f" || cell === "l" || cell === "a" || cell === "q" || cell === "r")
      return faceRgb;
    if (cell === "e" || cell === "s" || cell === "n" || cell === "d" || cell === "m")
      return darkRgb;
    if (cell === "h" || cell === "k")
      return hatRgb;
    return null;
  }
  const reset = "\x1B[0m";
  const lines = [];
  for (let r = 0;r < grid.length; r += 2) {
    const topRow = grid[r];
    const botRow = r + 1 < grid.length ? grid[r + 1] : null;
    let line = "";
    for (let c = 0;c < topRow.length; c++) {
      const top = cellRgb(topRow[c]);
      const bot = botRow ? cellRgb(botRow[c]) : null;
      if (top && bot) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m\x1B[48;2;${bot[0]};${bot[1]};${bot[2]}m▀${reset}`;
      } else if (top) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m▀${reset}`;
      } else if (bot) {
        line += `\x1B[38;2;${bot[0]};${bot[1]};${bot[2]}m▄${reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join(`
`);
}

// packages/termlings/src/cli.ts
var args = process.argv.slice(2);
var flags = new Set;
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
  --animated       SVG with CSS animation (use with --walk, --talk, --wave)
  --info           Show DNA traits info
  --help           Show this help`);
  process.exit(0);
}
if (flags.has("random") || !input) {
  input = generateRandomDNA();
}
var isDNA = /^[0-9a-f]{6,7}$/i.test(input);
var dna = isDNA ? input : encodeDNA(traitsFromName(input));
var DIM = "\x1B[2m";
var RESET = "\x1B[0m";
if (!isDNA) {
  console.log(`${DIM}"${input}" → dna: ${dna}${RESET}
`);
} else {
  console.log(`${DIM}dna: ${dna}${RESET}
`);
}
if (flags.has("info")) {
  const traits = decodeDNA(dna);
  console.log("Traits:", JSON.stringify(traits, null, 2));
  console.log();
}
if (flags.has("svg")) {
  const size = opts.size ? parseInt(opts.size, 10) : 10;
  const bg = opts.bg === "none" || !opts.bg ? null : opts.bg;
  if (flags.has("animated")) {
    const { svg, legFrames } = renderLayeredSVG(dna, size);
    const css = getAvatarCSS();
    const classes = ["tg-avatar"];
    if (flags.has("walk"))
      classes.push("walking");
    if (flags.has("talk"))
      classes.push("talking");
    if (flags.has("wave"))
      classes.push("waving");
    if (legFrames === 3)
      classes.push("walk-3f");
    if (legFrames === 4)
      classes.push("walk-4f");
    if (!flags.has("walk") && !flags.has("talk") && !flags.has("wave"))
      classes.push("idle");
    const animated = svg.replace("<svg ", `<svg class="${classes.join(" ")}" `).replace("</svg>", `<style>${css}</style></svg>`);
    if (bg) {
      const insertIdx = animated.indexOf(">") + 1;
      const widthMatch = animated.match(/width="(\d+)"/);
      const heightMatch = animated.match(/height="(\d+)"/);
      const w = widthMatch?.[1] ?? "90";
      const h = heightMatch?.[1] ?? "90";
      console.log(animated.slice(0, insertIdx) + `<rect width="${w}" height="${h}" fill="${bg}"/>` + animated.slice(insertIdx));
    } else {
      console.log(animated);
    }
  } else {
    console.log(renderSVG(dna, size, 0, bg));
  }
  process.exit(0);
}
var animate = flags.has("walk") || flags.has("talk") || flags.has("wave");
var compact = flags.has("compact");
if (!animate) {
  const output = compact ? renderTerminalSmall(dna) : renderTerminal(dna);
  console.log(output);
  process.exit(0);
}
var traits = decodeDNA(dna);
var legFrameCount = LEGS[traits.legs].length;
var faceRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.5);
var darkRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.28);
var hatRgb = hslToRgb(traits.hatHue * 30, 0.5, 0.5);
var walkFrame = 0;
var talkFrame = 0;
var waveFrame = 0;
var tick = 0;
process.stdout.write("\x1B[?25l");
function cleanup() {
  process.stdout.write(`\x1B[?25h
`);
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
var firstGrid = generateGrid(traits, 0, 0, 0);
var firstOutput = compact ? renderSmallFromGrid(firstGrid) : renderFromGrid(firstGrid);
var lineCount = firstOutput.split(`
`).length;
process.stdout.write(firstOutput + `
`);
setInterval(() => {
  tick++;
  if (flags.has("walk"))
    walkFrame = tick % legFrameCount;
  if (flags.has("talk"))
    talkFrame = tick % 2;
  if (flags.has("wave"))
    waveFrame = tick % 2 + 1;
  const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);
  const output = compact ? renderSmallFromGrid(grid) : renderFromGrid(grid);
  process.stdout.write(`\x1B[${lineCount}A`);
  process.stdout.write(output + `
`);
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
      if (cell === "_")
        line += "  ";
      else if (cell === "f")
        line += `${faceAnsi}██${reset}`;
      else if (cell === "l")
        line += `${faceAnsi}▌${reset} `;
      else if (cell === "e" || cell === "d")
        line += `${darkAnsi}██${reset}`;
      else if (cell === "s")
        line += `${darkAnsi}${faceBg}▄▄${reset}`;
      else if (cell === "n")
        line += `${darkAnsi}${faceBg}▐▌${reset}`;
      else if (cell === "m")
        line += `${darkAnsi}${faceBg}▀▀${reset}`;
      else if (cell === "q")
        line += `${darkAnsi}${faceBg} ▗${reset}`;
      else if (cell === "r")
        line += `${darkAnsi}${faceBg}▖ ${reset}`;
      else if (cell === "a")
        line += `${faceAnsi}▄▄${reset}`;
      else if (cell === "h")
        line += `${hatAnsi}██${reset}`;
      else if (cell === "k")
        line += `${hatAnsi}▐▌${reset}`;
    }
    lines.push(line);
  }
  return lines.join(`
`);
}
function renderSmallFromGrid(grid) {
  const reset = "\x1B[0m";
  function cellRgb(cell) {
    if (cell === "f" || cell === "l" || cell === "a" || cell === "q" || cell === "r")
      return faceRgb;
    if (cell === "e" || cell === "s" || cell === "n" || cell === "d" || cell === "m")
      return darkRgb;
    if (cell === "h" || cell === "k")
      return hatRgb;
    return null;
  }
  const lines = [];
  for (let r = 0;r < grid.length; r += 2) {
    const topRow = grid[r];
    const botRow = r + 1 < grid.length ? grid[r + 1] : null;
    let line = "";
    for (let c = 0;c < topRow.length; c++) {
      const top = cellRgb(topRow[c]);
      const bot = botRow ? cellRgb(botRow[c]) : null;
      if (top && bot) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m\x1B[48;2;${bot[0]};${bot[1]};${bot[2]}m▀${reset}`;
      } else if (top) {
        line += `\x1B[38;2;${top[0]};${top[1]};${top[2]}m▀${reset}`;
      } else if (bot) {
        line += `\x1B[38;2;${bot[0]};${bot[1]};${bot[2]}m▄${reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join(`
`);
}
