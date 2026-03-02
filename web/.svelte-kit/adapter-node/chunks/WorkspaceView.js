import { h as head, a as attr_class, c as attr_style, d as derived, f as stringify, e as escape_html, i as attr, j as ensure_array_like, b as bind_props } from "./index2.js";
import "@sveltejs/kit/internal";
import "./exports.js";
import "./utils.js";
import "@sveltejs/kit/internal/server";
import "./root.js";
import "./state.svelte.js";
function html(value) {
  var html2 = String(value ?? "");
  var open = "<!---->";
  return open + html2 + "<!---->";
}
const F = ["_", "f", "f", "f", "f", "f", "f", "f", "_"];
const EYES = [
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
const MOUTHS = [
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
const HATS = [
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
const BODIES = [
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
const LEGS = [
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
const SLOTS = {
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
const WAVE_FRAMES = [
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
const TALK_FRAMES = [
  [
    // open mouth (full dark, no corners)
    ["_", "f", "f", "f", "f", "f", "f", "f", "_"],
    ["_", "f", "f", "d", "d", "d", "f", "f", "_"]
  ]
];
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
function getTraitColors(traits, bw = false) {
  if (bw) {
    const fg = hueToGray(traits.faceHue);
    const dg = Math.round(fg * 0.55);
    const bg = Math.round(fg * 0.18);
    const hg = hueToGray(traits.hatHue);
    return {
      faceRgb: [fg, fg, fg],
      darkRgb: [dg, dg, dg],
      hatRgb: [hg, hg, hg],
      bgRgb: [bg, bg, bg]
    };
  }
  const faceHueDeg = traits.faceHue * 30;
  const hatHueDeg = traits.hatHue * 30;
  return {
    faceRgb: hslToRgb(faceHueDeg, 0.5, 0.5),
    darkRgb: hslToRgb(faceHueDeg, 0.5, 0.28),
    hatRgb: hslToRgb(hatHueDeg, 0.5, 0.5),
    bgRgb: hslToRgb(faceHueDeg, 0.5, 0.1)
  };
}
function renderLayeredSVG(dna, pixelSize = 10, bw = false, padding = 0) {
  const traits = decodeDNA(dna);
  const { faceRgb, darkRgb, hatRgb, bgRgb } = getTraitColors(traits, bw);
  const toHex = (r, g, b) => `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const faceHex = toHex(...faceRgb);
  const darkHex = toHex(...darkRgb);
  const hatHex = toHex(...hatRgb);
  const bgHex = toHex(...bgRgb);
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
  const maxRows = 12;
  const pad = padding;
  const side = Math.max(cols, maxRows) + pad * 2;
  const w = side * pixelSize;
  const h = side * pixelSize;
  const oxPx = Math.round((w - cols * pixelSize) / 2);
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
  function renderRows(rows, startY) {
    let out = "";
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < cols; x++) {
        out += px(rows[y][x], x * pixelSize + oxPx, (startY + y) * pixelSize + oyPx);
      }
    }
    return out;
  }
  const eyeY = hatRows.length + 1;
  const mY = hatRows.length + 2;
  const staticRects = renderRows([...hatRows, F], 0) + renderRows([F], eyeY) + renderRows([F, F], mY);
  const eyeRects = renderRows([EYES[traits.eyes]], eyeY);
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><g class="tg-bob">${staticRects}<g class="tg-eyes">${eyeRects}</g><g class="tg-mouth-0">${mouth0}</g><g class="tg-mouth-1">${mouth1}</g><g class="tg-body-0">${body0}</g><g class="tg-body-1">${body1}</g><g class="tg-body-2">${body2}</g></g><g class="tg-legs-0">${legs0}</g>` + (legs1 ? `<g class="tg-legs-1">${legs1}</g>` : "") + (legs2 ? `<g class="tg-legs-2">${legs2}</g>` : "") + (legs3 ? `<g class="tg-legs-3">${legs3}</g>` : "") + `</svg>`;
  return { svg, legFrames: legFrameCount, rows: totalRows, bgHex };
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
function hueToGray(hueIndex) {
  return Math.round(89 + hueIndex / 11 * 77);
}
function Avatar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      dna,
      name,
      size = "lg",
      walking = false,
      talking = false,
      waving = false,
      backside = false,
      bw = false
    } = $$props;
    const resolvedDna = derived(() => dna ?? encodeDNA(traitsFromName(name ?? "agent")));
    const rendered = derived(() => renderLayeredSVG(resolvedDna(), size === "xl" ? 14 : size === "sm" ? 3 : 8, bw));
    const idle = derived(() => !walking && !talking && !waving);
    const idleDelay = Math.random() * 3;
    head("1emibua", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`${html(`<style>${getAvatarCSS()}</style>`)}`);
    });
    $$renderer2.push(`<div${attr_class("tg-avatar svelte-1emibua", void 0, {
      "idle": idle(),
      "walking": walking,
      "talking": talking && !backside,
      "waving": waving,
      "backside": backside,
      "walk-3f": rendered().legFrames === 3,
      "walk-4f": rendered().legFrames === 4,
      "sm": size === "sm"
    })}${attr_style("", { "--tg-idle-delay": `${stringify(idleDelay)}s` })}>${html(rendered().svg)}</div>`);
  });
}
function WorkspaceView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let inboxMessages, dmThreads, topThreads, channelThreads, threads, activeThread, visibleMessages, composerHidden, composerDisabled, calendarEvents;
    let initialPayload = $$props["initialPayload"];
    let initialThreadId = $$props["initialThreadId"];
    let snapshot = initialPayload.snapshot;
    let projects = initialPayload.projects;
    let activeProjectId = initialPayload.activeProjectId;
    let loading = false;
    let activeThreadId = initialThreadId;
    let composeText = "";
    let sessionDnaById = /* @__PURE__ */ new Map();
    let sessionNameById = /* @__PURE__ */ new Map();
    let agentNameByDna = /* @__PURE__ */ new Map();
    let agentByDna = /* @__PURE__ */ new Map();
    let lastReadByThread = /* @__PURE__ */ new Map();
    let unreadDmByThread = /* @__PURE__ */ new Map();
    let onlineDnaSet = /* @__PURE__ */ new Set();
    let ownerInboxSummaries = [];
    let talkingDnaSet = /* @__PURE__ */ new Set();
    let wavingDnaSet = /* @__PURE__ */ new Set();
    const TALK_DURATION_MS = 2e3;
    const WAVE_DURATION_MS = 1500;
    function currentProjectName() {
      return projects.find((project) => project.projectId === activeProjectId)?.projectName ?? snapshot.meta?.projectName ?? "Project";
    }
    function formatTime(ts) {
      return new Date(ts).toLocaleTimeString();
    }
    function formatDateTime(ts) {
      return new Date(ts).toLocaleString();
    }
    function isMine(message) {
      return message.from === "operator";
    }
    function isHumanAddress(id) {
      if (!id) return false;
      return id === "owner" || id === "operator" || id.startsWith("human:");
    }
    function resolveActorName(params) {
      if (params.name && params.name.trim().length > 0) return params.name;
      if (params.dna) {
        const knownAgentName = agentNameByDna.get(params.dna);
        if (knownAgentName) return knownAgentName;
        return params.dna;
      }
      if (!params.id) return params.fallback ?? "Unknown";
      if (isHumanAddress(params.id)) {
        return params.id === "owner" || params.id === "operator" || params.id === "human:default" ? "Operator" : params.id;
      }
      return sessionNameById.get(params.id) ?? params.id;
    }
    function messageFromDna(message) {
      return message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : void 0);
    }
    function messageTargetDna(message) {
      return message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : void 0);
    }
    function isAgentWorkingDna(dna) {
      if (!dna) return false;
      return agentByDna.get(dna)?.typing === true;
    }
    function isTalkingOrWorkingDna(dna) {
      if (!dna) return false;
      return talkingDnaSet.has(dna) || isAgentWorkingDna(dna);
    }
    function messageRoute(message) {
      const fromLabel = resolveActorName({
        id: message.from,
        name: message.fromName,
        dna: messageFromDna(message),
        fallback: "Unknown sender"
      });
      if (message.kind === "dm") {
        const targetLabel = resolveActorName({
          id: message.target,
          name: message.targetName,
          dna: messageTargetDna(message),
          fallback: "Unknown recipient"
        });
        return `${fromLabel} -> ${targetLabel}`;
      }
      if (message.kind === "chat") {
        return `${fromLabel} -> #workspace`;
      }
      return `${fromLabel} -> workspace`;
    }
    function isMessageInDnaThread(message, threadDna) {
      if (message.kind !== "dm") return false;
      const fromDna = messageFromDna(message);
      const targetDna = messageTargetDna(message);
      return fromDna === threadDna || targetDna === threadDna;
    }
    function isIncomingHumanDmForDna(message, threadDna) {
      if (message.kind !== "dm") return false;
      const fromDna = messageFromDna(message);
      if (fromDna !== threadDna) return false;
      return isHumanAddress(message.target);
    }
    function markThreadRead(threadId) {
      if (!threadId.startsWith("agent:")) return;
      const threadDna = threadId.slice("agent:".length);
      if (!threadDna) return;
      let latestIncomingTs = 0;
      for (const message of snapshot.messages) {
        if (!isIncomingHumanDmForDna(message, threadDna)) continue;
        if (message.ts > latestIncomingTs) {
          latestIncomingTs = message.ts;
        }
      }
      if (latestIncomingTs <= 0) return;
      const current = lastReadByThread.get(threadId) ?? 0;
      if (latestIncomingTs <= current) return;
      const next = new Map(lastReadByThread);
      next.set(threadId, latestIncomingTs);
      lastReadByThread = next;
    }
    function unreadDmCount(threadId) {
      return unreadDmByThread.get(threadId) ?? 0;
    }
    sessionDnaById = new Map(snapshot.sessions.map((session) => [session.sessionId, session.dna]));
    sessionNameById = new Map(snapshot.sessions.map((session) => [session.sessionId, session.name]));
    agentNameByDna = new Map(snapshot.agents.map((agent) => [agent.dna, agent.name]));
    agentByDna = new Map(snapshot.agents.map((agent) => [agent.dna, agent]));
    onlineDnaSet = new Set(snapshot.sessions.map((session) => session.dna));
    inboxMessages = snapshot.messages.filter((message) => message.kind === "dm" && isHumanAddress(message.target));
    {
      const grouped = /* @__PURE__ */ new Map();
      for (const message of inboxMessages) {
        const dna = messageFromDna(message);
        const key = dna ? `dna:${dna}` : `from:${message.from}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
          if (message.ts >= existing.lastMessage.ts) {
            existing.lastMessage = message;
          }
          continue;
        }
        grouped.set(key, {
          key,
          label: resolveActorName({
            id: message.from,
            name: message.fromName,
            dna,
            fallback: "Unknown"
          }),
          count: 1,
          lastMessage: message,
          threadId: dna ? `agent:${dna}` : void 0,
          dna
        });
      }
      ownerInboxSummaries = Array.from(grouped.values()).sort((a, b) => b.lastMessage.ts - a.lastMessage.ts);
    }
    dmThreads = (() => {
      const byDna = /* @__PURE__ */ new Map();
      for (const agent of snapshot.agents) {
        byDna.set(agent.dna, {
          id: `agent:${agent.dna}`,
          label: agent.name,
          kind: "dm",
          dna: agent.dna,
          online: agent.online,
          title: agent.title_short || agent.title,
          typing: agent.typing ?? false,
          activitySource: agent.activitySource
        });
      }
      for (const message of snapshot.messages) {
        if (message.kind !== "dm") continue;
        const fromDna = messageFromDna(message);
        const targetDna = messageTargetDna(message);
        if (fromDna && !isHumanAddress(message.from) && !byDna.has(fromDna)) {
          const known = agentByDna.get(fromDna);
          byDna.set(fromDna, {
            id: `agent:${fromDna}`,
            label: message.fromName || fromDna,
            kind: "dm",
            dna: fromDna,
            online: known?.online ?? onlineDnaSet.has(fromDna),
            title: known?.title_short || known?.title,
            typing: known?.typing ?? false,
            activitySource: known?.activitySource
          });
        }
        if (targetDna && !isHumanAddress(message.target) && !byDna.has(targetDna)) {
          const known = agentByDna.get(targetDna);
          byDna.set(targetDna, {
            id: `agent:${targetDna}`,
            label: message.targetName || targetDna,
            kind: "dm",
            dna: targetDna,
            online: known?.online ?? onlineDnaSet.has(targetDna),
            title: known?.title_short || known?.title,
            typing: known?.typing ?? false,
            activitySource: known?.activitySource
          });
        }
      }
      return Array.from(byDna.values()).sort((a, b) => a.label.localeCompare(b.label));
    })();
    {
      const next = /* @__PURE__ */ new Map();
      for (const thread of dmThreads) {
        if (!thread.dna) {
          next.set(thread.id, 0);
          continue;
        }
        const seenAt = lastReadByThread.get(thread.id) ?? 0;
        let unread = 0;
        for (const message of snapshot.messages) {
          if (!isIncomingHumanDmForDna(message, thread.dna)) continue;
          if (message.ts > seenAt) unread += 1;
        }
        next.set(thread.id, unread);
      }
      unreadDmByThread = next;
    }
    topThreads = [
      { id: "inbox", label: "Inbox", kind: "channel" },
      { id: "tasks", label: "Tasks", kind: "channel" },
      { id: "calendar", label: "Calendar", kind: "channel" }
    ];
    channelThreads = [
      { id: "activity", label: "# all-activity", kind: "channel" },
      ...snapshot.channels.map((ch) => ({
        id: `channel:${ch.name}`,
        label: `# ${ch.name}`,
        kind: "channel"
      }))
    ];
    threads = [...topThreads, ...channelThreads, ...dmThreads];
    if (!threads.find((thread) => thread.id === activeThreadId)) {
      activeThreadId = "activity";
    }
    activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0];
    if (activeThreadId.startsWith("agent:")) {
      markThreadRead(activeThreadId);
    }
    visibleMessages = activeThreadId === "activity" ? snapshot.messages : activeThreadId === "workspace" ? snapshot.messages.filter((message) => message.kind !== "dm") : activeThreadId === "inbox" ? [] : activeThreadId === "tasks" || activeThreadId === "calendar" ? [] : activeThreadId.startsWith("channel:") ? snapshot.messages.filter((message) => {
      const channelName = activeThreadId.slice("channel:".length);
      return message.channel === channelName;
    }) : activeThreadId.startsWith("agent:") ? snapshot.messages.filter((message) => {
      const threadDna = activeThreadId.slice("agent:".length);
      return isMessageInDnaThread(message, threadDna);
    }) : snapshot.messages.filter((message) => message.kind === "dm" && (message.from === activeThreadId || message.target === activeThreadId));
    composerHidden = activeThreadId === "activity" || activeThreadId === "tasks" || activeThreadId === "calendar";
    composerDisabled = activeThreadId === "inbox" || activeThreadId === "tasks" || activeThreadId === "calendar";
    calendarEvents = [...snapshot.calendarEvents].sort((a, b) => a.startTime - b.startTime);
    {
      const now = Date.now();
      const nextTalking = /* @__PURE__ */ new Set();
      const nextWaving = /* @__PURE__ */ new Set();
      for (const message of snapshot.messages) {
        if (message.kind === "dm" || message.kind === "chat") {
          const timeSinceTalk = now - message.ts;
          const dna = messageFromDna(message);
          if (dna && timeSinceTalk < TALK_DURATION_MS) {
            nextTalking.add(dna);
          } else if (dna && timeSinceTalk >= TALK_DURATION_MS && timeSinceTalk < TALK_DURATION_MS + WAVE_DURATION_MS) {
            nextWaving.add(dna);
          }
        }
      }
      talkingDnaSet = nextTalking;
      wavingDnaSet = nextWaving;
    }
    head("qt3mqg", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Termlings Workspace</title>`);
      });
    });
    $$renderer2.push(`<main class="layout container svelte-qt3mqg"><header class="header svelte-qt3mqg"><div class="heading"><h1 class="svelte-qt3mqg">Termlings Workspace</h1> <p>${escape_html(currentProjectName())} · ${escape_html(snapshot.sessions.length)} online · ${escape_html(snapshot.agents.length)} agents · ${escape_html(projects.length)} project(s)</p></div> <div class="actions svelte-qt3mqg"><button${attr("disabled", loading, true)}>${escape_html("Refresh")}</button> <span class="timestamp svelte-qt3mqg">Updated ${escape_html(formatTime(snapshot.generatedAt))}</span></div></header> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <section class="workspace svelte-qt3mqg"><aside class="project-rail card svelte-qt3mqg"><h3 class="rail-title svelte-qt3mqg">Projects</h3> <ul class="project-rail-list svelte-qt3mqg"><!--[-->`);
    const each_array = ensure_array_like(projects);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let project = each_array[$$index];
      $$renderer2.push(`<li><button${attr("aria-label", project.projectName)}${attr_class("project-rail-item svelte-qt3mqg", void 0, { "active": project.projectId === activeProjectId })}${attr("title", project.projectName)}>`);
      Avatar($$renderer2, { size: "lg", name: project.projectName });
      $$renderer2.push(`<!----></button></li>`);
    }
    $$renderer2.push(`<!--]--></ul></aside> <aside class="sidebar card svelte-qt3mqg"><section class="sidebar-section svelte-qt3mqg"><h2 class="svelte-qt3mqg">Inbox &amp; Planner</h2> <ul class="thread-list svelte-qt3mqg"><!--[-->`);
    const each_array_1 = ensure_array_like(topThreads);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let thread = each_array_1[$$index_1];
      $$renderer2.push(`<li><button${attr_class("thread-item svelte-qt3mqg", void 0, { "active": thread.id === activeThreadId })}>${escape_html(thread.label)}</button></li>`);
    }
    $$renderer2.push(`<!--]--></ul></section> <section class="sidebar-section svelte-qt3mqg"><h2 class="svelte-qt3mqg">Channels</h2> <ul class="thread-list svelte-qt3mqg"><!--[-->`);
    const each_array_2 = ensure_array_like(channelThreads);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let thread = each_array_2[$$index_2];
      $$renderer2.push(`<li><button${attr_class("thread-item svelte-qt3mqg", void 0, { "active": thread.id === activeThreadId })}>${escape_html(thread.label)}</button></li>`);
    }
    $$renderer2.push(`<!--]--></ul></section> <section class="sidebar-section svelte-qt3mqg"><h2 class="svelte-qt3mqg">DM Threads</h2> `);
    if (dmThreads.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="muted svelte-qt3mqg">No DM threads yet.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="thread-list dm-thread-list svelte-qt3mqg"><!--[-->`);
      const each_array_3 = ensure_array_like(dmThreads);
      for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
        let thread = each_array_3[$$index_3];
        $$renderer2.push(`<li><button${attr_class("thread-item thread-item-dm svelte-qt3mqg", void 0, { "active": thread.id === activeThreadId })}><span class="thread-main svelte-qt3mqg"><span class="thread-avatar svelte-qt3mqg">`);
        Avatar($$renderer2, {
          size: "lg",
          dna: thread.dna,
          name: thread.label,
          talking: thread.typing ?? false
        });
        $$renderer2.push(`<!----></span> <span class="thread-text svelte-qt3mqg"><span class="thread-label svelte-qt3mqg">${escape_html(thread.label)}</span> <span class="thread-meta svelte-qt3mqg">`);
        if (thread.typing) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="badge secondary svelte-qt3mqg">typing…</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <span${attr_class(`badge ${thread.online ? "success" : "outline"}`, "svelte-qt3mqg")}>${escape_html(thread.online ? "online" : "offline")}</span> `);
        if (thread.title) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="thread-title svelte-qt3mqg">${escape_html(thread.title)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></span></span></span> `);
        if (unreadDmCount(thread.id) > 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="badge">(${escape_html(unreadDmCount(thread.id))})</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></button></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></section></aside> <article class="chat-panel card svelte-qt3mqg"><header class="thread-header svelte-qt3mqg"><h2 class="svelte-qt3mqg">${escape_html(activeThread?.label ?? "Workspace")}</h2> <span class="timestamp svelte-qt3mqg">`);
    if (activeThreadId === "tasks") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`${escape_html(snapshot.tasks.length)} task(s)`);
    } else if (activeThreadId === "calendar") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`${escape_html(calendarEvents.length)} event(s)`);
    } else if (activeThreadId === "inbox") {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`${escape_html(ownerInboxSummaries.length)} sender(s)`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`${escape_html(visibleMessages.length)} message(s)`);
    }
    $$renderer2.push(`<!--]--></span></header> `);
    if (activeThreadId === "tasks") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<ul class="messages svelte-qt3mqg">`);
      if (snapshot.tasks.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<li class="empty svelte-qt3mqg">No tasks created.</li>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_4 = ensure_array_like(snapshot.tasks);
        for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
          let task = each_array_4[$$index_4];
          $$renderer2.push(`<li class="message svelte-qt3mqg"><div class="message-meta svelte-qt3mqg"><span class="author svelte-qt3mqg">${escape_html(task.title)}</span> <span class="timestamp svelte-qt3mqg">${escape_html(formatTime(task.updatedAt))}</span></div> <p class="svelte-qt3mqg">${escape_html(task.status)} · ${escape_html(task.priority)}</p></li>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else if (activeThreadId === "calendar") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<ul class="messages svelte-qt3mqg">`);
      if (calendarEvents.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<li class="empty svelte-qt3mqg">No calendar events scheduled.</li>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_5 = ensure_array_like(calendarEvents);
        for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
          let event = each_array_5[$$index_5];
          $$renderer2.push(`<li class="message svelte-qt3mqg"><div class="message-meta svelte-qt3mqg"><span class="author svelte-qt3mqg">${escape_html(event.title)}</span> <span class="timestamp svelte-qt3mqg">${escape_html(formatDateTime(event.startTime))}</span></div> <p class="svelte-qt3mqg">${escape_html(event.enabled ? "enabled" : "disabled")} · ${escape_html(event.recurrence)}</p></li>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else if (activeThreadId === "inbox") {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<ul class="messages svelte-qt3mqg">`);
      if (ownerInboxSummaries.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<li class="empty svelte-qt3mqg">No inbox messages yet.</li>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_6 = ensure_array_like(ownerInboxSummaries);
        for (let $$index_6 = 0, $$length = each_array_6.length; $$index_6 < $$length; $$index_6++) {
          let summary = each_array_6[$$index_6];
          $$renderer2.push(`<li class="message inbox-summary svelte-qt3mqg"><div class="message-meta svelte-qt3mqg"><div class="author-block svelte-qt3mqg"><span class="avatar svelte-qt3mqg">`);
          Avatar($$renderer2, {
            size: "lg",
            dna: summary.dna,
            name: summary.label,
            talking: isTalkingOrWorkingDna(summary.dna),
            waving: wavingDnaSet.has(summary.dna ?? "")
          });
          $$renderer2.push(`<!----></span> <span class="author svelte-qt3mqg">${escape_html(summary.label)}</span></div> <div class="inbox-summary-meta svelte-qt3mqg"><span class="badge">(${escape_html(summary.count)})</span> <span class="timestamp svelte-qt3mqg">${escape_html(formatTime(summary.lastMessage.ts))}</span></div></div> <p class="svelte-qt3mqg">${escape_html(summary.lastMessage.text)}</p> `);
          if (summary.threadId) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<button class="inbox-open svelte-qt3mqg">Open DM</button>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></li>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="messages svelte-qt3mqg">`);
      if (visibleMessages.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<li class="empty svelte-qt3mqg">No messages in this thread yet.</li>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_7 = ensure_array_like(visibleMessages);
        for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
          let message = each_array_7[$$index_7];
          $$renderer2.push(`<li${attr_class("message svelte-qt3mqg", void 0, { "mine": isMine(message) })}><div class="message-meta svelte-qt3mqg"><div class="author-block svelte-qt3mqg"><span class="avatar svelte-qt3mqg">`);
          Avatar($$renderer2, {
            size: "lg",
            dna: messageFromDna(message),
            name: resolveActorName({
              id: message.from,
              name: message.fromName,
              dna: messageFromDna(message),
              fallback: "Agent"
            }),
            talking: isTalkingOrWorkingDna(messageFromDna(message)),
            waving: wavingDnaSet.has(messageFromDna(message) ?? "")
          });
          $$renderer2.push(`<!----></span> <span class="author svelte-qt3mqg">${escape_html(resolveActorName({
            id: message.from,
            name: message.fromName,
            dna: messageFromDna(message),
            fallback: "Unknown"
          }))}</span></div> <span class="timestamp svelte-qt3mqg">${escape_html(formatTime(message.ts))}</span></div> `);
          if (activeThreadId === "activity") {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="route svelte-qt3mqg">${escape_html(messageRoute(message))}</div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <p class="svelte-qt3mqg">${escape_html(message.text)}</p></li>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (!composerHidden) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<form class="composer svelte-qt3mqg"><input${attr("value", composeText)}${attr("disabled", composerDisabled, true)}${attr("placeholder", activeThreadId === "workspace" ? "Message #workspace" : activeThreadId === "inbox" ? "Inbox is read-only. Select an agent thread to reply." : `DM ${activeThread?.label ?? "agent"}`)} type="text" class="svelte-qt3mqg"/> <button type="submit"${attr("disabled", composerDisabled, true)}>Send</button></form>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></article> <aside class="rightbar svelte-qt3mqg"><section class="panel card"><h2 class="svelte-qt3mqg">Tasks</h2> `);
    if (snapshot.tasks.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="muted svelte-qt3mqg">No tasks created.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="list svelte-qt3mqg"><!--[-->`);
      const each_array_8 = ensure_array_like(snapshot.tasks);
      for (let $$index_8 = 0, $$length = each_array_8.length; $$index_8 < $$length; $$index_8++) {
        let task = each_array_8[$$index_8];
        $$renderer2.push(`<li><div class="primary svelte-qt3mqg">${escape_html(task.title)}</div> <div class="secondary svelte-qt3mqg">${escape_html(task.status)} · ${escape_html(task.priority)}</div></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></section> <section class="panel card"><h2 class="svelte-qt3mqg">Calendar Events</h2> `);
    if (calendarEvents.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="muted svelte-qt3mqg">No calendar events scheduled.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="list svelte-qt3mqg"><!--[-->`);
      const each_array_9 = ensure_array_like(calendarEvents);
      for (let $$index_9 = 0, $$length = each_array_9.length; $$index_9 < $$length; $$index_9++) {
        let event = each_array_9[$$index_9];
        $$renderer2.push(`<li><div class="primary svelte-qt3mqg">${escape_html(event.title)}</div> <div class="secondary svelte-qt3mqg">${escape_html(event.enabled ? "enabled" : "disabled")} · ${escape_html(event.recurrence)} · ${escape_html(formatDateTime(event.startTime))}</div></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></section></aside></section></main>`);
    bind_props($$props, { initialPayload, initialThreadId });
  });
}
export {
  WorkspaceView as W
};
