import { join, resolve } from "path";
import { mkdtemp, readdir, readFile, rm, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { generateRandomDNA, renderTerminal, renderSVG, decodeDNA, hslToRgb } from "./index.js";
import { createInterface } from "readline";

const REPO = "tomtev/termlings";
const BRANCH = "main";
const TEMPLATE_DIR = "agent-template";
const TARBALL_URL = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz`;

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

  // Interactive prompts for missing fields
  if (!vars["AGENT_NAME"]) {
    vars["AGENT_NAME"] = await prompt("Agent name: ") || "My Agent";
  }
  if (!vars["AGENT_PURPOSE"]) {
    vars["AGENT_PURPOSE"] = await prompt("Purpose: ") || "A personal agent that helps with tasks using workflows and skills.";
  }

  const slug = vars["AGENT_NAME"].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  const dest = targetDir ? resolve(targetDir) : resolve(slug);
  await Bun.spawn(["mkdir", "-p", dest]).exited;

  await createAgent(dest, vars);
}

async function downloadTemplate(): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "tl-agent-"));

  const res = await fetch(TARBALL_URL, {
    headers: { "User-Agent": "termlings-cli" },
  });
  if (!res.ok) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(`Failed to download template (HTTP ${res.status}). Check your network connection.`);
  }

  const tarPath = join(tmpDir, "repo.tar.gz");
  await Bun.write(tarPath, await res.arrayBuffer());

  const archivePrefix = `termlings-${BRANCH}/${TEMPLATE_DIR}/`;
  const extractDir = join(tmpDir, "out");
  await Bun.spawn(["mkdir", "-p", extractDir]).exited;

  const proc = Bun.spawn(["tar", "xzf", tarPath, "--strip-components=2", "-C", extractDir, archivePrefix], {
    stderr: "pipe",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(`Failed to extract template: ${stderr.trim()}`);
  }

  const extracted = await readdir(extractDir);
  if (extracted.length === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error("Template appears to be empty.");
  }

  await removeDsStore(extractDir);
  return tmpDir;
}

async function removeDsStore(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.name === ".DS_Store") {
      await unlink(full).catch(() => {});
    } else if (entry.isDirectory()) {
      await removeDsStore(full);
    }
  }
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

  // --- Avatar approval loop (wave while waiting) ---
  let dna = generateRandomDNA();

  while (true) {
    const traits = decodeDNA(dna);
    const fRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.5);
    const dRgb = hslToRgb(traits.faceHue * 30, 0.5, 0.28);
    const hRgb = hslToRgb(traits.hatHue * 30, 0.5, 0.5);

    // Show waving animation while waiting for input
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

    // Draw first frame (end with \n so cursor is on line below)
    const first = renderMergedFrame(1);
    process.stdout.write(first.output + "\n");
    const frameLineCount = first.lineCount;

    const drawFrame = () => {
      tick++;
      waveFrame = (tick % 2) + 1;
      const frame = renderMergedFrame(waveFrame);
      // Move up from blank line below avatar to first avatar line
      process.stdout.write(`\x1b[${frameLineCount}A`);
      process.stdout.write(frame.output + "\n");
    };

    const interval = setInterval(drawFrame, 400);

    // Ask for approval
    const answer = await prompt(`\n${RESET}Keep this avatar? ${DIM}(Y)es / (r)eroll / (q)uit${RESET} `);
    clearInterval(interval);
    process.stdout.write("\x1b[?25h"); // show cursor

    const a = answer.toLowerCase();
    if (a === "q" || a === "quit") {
      console.log("Cancelled.");
      process.exit(0);
    }
    if (a === "r" || a === "reroll") {
      dna = generateRandomDNA();
      continue;
    }
    // Accept (enter, y, yes)
    break;
  }

  const resolved: Record<string, string> = {
    AGENT_NAME: agentName,
    AGENT_PURPOSE: vars["AGENT_PURPOSE"] || "A personal agent that helps with tasks using workflows and skills.",
    OWNER_NAME: ownerName,
    AGENT_DNA: dna,
  };

  console.log("\nSpawning agent...");
  const tmpDir = await downloadTemplate();
  const extractDir = join(tmpDir, "out");

  try {
    // Replace {{VAR}} placeholders in AGENTS.md
    const agentsPath = join(extractDir, "AGENTS.md");
    try {
      let content = await readFile(agentsPath, "utf-8");
      for (const [key, value] of Object.entries(resolved)) {
        content = content.split(`{{${key}}}`).join(value);
      }
      await writeFile(agentsPath, content);
    } catch {
      // AGENTS.md missing or unreadable — skip replacements
    }

    // Copy to destination preserving symlinks
    const rsync = Bun.spawn(["rsync", "-a", `${extractDir}/`, `${dest}/`], {
      stderr: "pipe",
    });
    const rsyncExit = await rsync.exited;
    if (rsyncExit !== 0) {
      const rsyncErr = await new Response(rsync.stderr).text();
      throw new Error(`Failed to copy template files: ${rsyncErr.trim()}`);
    }

    // Generate avatar SVG
    await writeFile(join(dest, "avatar.svg"), renderSVG(dna, 10, 0, null));

    console.log(`\nCreated in ${dest}`);
    console.log(`  avatar.svg (dna: ${dna})`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
