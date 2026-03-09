/**
 * Workspace initialization command
 */

import { spawnSync } from "child_process";

function hasCommand(bin: string, args: string[] = ["--version"]): boolean {
  const proc = spawnSync(bin, args, { stdio: "ignore" });
  return (proc.status ?? 1) === 0;
}

function detectBunVersion(): string | null {
  const runtimeBun = (process.versions as Record<string, string | undefined>).bun;
  if (runtimeBun && runtimeBun.trim().length > 0) {
    return `bun v${runtimeBun.trim()}`;
  }

  const proc = spawnSync("bun", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if ((proc.status ?? 1) !== 0) return null;
  const text = typeof proc.stdout === "string" ? proc.stdout.trim() : "";
  if (!text) return "bun";
  return text.startsWith("v") ? `bun ${text}` : `bun v${text}`;
}

function bunInstallHintsForPlatform(): string[] {
  if (process.platform === "win32") {
    return ['Windows (PowerShell): powershell -c "irm bun.sh/install.ps1 | iex"'];
  }

  if (process.platform === "darwin" || process.platform === "linux") {
    if (process.platform === "darwin" && hasCommand("brew")) {
      return [
        "macOS (Homebrew): brew install oven-sh/bun/bun",
        "or (official): curl -fsSL https://bun.sh/install | bash",
      ];
    }
    return ["macOS/Linux (official): curl -fsSL https://bun.sh/install | bash"];
  }

  return ["Install Bun: https://bun.sh/docs/installation"];
}

function printBunPreflight(): void {
  const version = detectBunVersion();
  if (version) {
    return;
  }

  const platformLabel = process.platform === "darwin"
    ? "macOS"
    : process.platform === "win32"
      ? "Windows"
      : process.platform === "linux"
        ? "Linux"
        : process.platform;

  console.log(`! Bun not found on ${platformLabel}. Termlings requires Bun.`);
  console.log("  Install Bun before running `termlings`.");
  for (const hint of bunInstallHintsForPlatform()) {
    console.log(`  ${hint}`);
  }
}

function printBrowserRuntimePreflight(): void {
  if (hasCommand("agent-browser", ["--version"])) {
    return;
  }

  console.log("! agent-browser not found. Browser automation requires it.");
  console.log("  Install: npm install -g agent-browser");
  console.log("  Then run: agent-browser install");
}

type CodingRuntimePreflight = {
  bin: "claude" | "codex";
  label: "Claude Code" | "Codex CLI";
  installed: boolean;
  authenticated: boolean;
};

function runQuiet(bin: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const proc = spawnSync(bin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 8000,
    });
    return {
      ok: (proc.status ?? 1) === 0,
      stdout: typeof proc.stdout === "string" ? proc.stdout.trim() : "",
      stderr: typeof proc.stderr === "string" ? proc.stderr.trim() : "",
    };
  } catch {
    return { ok: false, stdout: "", stderr: "" };
  }
}

function looksAuthenticated(output: string): boolean {
  const lower = output.toLowerCase();
  if (!lower) return false;
  if (/not logged|logged out|unauthorized|no auth|not authenticated/.test(lower)) return false;
  if (/logged in|authenticated|subscription/.test(lower)) return true;
  return false;
}

