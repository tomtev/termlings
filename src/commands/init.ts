/**
 * Workspace initialization command
 */

import { spawnSync } from "child_process";

function hasCommand(bin: string, args: string[] = ["--version"]): boolean {
  const proc = spawnSync(bin, args, { stdio: "ignore" });
  return (proc.status ?? 1) === 0;
}

function runTmuxQuiet(args: string[]): { ok: boolean; stdout: string } {
  const proc = spawnSync("tmux", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return {
    ok: (proc.status ?? 1) === 0,
    stdout: typeof proc.stdout === "string" ? proc.stdout.trim() : "",
  };
}

function currentTmuxSessionName(): string | null {
  if (!process.env.TMUX) return null;
  const fromEnv = (process.env.TERMLINGS_TMUX_SESSION || "").trim();
  if (fromEnv) return fromEnv;
  const result = runTmuxQuiet(["display-message", "-p", "#S"]);
  if (!result.ok || !result.stdout) return null;
  return result.stdout;
}

function hideTmuxStatusDuringInit(): (() => void) | null {
  const sessionName = currentTmuxSessionName();
  if (!sessionName) return null;

  const previous = runTmuxQuiet(["show-options", "-v", "-t", sessionName, "status"]);
  runTmuxQuiet(["set-option", "-t", sessionName, "status", "off"]);

  return () => {
    const restoreValue = previous.ok && previous.stdout ? previous.stdout : "on";
    runTmuxQuiet(["set-option", "-t", sessionName, "status", restoreValue]);
  };
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

export async function handleInit(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  if (flags.has("help")) {
    console.log(`
🚀 Init - Initialize Termlings workspace

Set up a new Termlings project with agents, tasks, calendar, and storage.

USAGE:
  termlings init              Initialize new workspace (interactive)
  termlings init --force      Re-run setup and template selection
  termlings init --template <name|git-url>

CREATES:
  .termlings/
  ├── agents/                Saved agents (avatar + metadata)
  ├── sessions/              Active agent sessions
  ├── store/                 Persistent data
  ├── brand/                 Brand profile data
  ├── browser/               Browser runtime state (history, process, config)
  └── VISION.md              Project vision injected into agent context (template-provided)

TEMPLATES:
  Currently available:
  • default - Corporate setting with 5 default agents
  (More templates coming)

EXAMPLES:
  $ termlings init
  🚀 Initializing Termlings workspace
  Select a template: default
  ✓ Workspace created

  $ termlings init --template default
  ✓ Initialized .termlings using template: default

  $ termlings init --template https://github.com/org/template-repo.git#main
  ✓ Initialized .termlings using template: https://github.com/org/template-repo.git#main

  $ termlings init --force
  🚀 Re-initializing Termlings workspace
  (Keeps existing data, re-runs setup)

NEXT STEPS:
  1. termlings             Start the workspace UI
  2. termlings spawn       Launch agents (run in another terminal)
  3. termlings spawn --all Spawn all agents (requires tmux)
  4. termlings org-chart   See team hierarchy
`);
    return;
  }

  const forceSetup = flags.has("force");
  if (!forceSetup) {
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    if (existsSync(join(process.cwd(), ".termlings"))) {
      console.log("Workspace already exists at .termlings");
      console.log("Run `termlings init --force` to re-run setup and template selection.");
      process.exit(0);
    }
  }

  // Show logo banner before init prompts
  const { printSetupWizardBanner, printPostInitBanner, printPostInitTeamWave } = await import("../banner.js");
  const restoreTmuxStatus = hideTmuxStatusDuringInit();
  let exitCode = 0;
  try {
    printSetupWizardBanner(forceSetup);
    printBunPreflight();

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
  } finally {
    try {
      restoreTmuxStatus?.();
    } catch {}
  }
  process.exit(exitCode);
}
