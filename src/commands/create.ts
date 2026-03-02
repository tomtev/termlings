/**
 * Create agent command
 */

export async function handleCreate(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  if (flags.has("help")) {
    console.log(`
🎨 Create - Build a new agent

Interactive avatar builder for creating new termling agents.

USAGE:
  termlings create                Create new agent (interactive)
  termlings create <name>         Create with specific folder name
  termlings create --name <name>  Create with specific display name
  termlings create --dna <hex>    Create with specific DNA (identity)

EXAMPLES:
  $ termlings create
  🎨 Building your termling...
  Enter agent name: alice
  ✓ Agent created: alice

  $ termlings create --name "Alice" --dna 2c5f423
  ✓ Agent created with custom identity

WHAT IT CREATES:
  .termlings/agents/<name>/
  ├── SOUL.md       Agent personality & purpose
  └── avatar.svg    Visual identity

NEXT STEPS:
  1. Edit .termlings/agents/<name>/SOUL.md to customize
  2. termlings <name>           Launch the agent
  3. termlings message agent:<name> "Welcome"  Start collaborating
`);
    return;
  }

  const { runCreate } = await import("../create.js");
  await runCreate();
  process.exit(0);
}
