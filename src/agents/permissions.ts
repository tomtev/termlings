import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"

interface AgentManageAgentsPermission {
  isAgentSession: boolean
  allowed: boolean
  agentSlug?: string
}

function parseBooleanFrontmatterValue(input?: string): boolean {
  if (!input) return false
  const normalized = input.trim().replace(/^['"]|['"]$/g, "").toLowerCase()
  return normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "on"
}

function parseFrontmatterValue(content: string, key: string): string | undefined {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) return undefined
  return frontmatterMatch[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]
}

function readAgentManageAgentsFlag(root: string, slug: string): boolean {
  const soulPath = join(root, ".termlings", "agents", slug, "SOUL.md")
  if (!existsSync(soulPath)) return false
  try {
    const content = readFileSync(soulPath, "utf8")
    return parseBooleanFrontmatterValue(parseFrontmatterValue(content, "manage_agents"))
  } catch {
    return false
  }
}

function discoverAgentSlugByDna(root: string, dna: string): string | null {
  const agentsRoot = join(root, ".termlings", "agents")
  if (!existsSync(agentsRoot)) return null
  for (const entry of readdirSync(agentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const soulPath = join(agentsRoot, entry.name, "SOUL.md")
    if (!existsSync(soulPath)) continue
    try {
      const content = readFileSync(soulPath, "utf8")
      const soulDna = parseFrontmatterValue(content, "dna")?.trim().replace(/^['"]|['"]$/g, "")
      if (soulDna === dna) return entry.name
    } catch {}
  }
  return null
}

export function getCurrentAgentManageAgentsPermission(root = process.cwd()): AgentManageAgentsPermission {
  const sessionId = (process.env.TERMLINGS_SESSION_ID || "").trim()
  if (!sessionId) {
    return { isAgentSession: false, allowed: true }
  }

  const fromSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
  if (fromSlug) {
    return {
      isAgentSession: true,
      allowed: readAgentManageAgentsFlag(root, fromSlug),
      agentSlug: fromSlug,
    }
  }

  const fromDna = (process.env.TERMLINGS_AGENT_DNA || "").trim()
  if (fromDna) {
    const slug = discoverAgentSlugByDna(root, fromDna)
    return {
      isAgentSession: true,
      allowed: slug ? readAgentManageAgentsFlag(root, slug) : false,
      agentSlug: slug || undefined,
    }
  }

  return { isAgentSession: true, allowed: false }
}

export function ensureAgentCanManageAgents(commandName: string, root = process.cwd()): void {
  const permission = getCurrentAgentManageAgentsPermission(root)
  if (!permission.isAgentSession || permission.allowed) return

  const who = permission.agentSlug ? `agent:${permission.agentSlug}` : "current agent session"
  console.error(`Permission denied: ${who} cannot run \`${commandName}\`.`)
  console.error("Set `manage_agents: true` in the agent SOUL.md frontmatter to allow lifecycle commands.")
  process.exit(1)
}

