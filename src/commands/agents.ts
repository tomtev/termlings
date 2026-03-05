import {
  findCatalogAgent,
  findCatalogTeam,
  installCatalogMemberFromTemplate,
  installCatalogTeamPreset,
  loadAgentPresetCatalog,
} from "../agents/catalog.js"
import { ensureAgentCanManageAgents } from "../agents/permissions.js"

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function printHelp(): void {
  console.log(`
📦 Agents - Browse and install predefined teams/termlings

USAGE:
  termlings agents list [--json]
  termlings agents install <team:id|agent:id|id> [options]

INSTALL OPTIONS:
  --force                    Overwrite existing local target if it exists
  --slug <slug>              Install agent preset under a custom slug
  --name <name>              Override SOUL frontmatter name
  --title <title>            Override SOUL frontmatter title
  --title-short <text>       Override SOUL frontmatter title_short
  --role <text>              Override SOUL frontmatter role
  --team <name>              Override SOUL frontmatter team
  --reports-to <target>      Override SOUL frontmatter reports_to

EXAMPLES:
  termlings agents list
  termlings agents install team:default
  termlings agents install agent:developer
  termlings agents install developer --slug backend-dev --reports-to agent:cto
`)
}

function printList(): void {
  const catalog = loadAgentPresetCatalog()

  console.log("Predefined teams:")
  for (const team of catalog.teams) {
    const members = team.members.map((member) => `${member.kind}:${member.slug}`).join(", ")
    console.log(`  team:${team.id}`)
    console.log(`    ${team.name}`)
    console.log(`    ${team.description}`)
    console.log(`    template: ${team.template}`)
    console.log(`    members: ${members}`)
  }
  console.log("")

  console.log("Installable termlings:")
  for (const agent of catalog.agents) {
    console.log(`  agent:${agent.id}`)
    console.log(`    ${agent.name}`)
    console.log(`    ${agent.description}`)
    console.log(`    template: ${agent.template} | source slug: ${agent.slug}`)
  }
}

type InstallTarget = {
  type: "team"
  id: string
} | {
  type: "agent"
  id: string
}

function parseInstallTarget(
  catalog: ReturnType<typeof loadAgentPresetCatalog>,
  catalogSelector: string,
): InstallTarget {
  const selector = catalogSelector.trim()
  if (!selector) {
    throw new Error("Install target is required. Use team:<id> or agent:<id>.")
  }

  if (selector.startsWith("team:")) {
    return { type: "team", id: selector.slice(5) }
  }
  if (selector.startsWith("agent:")) {
    return { type: "agent", id: selector.slice(6) }
  }

  const team = findCatalogTeam(catalog, selector)
  const agent = findCatalogAgent(catalog, selector)

  if (team && agent) {
    throw new Error(`"${selector}" matches both a team and agent. Use team:${selector} or agent:${selector}.`)
  }
  if (team) {
    return { type: "team", id: selector }
  }
  if (agent) {
    return { type: "agent", id: selector }
  }

  throw new Error(`Unknown preset "${selector}". Run \`termlings agents list\`.`)
}

function printTeamInstallSummary(id: string, result: ReturnType<typeof installCatalogTeamPreset>): void {
  if (result.mode === "initialized-workspace") {
    const copied = (result.copiedEntries || []).join(", ")
    console.log(`✓ Installed team:${id} by initializing workspace from template "${result.template}".`)
    console.log(`  Copied entries: ${copied}`)
    return
  }

  console.log(`✓ Installed team:${id} into existing workspace.`)
  if (result.installed.length > 0) {
    console.log(`  Added: ${result.installed.map((item) => `${item.kind}:${item.targetSlug}`).join(", ")}`)
  }
  if (result.skipped.length > 0) {
    console.log(`  Skipped (already existed): ${result.skipped.map((item) => `${item.kind}:${item.targetSlug}`).join(", ")}`)
    console.log("  Use --force to overwrite skipped entries.")
  }
}

function optionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export async function handleAgents(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const subcommand = (positional[1] || "list").trim().toLowerCase()
  if (flags.has("help") || subcommand === "help") {
    printHelp()
    return
  }

  if (subcommand === "list") {
    const catalog = loadAgentPresetCatalog()
    if (flags.has("json")) {
      console.log(JSON.stringify(catalog, null, 2))
      return
    }
    printList()
    return
  }

  if (subcommand === "install") {
    ensureAgentCanManageAgents("termlings agents install")

    const selector = positional[2]
    if (!selector) {
      console.error("Usage: termlings agents install <team:id|agent:id|id> [options]")
      process.exit(1)
    }

    const catalog = loadAgentPresetCatalog()
    const target = parseInstallTarget(catalog, selector)
    const force = flags.has("force")
    const projectRoot = process.cwd()

    if (target.type === "team") {
      const team = findCatalogTeam(catalog, target.id)
      if (!team) {
        console.error(`Unknown team preset: ${target.id}`)
        console.error("Run `termlings agents list` to see available presets.")
        process.exit(1)
      }
      const result = installCatalogTeamPreset(projectRoot, team, { force })
      printTeamInstallSummary(team.id, result)
      return
    }

    const agent = findCatalogAgent(catalog, target.id)
    if (!agent) {
      console.error(`Unknown agent preset: ${target.id}`)
      console.error("Run `termlings agents list` to see available presets.")
      process.exit(1)
    }

    const requestedSlug = optionalString(opts.slug)
    const targetSlug = normalizeSlug(requestedSlug || agent.slug)
    if (!targetSlug) {
      console.error("Invalid target slug. Use lowercase letters, numbers, and hyphens.")
      process.exit(1)
    }

    const reportsTo = optionalString(opts["reports-to"] || opts["reports_to"])
    const titleShort = optionalString(opts["title-short"] || opts["title_short"])
    const name = optionalString(opts.name)
    const title = optionalString(opts.title)
    const role = optionalString(opts.role)
    const teamName = optionalString(opts.team)
    const frontmatterUpdates = {
      ...(name ? { name } : {}),
      ...(title ? { title } : {}),
      ...(titleShort ? { title_short: titleShort } : {}),
      ...(role ? { role } : {}),
      ...(teamName ? { team: teamName } : {}),
      ...(reportsTo ? { reports_to: reportsTo } : {}),
    }

    const installed = installCatalogMemberFromTemplate(
      projectRoot,
      agent.template,
      "agent",
      agent.slug,
      {
        targetSlug,
        force,
        frontmatterUpdates: Object.keys(frontmatterUpdates).length > 0 ? frontmatterUpdates : undefined,
      },
    )

    console.log(`✓ Installed agent preset agent:${agent.id} as agent:${installed.targetSlug}`)
    console.log(`  Source template: ${agent.template}`)
    if (Object.keys(frontmatterUpdates).length > 0) {
      console.log(`  SOUL overrides: ${Object.keys(frontmatterUpdates).join(", ")}`)
    }
    return
  }

  console.error(`Unknown agents command: ${subcommand}`)
  console.error("Usage: termlings agents <list|install> ...")
  process.exit(1)
}
