/**
 * Workspace initialization command
 */

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
  1. termlings             Start the workspace control plane
  2. Press s               Launch team agent terminals
  3. Press p               Peek an agent terminal
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
  printSetupWizardBanner(forceSetup);

  const { ensureWorkspaceInitialized } = await import("../workspace/initialize.js");
  let ready = false;
  try {
    ready = await ensureWorkspaceInitialized(forceSetup, process.cwd(), opts.template);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
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
  process.exit(0);
}
