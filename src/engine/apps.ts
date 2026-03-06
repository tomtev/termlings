import { readWorkspaceApps, type WorkspaceAppKey } from "../workspace/state.js"

export type ResolvedWorkspaceApps = Record<WorkspaceAppKey, boolean>

export const BUILTIN_WORKSPACE_APPS: ResolvedWorkspaceApps = {
  "messaging": true,
  "requests": true,
  "org-chart": true,
  "brief": true,
  "task": true,
  "workflows": true,
  "calendar": true,
  "browser": true,
  "skills": true,
  "brand": true,
  "crm": true,
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
  if (slug && config.agents?.[slug]) {
    for (const [key, value] of Object.entries(config.agents[slug]!) as Array<[WorkspaceAppKey, boolean | undefined]>) {
      if (typeof value === "boolean") {
        resolved[key] = value
      }
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