function checkClaudeAuthenticated(): boolean {
  if (!hasCommand("claude")) return false;
  const result = runQuiet("claude", ["auth", "status"]);
  if (!result.ok) return false;

  const stdout = result.stdout;
  if (stdout.startsWith("{")) {
    try {
      const parsed = JSON.parse(stdout) as { loggedIn?: unknown };
      if (typeof parsed.loggedIn === "boolean") return parsed.loggedIn;
    } catch {}
  }

  return looksAuthenticated([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

function checkCodexAuthenticated(): boolean {
  if (!hasCommand("codex")) return false;
  const result = runQuiet("codex", ["login", "status"]);
  if (!result.ok) return false;
  return looksAuthenticated([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

function codingRuntimePreflight(): CodingRuntimePreflight[] {
  const claudeInstalled = hasCommand("claude");
  const codexInstalled = hasCommand("codex");
  return [
    {
      bin: "claude",
      label: "Claude Code",
      installed: claudeInstalled,
      authenticated: claudeInstalled ? checkClaudeAuthenticated() : false,
    },
    {
      bin: "codex",
      label: "Codex CLI",
      installed: codexInstalled,
      authenticated: codexInstalled ? checkCodexAuthenticated() : false,
    },
  ];
}

function printCodingRuntimePreflight(): boolean {
  const statuses = codingRuntimePreflight();
  const hasReadyRuntime = statuses.some((status) => status.installed && status.authenticated);
  if (hasReadyRuntime) return true;

  console.log("! No authenticated coding runtime found.");
  console.log("  Termlings requires at least one runtime that is installed and logged in:");
  console.log("  - Claude Code (`claude`)");
  console.log("  - Codex CLI (`codex`)");
  console.log("");
  console.log("Current status:");
  for (const runtime of statuses) {
    if (!runtime.installed) {
      console.log(`  - ${runtime.label}: not installed`);
      continue;
    }
    console.log(`  - ${runtime.label}: installed, not logged in`);
  }
  console.log("");
  console.log("How to fix:");
  console.log("  - Claude Code: install CLI, then run `claude auth login`");
  console.log("  - Codex CLI: install CLI, then run `codex login`");
  return false;
}

async function maybeAutoExtractShadcnBrand(root = process.cwd()): Promise<void> {
  const { existsSync } = await import("fs");
  const { join } = await import("path");
  const hasShadcn = existsSync(join(root, "components.json")) || existsSync(join(root, "web", "components.json"));
  if (!hasShadcn) return;

  try {
    const {
      createBrandTemplate,
      extractBrand,
      mergeBrandData,
      readBrand,
      relativeBrandFilePath,
      writeBrand,
    } = await import("../engine/brand.js");

    const result = extractBrand(root, "shadcn");
    const base = readBrand(root, "default") || createBrandTemplate(root);
    const merged = mergeBrandData(base, result.extracted, false);
    merged.sources = Array.from(new Set([...(base.sources || []), ...result.sources]));
    merged.updatedAt = new Date().toISOString();
    writeBrand(merged, root, "default");

    console.log(`Auto brand extract (shadcn) -> ${relativeBrandFilePath(root, "default")}`);
    if (result.notes.length > 0) {
      for (const note of result.notes) {
        console.log(`Note: ${note}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Note: Skipped shadcn brand extract (${message})`);
  }
}

export async function handleInit(
  flags: Set<string>,
  positional: string[],
  opts: Record<string, string>,
  internal: { exitOnComplete?: boolean } = {},
) {
  const exitOnComplete = internal.exitOnComplete !== false;
  if (flags.has("help")) {
    console.log(`
🚀 Init - Initialize Termlings workspace

Set up a new Termlings project with agents, workflows, tasks, calendar, and storage.

REQUIREMENTS:
  At least one coding runtime must be installed and logged in:
  - claude (Claude Code)
  - codex  (Codex CLI)

USAGE:
  termlings init              Initialize new workspace (interactive)
  termlings init --force      Re-run setup and template selection
  termlings init --template <name|git-url>

CREATES:
  .termlings/
  ├── agents/                Saved agents (avatar + metadata)
  ├── workflows/             Reusable workflow definitions
  ├── store/                 Persistent data
  ├── brand/                 Brand profile data
  ├── browser/               Browser runtime state (history, process, config)
  └── GOAL.md                Project goal injected into agent context (template-provided)

TEMPLATES:
  Currently available:
  • startup-team - PM-led startup team (PM, Designer, Developer, Growth, Support)
  • executive-team - C-suite executive team (CEO, CTO, CPO, CMO, CFO)
  • personal-assistant - Single personal assistant that can create/manage agents

EXAMPLES:
  $ termlings init
  🚀 Initializing Termlings workspace
  Select a template: startup-team
  ✓ Workspace created

  $ termlings init --template startup-team
  ✓ Initialized .termlings using template: startup-team

  $ termlings init --template https://github.com/org/template-repo.git#main
  ✓ Initialized .termlings using template: https://github.com/org/template-repo.git#main

  $ termlings init --force
  🚀 Re-initializing Termlings workspace
  (Keeps existing data, re-runs setup)

NEXT STEPS:
  1. termlings --spawn     Open workspace now + start scheduler and agents in background
  2. termlings             Start the workspace UI only
  3. termlings spawn       Launch agents manually from another terminal
  4. termlings org-chart   See team hierarchy
`);
    if (!exitOnComplete) return 0;
    return;
  }

  const forceSetup = flags.has("force");
  if (!forceSetup) {
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    if (existsSync(join(process.cwd(), ".termlings"))) {
      console.log("Workspace already exists at .termlings");
      console.log("Run `termlings init --force` to re-run setup and template selection.");
      if (!exitOnComplete) return 0;
      process.exit(0);
    }
  }

  // Show logo banner before init prompts
  const { printSetupWizardBanner, printPostInitBanner, printPostInitTeamWave } = await import("../banner.js");
  let exitCode = 0;
  try {
    printSetupWizardBanner(forceSetup);
    printBunPreflight();
    printBrowserRuntimePreflight();
    if (!printCodingRuntimePreflight()) {
      exitCode = 1;
      return;
    }

    const { ensureWorkspaceInitialized } = await import("../workspace/initialize.js");
    const ready = await ensureWorkspaceInitialized(forceSetup, process.cwd(), opts.template);
    if (ready) {
      await maybeAutoExtractShadcnBrand(process.cwd());

      // Count agents for post-init banner
      const { discoverLocalAgents } = await import("../agents/discover.js");
      const agents = discoverLocalAgents();
      printPostInitBanner(agents.length);
      const clean = (value?: string) => (value || "").trim().replace(/^['"]|['"]$/g, "");
      const waveAgents = agents
        .map((agent) => ({
          dna: clean(agent.soul?.dna),
          name: clean(agent.soul?.name) || agent.name,
          role: clean(agent.soul?.title_short)
            || clean(agent.soul?.title)
            || clean(agent.soul?.role)
            || "Agent",
        }))
        .filter((agent) => /^[0-9a-f]{7}$/i.test(agent.dna));
      await printPostInitTeamWave(waveAgents);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    exitCode = 1;
  }
  if (!exitOnComplete) return exitCode;
  process.exit(exitCode);
}
