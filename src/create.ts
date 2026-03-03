import { join, resolve } from "path";
import { mkdir, writeFile } from "fs/promises";
import { createInterface } from "readline";
import { generateRandomDNA, renderSVG, renderTerminal } from "./index.js";

export interface CreateOptions {
  slug?: string
  name?: string
  dna?: string
  purpose?: string
  title?: string
  titleShort?: string
  role?: string
  team?: string
  reportsTo?: string
  nonInteractive?: boolean
  yes?: boolean
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolvePrompt) => {
    rl.question(question, (answer) => {
      rl.close();
      resolvePrompt(answer.trim());
    });
  });
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Agent";
}

function validateDna(raw: string): string {
  const dna = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{7}$/.test(dna)) {
    throw new Error("Invalid DNA. Expected 7 hex characters, e.g. 0a3f201.");
  }
  return dna;
}

async function selectAvatarDna(initialDna: string, agentName: string): Promise<string> {
  let dna = initialDna;
  while (true) {
    console.log("");
    console.log(`${agentName}`);
    console.log(`dna: ${dna}`);
    console.log(renderTerminal(dna, 0));
    const answer = (await prompt("Keep this avatar? (Y)es / (r)eroll / (q)uit: ")).toLowerCase() || "y";
    if (answer === "q") {
      console.log("Cancelled.");
      process.exit(0);
    }
    if (answer === "r") {
      dna = generateRandomDNA();
      continue;
    }
    return dna;
  }
}

export async function runCreate(options: CreateOptions = {}): Promise<void> {
  const interactiveShell = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const hasExplicitProps = Boolean(
    options.slug
    || options.name
    || options.dna
    || options.purpose
    || options.title
    || options.titleShort
    || options.role
    || options.team
    || options.reportsTo,
  );
  const nonInteractive = options.nonInteractive === true || hasExplicitProps;

  let slug = normalizeSlug(options.slug || "");
  if (!slug && options.name) {
    slug = normalizeSlug(options.name);
  }
  if (!slug) {
    slug = "agent";
  }

  let agentName = (options.name || "").trim();
  if (!agentName) {
    const fallbackName = defaultNameFromSlug(slug);
    if (nonInteractive) {
      agentName = fallbackName;
    } else {
      if (!interactiveShell) {
        throw new Error("Interactive create requires a TTY. Use --non-interactive with explicit props.");
      }
      agentName = (await prompt(`Agent name (default: ${fallbackName}): `)) || fallbackName;
    }
  }

  let purpose = (options.purpose || "").trim();
  if (!purpose) {
    if (nonInteractive) {
      purpose = "A helpful agent";
    } else {
      if (!interactiveShell) {
        throw new Error("Interactive create requires a TTY. Use --non-interactive with --purpose.");
      }
      purpose = (await prompt("Purpose: ")) || "A helpful agent";
    }
  }

  const title = (options.title || "Agent").trim() || "Agent";
  const titleShort = (options.titleShort || "").trim();
  const role = (options.role || purpose).trim() || purpose;
  const team = (options.team || "Core").trim() || "Core";
  const reportsTo = (options.reportsTo || "agent:pm").trim() || "agent:pm";

  let dna = options.dna ? validateDna(options.dna) : generateRandomDNA();
  const shouldReviewAvatar = interactiveShell && !nonInteractive && !options.yes && !options.dna;
  if (shouldReviewAvatar) {
    dna = await selectAvatarDna(dna, agentName);
  }

  const dest = resolve(".termlings", "agents", slug);
  await mkdir(dest, { recursive: true });

  const frontmatter: string[] = [
    "---",
    `name: ${agentName}`,
    `title: ${title}`,
  ];
  if (titleShort) {
    frontmatter.push(`title_short: ${titleShort}`);
  }
  frontmatter.push(
    `role: ${role}`,
    `team: ${team}`,
    `reports_to: ${reportsTo}`,
    `dna: ${dna}`,
    "---",
    "",
    "## Purpose",
    "",
    purpose,
    "",
  );
  const soulContent = frontmatter.join("\n");

  await writeFile(join(dest, "SOUL.md"), soulContent);
  await writeFile(join(dest, "avatar.svg"), renderSVG(dna, 10, 0, null));

  console.log(`\nCreated in ${dest}`);
  console.log(`  SOUL.md (name: ${agentName})`);
  console.log(`  avatar.svg (dna: ${dna})`);
  console.log(`\nLaunch with: termlings ${slug}`);
  console.log(`Or auto-confirm (dangerous): termlings ${slug} --dangerous-skip-confirmation`);
}
