import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

import { initializeWorkspaceFromTemplate } from "../workspace/setup.js"
import { ensureWorkspaceDirs } from "../workspace/state.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATES_ROOT = join(__dirname, "..", "..", "templates")

export type CatalogMemberKind = "agent" | "human"

export interface CatalogTeamMember {
  kind: CatalogMemberKind
  slug: string
}

export interface CatalogTeamPreset {
  id: string
  name: string
  description: string
  template: string
  members: CatalogTeamMember[]
}

export interface CatalogAgentPreset {
  id: string
  name: string
  description: string
  template: string
  slug: string
  title_short?: string
}

export interface AgentPresetCatalog {
  version: number
  teams: CatalogTeamPreset[]
  agents: CatalogAgentPreset[]
}

interface ParsedFrontmatter {
  hasFrontmatter: boolean
  lines: Array<{ type: "pair"; key: string; value: string } | { type: "raw"; raw: string }>
  body: string
}

export interface MemberInstallResult {
  kind: CatalogMemberKind
  sourceSlug: string
  targetSlug: string
  targetPath: string
  skipped: boolean
}

export interface TeamInstallResult {
  mode: "initialized-workspace" | "merged-into-workspace"
  template: string
  copiedEntries?: string[]
  installed: MemberInstallResult[]
  skipped: MemberInstallResult[]
}

export interface InstallMemberOptions {
  targetSlug?: string
  force?: boolean
  skipIfExists?: boolean
  frontmatterUpdates?: Record<string, string | number | undefined>
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

const CATALOG: AgentPresetCatalog = {
  version: 1,
  teams: [
    {
      id: "default",
      name: "Startup Core Team",
      description: "PM-led startup team for day-to-day shipping.",
      template: "default",
      members: [
        { kind: "human", slug: "default" },
        { kind: "agent", slug: "pm" },
        { kind: "agent", slug: "designer" },
        { kind: "agent", slug: "developer" },
        { kind: "agent", slug: "growth" },
        { kind: "agent", slug: "support" },
      ],
    },
    {
      id: "executeive-team",
      name: "Executive Team",
      description: "Owner-led C-suite team for cross-functional leadership.",
      template: "executeive-team",
      members: [
        { kind: "human", slug: "default" },
        { kind: "agent", slug: "ceo" },
        { kind: "agent", slug: "cto" },
        { kind: "agent", slug: "cpo" },
        { kind: "agent", slug: "cmo" },
        { kind: "agent", slug: "cfo" },
      ],
    },
    {
      id: "personal-assistant",
      name: "Personal Assistant",
      description: "Single assistant that can plan, execute, and manage agent creation.",
      template: "personal-assistant",
      members: [
        { kind: "human", slug: "default" },
        { kind: "agent", slug: "personal-assistant" },
      ],
    },
  ],
  agents: [
    {
      id: "pm",
      name: "Product Manager",
      description: "Owns product vision, prioritization, and team direction.",
      template: "default",
      slug: "pm",
      title_short: "PM",
    },
    {
      id: "designer",
      name: "Designer",
      description: "Owns UX flows, visual design, and design systems.",
      template: "default",
      slug: "designer",
      title_short: "Design",
    },
    {
      id: "developer",
      name: "Developer",
      description: "Builds and ships product features and infrastructure.",
      template: "default",
      slug: "developer",
      title_short: "Dev",
    },
    {
      id: "growth",
      name: "Growth",
      description: "Owns customer discovery, acquisition, and retention experiments.",
      template: "default",
      slug: "growth",
      title_short: "Growth",
    },
    {
      id: "support",
      name: "Support",
      description: "Keeps operations running and unblocks teammates.",
      template: "default",
      slug: "support",
      title_short: "Support",
    },
    {
      id: "ceo",
      name: "Chief Executive Officer",
      description: "Leads company strategy and executive execution.",
      template: "executeive-team",
      slug: "ceo",
      title_short: "CEO",
    },
    {
      id: "cto",
      name: "Chief Technology Officer",
      description: "Owns architecture, engineering velocity, and technical quality.",
      template: "executeive-team",
      slug: "cto",
      title_short: "CTO",
    },
    {
      id: "cpo",
      name: "Chief Product Officer",
      description: "Owns product strategy, roadmap, and product outcomes.",
      template: "executeive-team",
      slug: "cpo",
      title_short: "CPO",
    },
    {
      id: "cmo",
      name: "Chief Marketing Officer",
      description: "Owns positioning, demand generation, and go-to-market execution.",
      template: "executeive-team",
      slug: "cmo",
      title_short: "CMO",
    },
    {
      id: "cfo",
      name: "Chief Financial Officer",
      description: "Owns planning, budgets, and financial operating discipline.",
      template: "executeive-team",
      slug: "cfo",
      title_short: "CFO",
    },
    {
      id: "personal-assistant",
      name: "Personal Assistant",
      description: "Acts as an execution partner and can create/manage specialist agents.",
      template: "personal-assistant",
      slug: "personal-assistant",
      title_short: "PA",
    },
  ],
}

function encodeFrontmatterValue(value: string | number): string {
  if (typeof value === "number") return String(value)
  if (/^[a-zA-Z0-9._:/-]+$/.test(value)) return value
  return JSON.stringify(value)
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return {
      hasFrontmatter: false,
      lines: [],
      body: content,
    }
  }

