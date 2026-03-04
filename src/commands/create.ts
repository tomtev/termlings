/**
 * Create agent command
 */

export async function handleCreate(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  if (flags.has("help")) {
    console.log(`
🎨 Create - Build a new agent

Non-interactive agent creation for automation.
Creates \`.termlings/agents/<slug>/\`.

USAGE:
  termlings create <slug> --non-interactive [props]
  termlings create --name <display-name> --non-interactive [props]

RECOMMENDED FOR AGENTS:
  UI is skipped automatically when creation props are provided.
  Provide either:
  - positional <slug>, or
  - --name (slug auto-derived)
  Use --non-interactive to force no prompts even with minimal input.

PROPS:
  --name <display-name>         Agent display name
  --dna <hex7>                  7-char hex DNA (e.g. 0a3f201)
  --purpose <text>              Purpose section text
  --title <text>                Frontmatter title (default: Agent)
  --title-short <text>          Frontmatter title_short
  --role <text>                 Frontmatter role (default: purpose)
  --team <text>                 Frontmatter team (default: Core)
  --reports-to <target>         Frontmatter reports_to (default: agent:pm)
  --non-interactive             Force no prompts
  --yes                         Ignored in non-interactive mode

EXAMPLES:
  # Minimal (auto DNA, default fields)
  termlings create analyst --non-interactive

  # Name-only (slug derived from name)
  termlings create --name "Data Analyst" --non-interactive

  # Full explicit profile
  termlings create analyst --non-interactive \\
    --name "Analyst" \\
    --title "Data Analyst" \\
    --title-short "DA" \\
    --role "Analyze product and growth metrics" \\
    --team "Product" \\
    --reports-to agent:pm \\
    --purpose "Deliver weekly KPI analysis with recommendations" \\
    --dna 1a2b3c4

NOTES:
  - Inside agent sessions, requires \`manage_agents: true\` in your SOUL frontmatter.
  - If --dna is omitted, DNA is generated randomly.
  - If --role is omitted, role = purpose.
  - If --name is omitted, display name is derived from slug.
  - If no props are provided, command falls back to interactive prompts.
  - This command exits non-zero on invalid input.

WHAT IT CREATES:
  .termlings/agents/<slug>/
  ├── SOUL.md       Agent personality & purpose
  └── avatar.svg    Visual identity

NEXT STEPS:
  1. termlings <slug>                          Launch the agent
  2. termlings message agent:<slug> "Welcome"  Start collaborating
`);
    return;
  }

  const { ensureAgentCanManageAgents } = await import("../agents/permissions.js");
  ensureAgentCanManageAgents("termlings create");

  const { runCreate } = await import("../create.js");
  const reportsTo = opts["reports-to"] || opts["reports_to"];
  const titleShort = opts["title-short"] || opts["title_short"];
  await runCreate({
    slug: opts.slug || positional[1],
    name: opts.name,
    dna: opts.dna,
    purpose: opts.purpose,
    title: opts.title,
    titleShort,
    role: opts.role,
    team: opts.team,
    reportsTo,
    nonInteractive: flags.has("non-interactive"),
    yes: flags.has("yes"),
  });
  process.exit(0);
}
