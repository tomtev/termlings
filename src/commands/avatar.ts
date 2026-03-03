/**
 * Avatar command - visualize termling avatars and objects
 */

export async function handleAvatar(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  if (flags.has("help")) {
    console.log(`
🎨 Avatar - Visualize termling avatars & objects

Terminal rendering of termling avatars and world objects.

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

OBJECT RENDERING:
  termlings avatar object <type>            Render object type
  termlings avatar object <type> --list     List all objects
  termlings avatar object <type> --color R,G,B  Custom color
  termlings avatar object <type> --debug-collision  Show collision

EXAMPLES:
  $ termlings avatar 2c5f423
  alice [dna: 2c5f423]
  (renders avatar in terminal)

  $ termlings avatar alice --svg > avatar.svg
  (exports to SVG file)

  $ termlings avatar alice --mp4 --walk
  (creates animated MP4 with walking)

  $ termlings avatar object table
  (renders table object)
`);
    return;
  }

  const {
    renderTerminal, renderTerminalSmall, renderSVG, renderLayeredSVG,
    getAvatarCSS, getTraitColors, decodeDNA, encodeDNA,
    traitsFromName, generateRandomDNA, generateGrid, hslToRgb, LEGS
  } = await import("../index.js");

  let renderType = positional[1] === "object" ? "object" : "avatar";
  let renderInput = renderType === "object" ? positional[2] : positional[1];

  // Handle object rendering
  if (renderType === "object") {
    const { OBJECT_DEFS, renderObjectToTerminal } = await import("../engine/objects.js");

    if (flags.has("list")) {
      const { loadCustomObjects } = await import("../engine/object-loader.js");
      const customObjects = loadCustomObjects("default");
      const allObjects = { ...OBJECT_DEFS, ...customObjects };

      console.log("\nAvailable object types:\n");
      if (Object.keys(allObjects).length === 0) {
        console.log("No objects yet.");
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

    const { loadCustomObjects } = await import("../engine/object-loader.js");
    const customObjects = loadCustomObjects("default");
    const allObjects = { ...OBJECT_DEFS, ...customObjects };

    if (!allObjects[objectType]) {
      console.error(`Unknown object type: ${objectType}`);
      process.exit(1);
    }

    const debugCollision = flags.has("debug-collision");
    console.log(`\n${objectType}${color ? ` [color: rgb(${color.join(", ")})]` : ""}\n`);

    if (debugCollision) {
      console.log("Collision legend: · = transparent, █ = blocking, ░ = walkable\n");
    }

    console.log(renderObjectToTerminal(objectType, color, allObjects, debugCollision));
    console.log();
    process.exit(0);
  }

  // Avatar rendering
  let input = renderInput;
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
