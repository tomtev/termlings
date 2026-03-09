import { existsSync, readFileSync } from "fs"
import { join } from "path"

import { CORE_APP_DEFINITIONS, appVisibleToAgents } from "../apps/registry.js"
import {
  readWorkspaceApps,
  type WorkspaceAppKey,
} from "../workspace/state.js"

export type ResolvedWorkspaceApps = Record<WorkspaceAppKey, boolean>

export const BUILTIN_WORKSPACE_APPS: ResolvedWorkspaceApps = CORE_APP_DEFINITIONS.reduce((acc, app) => {
  acc[app.id] = true
  return acc
}, {} as ResolvedWorkspaceApps)

function parseSoulAppsAllowlist(agentSlug: string, root: string): WorkspaceAppKey[] | null {
  const slug = agentSlug.trim()
  if (!slug) return null

  const soulPath = join(root, ".termlings", "agents", slug, "SOUL.md")
  if (!existsSync(soulPath)) return null

  try {
    const content = readFileSync(soulPath, "utf8")
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatterMatch) return null
    const lines = frontmatterMatch[1].split(/\r?\n/)
    const values: string[] = []
    let foundAppsKey = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const match = line.match(/^apps:\s*(.*)$/)
      if (!match) continue
      foundAppsKey = true
      const rest = match[1].trim()
      if (rest) {
        if (rest.startsWith("[") && rest.endsWith("]")) {
          values.push(...rest.slice(1, -1).split(",").map((entry) => entry.trim()))
        } else {
          values.push(...rest.split(",").map((entry) => entry.trim()))
        }
      } else {
        for (let j = i + 1; j < lines.length; j++) {
          const itemLine = lines[j]!
          const itemMatch = itemLine.match(/^\s*-\s*(.+)$/)
          if (itemMatch) {
            values.push(itemMatch[1].trim())
            continue
          }
          if (/^\s+/.test(itemLine)) continue
          break
        }
      }
      break
    }

    if (!foundAppsKey) return null

    return Array.from(new Set(
      values
        .map((entry) => entry.replace(/^['"]|['"]$/g, "").trim())
        .filter((entry): entry is WorkspaceAppKey =>
          CORE_APP_DEFINITIONS.some((app) => app.id === entry),
        ),
    ))
  } catch {
    return null
  }
}

export function resolveWorkspaceAppsForAgent(
  agentSlug?: string,
  root = process.cwd(),
): ResolvedWorkspaceApps {
  const config = readWorkspaceApps(root)
  const resolved: ResolvedWorkspaceApps = {
    ...BUILTIN_WORKSPACE_APPS,
  }

  if (config.defaults) {
    for (const [key, value] of Object.entries(config.defaults) as Array<[WorkspaceAppKey, boolean | undefined]>) {
      if (typeof value === "boolean") {
        resolved[key] = value
      }
    }
  }

  const slug = (agentSlug || "").trim()
  if (slug) {
    for (const app of CORE_APP_DEFINITIONS) {
      if (!appVisibleToAgents(app.id)) {
        resolved[app.id] = false
      }
    }
  }

  const soulApps = slug ? parseSoulAppsAllowlist(slug, root) : null
  if (slug && soulApps) {
    for (const app of CORE_APP_DEFINITIONS) {
      if (!app.required) {
        resolved[app.id] = false
      }
    }
    for (const appId of soulApps) {
      if (appVisibleToAgents(appId)) {
        resolved[appId] = true
      }
    }
  }

  for (const app of CORE_APP_DEFINITIONS) {
    if (app.required) {
      resolved[app.id] = true
    }
  }

  return resolved
}

export function workspaceAppEnabled(
  app: WorkspaceAppKey,
  agentSlug?: string,
  root = process.cwd(),
): boolean {
  return resolveWorkspaceAppsForAgent(agentSlug, root)[app]
}
