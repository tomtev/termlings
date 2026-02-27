import { join, resolve } from "path";
import { writeFile } from "fs/promises";
import { generateRandomDNA, renderSVG, decodeDNA, hslToRgb, renderTerminal } from "./index.js";
import { createInterface } from "readline";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runCreate(): Promise<void> {
  const args = process.argv.slice(3);
  let targetDir: string | null = null;
  const vars: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && i + 1 < args.length) {
      vars["AGENT_NAME"] = args[++i];
    } else if (args[i] === "--owner" && i + 1 < args.length) {
      vars["OWNER_NAME"] = args[++i];
    } else if (args[i] === "--purpose" && i + 1 < args.length) {
      vars["AGENT_PURPOSE"] = args[++i];
    } else if (!args[i].startsWith("--") && !targetDir) {
      targetDir = args[i];
    }
  }

  // Determine slug from target dir or prompt for it
  let slug: string;
  if (targetDir) {
    // Use explicit target path
    slug = targetDir.split("/").pop() || "agent";
  } else if (positional.length > 0) {
    // Use first positional arg as slug
    slug = positional[0]!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  } else {
    // No target specified
    slug = "agent";
  }

  // Default agent name from slug (capitalize first letter)
  const defaultName = slug.charAt(0).toUpperCase() + slug.slice(1);
  if (!vars["AGENT_NAME"]) {
    const answer = await prompt(`Agent name (default: ${defaultName}): `);
    vars["AGENT_NAME"] = answer || defaultName;
  }

  if (!vars["AGENT_PURPOSE"]) {
    vars["AGENT_PURPOSE"] = await prompt("Purpose: ") || "A helpful agent";
  }

  const dest = targetDir ? resolve(targetDir) : resolve(".termlings", slug);
  await Bun.spawn(["mkdir", "-p", dest]).exited;

  await createAgent(dest, vars);
}

async function detectOwnerName(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "config", "user.name"], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    const name = (await new Response(proc.stdout).text()).trim();
    if (name) return name;
  } catch {}
  return require("os").userInfo().username || "Owner";
}

async function createAgent(dest: string, vars: Record<string, string>): Promise<void> {
  const agentName = vars["AGENT_NAME"] || "My Agent";
  const ownerName = vars["OWNER_NAME"] || await detectOwnerName();

  // --- Avatar approval loop ---
  let dna = generateRandomDNA();

  while (true) {
    const traits = decodeDNA(dna);
    const fRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.5);
    const dRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.28);
    const hRgb = hslToRgb(traits.hatHue * 30, 0.5, 0.5);

    const BOLD = "\x1b[1m";
    const DIM = "\x1b[2m";
    const RESET = "\x1b[0m";

    console.log("");
    const info = [
      `${BOLD}${agentName}${RESET}`,
      `dna: ${dna}`,
    ];

    // Start waving animation
    process.stdout.write("\x1b[?25l"); // hide cursor
    let waveFrame = 1;
    let tick = 0;

    const avatarWidth = 18;
    const visLen = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

    function renderMergedFrame(wFrame: number): { output: string; lineCount: number } {
      const rendered = renderTerminal(dna, wFrame - 1);
      const avatarLines = rendered.split("\n");
      const infoStart = Math.max(0, Math.floor((avatarLines.length - info.length) / 2));
      const merged: string[] = [];
      for (let i = 0; i < avatarLines.length; i++) {
        const left = avatarLines[i];
        const pad = " ".repeat(Math.max(0, avatarWidth - visLen(left)));
        const right = info[i - infoStart] ?? "";
        merged.push(`${left}${pad}  ${right}\x1b[K`);
      }
      return { output: merged.join("\n"), lineCount: avatarLines.length };
    }

    // Draw first frame
    const first = renderMergedFrame(1);
    process.stdout.write(first.output + "\n");
    const frameLineCount = first.lineCount;

    const drawFrame = () => {
      tick++;
      waveFrame = (tick % 2) + 1;
      const frame = renderMergedFrame(waveFrame);
      process.stdout.write(`\x1b[${frameLineCount}A`);
      process.stdout.write(frame.output + "\n");
    };

    const interval = setInterval(drawFrame, 400);

    // Clear interval and show cursor before prompting
    clearInterval(interval);
    process.stdout.write("\x1b[?25h"); // show cursor
    console.log("");

    // Ask for approval
    const answer = await prompt(`Keep this avatar? (Y)es / (r)eroll / (q)uit: `);
    const a = answer.toLowerCase().trim() || "y";

    if (a === "q") {
      console.log("Cancelled.");
      process.exit(0);
    }
    if (a === "r") {
      dna = generateRandomDNA();
      continue;
    }
    // Accept (y or enter)
    break;
  }

  // Create SOUL.md with agent identity
  const soulContent = `# ${agentName}

**Purpose:** ${vars["AGENT_PURPOSE"] || "A helpful agent"}

**DNA:** ${dna}
`;

  try {
    await writeFile(join(dest, "SOUL.md"), soulContent);
    await writeFile(join(dest, "avatar.svg"), renderSVG(dna, 10, 0, null));

    console.log(`\nCreated in ${dest}`);
    console.log(`  SOUL.md (name: ${agentName})`);
    console.log(`  avatar.svg (dna: ${dna})`);
  } catch (err) {
    throw new Error(`Failed to create agent files: ${err instanceof Error ? err.message : String(err)}`);
  }
}