  const rawBlock = match[1] || ""
  const body = match[2] || ""
  const lines = rawBlock.split(/\r?\n/).map((line) => {
    const parsed = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/)
    if (!parsed) {
      return { type: "raw" as const, raw: line }
    }
    return { type: "pair" as const, key: parsed[1], value: parsed[2] }
  })
  return { hasFrontmatter: true, lines, body }
}

function applyFrontmatterUpdates(
  content: string,
  updates: Record<string, string | number | undefined> = {},
): string {
  const parsed = parseFrontmatter(content)
  const lines = [...parsed.lines]

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue
    const encoded = encodeFrontmatterValue(value)
    const at = lines.findIndex((line) => line.type === "pair" && line.key === key)
    if (at === -1) {
      lines.push({ type: "pair", key, value: encoded })
      continue
    }
    lines[at] = { type: "pair", key, value: encoded }
  }

  const frontmatterLines = lines.map((line) => (line.type === "pair" ? `${line.key}: ${line.value}` : line.raw))
  const rawBody = parsed.body
  const body = rawBody.length > 0 ? `\n${rawBody.replace(/^\n+/, "")}` : "\n"
  return `---\n${frontmatterLines.join("\n")}\n---${body}`
}

function sourceMemberDir(template: string, kind: CatalogMemberKind, slug: string): string {
  return join(TEMPLATES_ROOT, template, kind === "agent" ? "agents" : "humans", slug)
}

function targetMemberDir(projectRoot: string, kind: CatalogMemberKind, slug: string): string {
  return join(projectRoot, ".termlings", kind === "agent" ? "agents" : "humans", slug)
}

function ensureLocalTemplateExists(template: string): void {
  if (!existsSync(join(TEMPLATES_ROOT, template))) {
    throw new Error(`Template "${template}" is not bundled in this installation.`)
  }
}

export function loadAgentPresetCatalog(): AgentPresetCatalog {
  return CATALOG
}

export function findCatalogTeam(catalog: AgentPresetCatalog, selector: string): CatalogTeamPreset | null {
  const id = normalizeSlug(selector.replace(/^team:/i, ""))
  return catalog.teams.find((team) => team.id === id) || null
}

export function findCatalogAgent(catalog: AgentPresetCatalog, selector: string): CatalogAgentPreset | null {
  const id = normalizeSlug(selector.replace(/^agent:/i, ""))
  return catalog.agents.find((agent) => agent.id === id) || null
}

export function installCatalogMemberFromTemplate(
  projectRoot: string,
  template: string,
  kind: CatalogMemberKind,
  sourceSlug: string,
  options: InstallMemberOptions = {},
): MemberInstallResult {
  ensureWorkspaceDirs(projectRoot)
  ensureLocalTemplateExists(template)

  const targetSlug = normalizeSlug(options.targetSlug || sourceSlug)
  if (!targetSlug) {
    throw new Error("Target slug is required.")
  }
  const src = sourceMemberDir(template, kind, sourceSlug)
  if (!existsSync(src)) {
    throw new Error(`Template source not found: ${template}/${kind === "agent" ? "agents" : "humans"}/${sourceSlug}`)
  }

  const dest = targetMemberDir(projectRoot, kind, targetSlug)
  if (existsSync(dest)) {
    if (options.force) {
      rmSync(dest, { recursive: true, force: true })
    } else if (options.skipIfExists) {
      return {
        kind,
        sourceSlug,
        targetSlug,
        targetPath: dest,
        skipped: true,
      }
    } else {
      throw new Error(`${kind}:${targetSlug} already exists. Use --force to overwrite.`)
    }
  }

  mkdirSync(join(projectRoot, ".termlings", kind === "agent" ? "agents" : "humans"), { recursive: true })
  cpSync(src, dest, { recursive: true, force: true })

  const soulPath = join(dest, "SOUL.md")
  if (existsSync(soulPath) && options.frontmatterUpdates) {
    const current = readFileSync(soulPath, "utf8")
    const next = applyFrontmatterUpdates(current, options.frontmatterUpdates)
    writeFileSync(soulPath, next, "utf8")
  }

  return {
    kind,
    sourceSlug,
    targetSlug,
    targetPath: dest,
    skipped: false,
  }
}

export function installCatalogTeamPreset(
  projectRoot: string,
  team: CatalogTeamPreset,
  options: { force?: boolean } = {},
): TeamInstallResult {
  ensureLocalTemplateExists(team.template)

  const workspaceRoot = join(projectRoot, ".termlings")
  if (!existsSync(workspaceRoot)) {
    const initialized = initializeWorkspaceFromTemplate(team.template, projectRoot)
    return {
      mode: "initialized-workspace",
      template: team.template,
      copiedEntries: initialized.copiedEntries,
      installed: [],
      skipped: [],
    }
  }

  const installed: MemberInstallResult[] = []
  const skipped: MemberInstallResult[] = []

  for (const member of team.members) {
    const result = installCatalogMemberFromTemplate(
      projectRoot,
      team.template,
      member.kind,
      member.slug,
      {
        force: options.force,
        skipIfExists: !options.force,
      },
    )
    if (result.skipped) {
      skipped.push(result)
    } else {
      installed.push(result)
    }
  }

  return {
    mode: "merged-into-workspace",
    template: team.template,
    installed,
    skipped,
  }
}
