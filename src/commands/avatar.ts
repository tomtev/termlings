/**
 * Avatar command - visualize termling avatars
 */

export async function handleAvatar(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  if (flags.has("help")) {
    console.log(`
🎨 Avatar - Visualize termling avatars

Terminal rendering of termling avatars.

AVATAR RENDERING:
  termlings avatar                          Render random avatar
  termlings avatar <dna>                    Render avatar by DNA (hex)
  termlings avatar <name>                   Render avatar by name
  termlings avatar --random                 Randomize DNA

AVATAR OPTIONS:
  --svg                                     Output as SVG instead of terminal
  --svg --animated [--walk|--talk|--wave]   Animated SVG
  --svg --size <n>                          SVG size in pixels (default: 10)
  --svg --bg <color>                        Background color (e.g., #000000)
  --mp4 [--out <file>]                      Export as MP4 (requires ffmpeg)
  --mp4 --walk --duration <s>               Walking animation
  --info                                    Show DNA traits
  --bw                                      Black & white mode

EXAMPLES:
  $ termlings avatar 2c5f423
  alice [dna: 2c5f423]
  (renders avatar in terminal)

  $ termlings avatar alice --svg > avatar.svg
  (exports to SVG file)

  $ termlings avatar alice --mp4 --walk
  (creates animated MP4 with walking)
`);
    return;
  }

  if (positional.length > 2) {
    console.error("Unexpected arguments for `termlings avatar`.")
    console.error("Usage: termlings avatar [dna|name] [options]")
    process.exit(1)
  }

  const {
    renderTerminal, renderTerminalSmall, renderSVG, renderLayeredSVG,
    getAvatarCSS, getTraitColors, decodeDNA, encodeDNA,
    traitsFromName, generateRandomDNA, generateGrid, hslToRgb, LEGS
  } = await import("../index.js");

  // Avatar rendering
  let input = positional[1];
  if (flags.has("random") || !input) {
    input = generateRandomDNA();
  }

  const isDNA = /^[0-9a-f]{6,7}$/i.test(input);
  const dna = isDNA ? input : encodeDNA(traitsFromName(input));

  if (!isDNA) {
    console.log(`\x1b[2m"${input}" → dna: ${dna}\x1b[0m\n`);
  } else {
    console.log(`\x1b[2mdna: ${dna}\x1b[0m\n`);
  }

  const bw = flags.has("bw");

  if (flags.has("info")) {
    const traits = decodeDNA(dna);
    console.log("Traits:", JSON.stringify(traits, null, 2));
    console.log();
  }

  if (flags.has("svg")) {
    const size = opts.size ? parseInt(opts.size, 10) : 10;
    const bg = opts.bg === "none" ? null : opts.bg || null;

    if (flags.has("animated")) {
      const { svg } = renderLayeredSVG(dna, size, bw);
      const css = getAvatarCSS();
      const classes = ["tg-avatar"];
      if (flags.has("walk")) classes.push("walking");
      if (flags.has("talk")) classes.push("talking");
      if (flags.has("wave")) classes.push("waving");
      if (!flags.has("walk") && !flags.has("talk") && !flags.has("wave")) classes.push("idle");

      const animated = svg
        .replace("<svg ", `<svg class="${classes.join(" ")}" `)
        .replace("</svg>", `<style>${css}</style></svg>`);

      console.log(animated);
    } else {
      console.log(renderSVG(dna, size, 0, bg, 1, bw));
    }
    process.exit(0);
  }

  // Default terminal render
  console.log(renderTerminal(dna));
  process.exit(0);
}
