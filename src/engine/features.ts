import { readWorkspaceFeatures, type WorkspaceFeatureKey } from "../workspace/state.js"

export type ResolvedWorkspaceFeatures = Record<WorkspaceFeatureKey, boolean>

export const BUILTIN_WORKSPACE_FEATURES: ResolvedWorkspaceFeatures = {
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

export function resolveWorkspaceFeaturesForAgent(
  agentSlug?: string,
  root = process.cwd(),
): ResolvedWorkspaceFeatures {
  const config = readWorkspaceFeatures(root)
  const resolved: ResolvedWorkspaceFeatures = {
    ...BUILTIN_WORKSPACE_FEATURES,
  }

  if (config.defaults) {
    for (const [key, value] of Object.entries(config.defaults) as Array<[WorkspaceFeatureKey, boolean | undefined]>) {
      if (typeof value === "boolean") {
        resolved[key] = value
      }
    }
  }

  const slug = (agentSlug || "").trim()
  if (slug && config.agents?.[slug]) {
    for (const [key, value] of Object.entries(config.agents[slug]!) as Array<[WorkspaceFeatureKey, boolean | undefined]>) {
      if (typeof value === "boolean") {
        resolved[key] = value
      }
    }
  }

  return resolved
}

export function workspaceFeatureEnabled(
  feature: WorkspaceFeatureKey,
  agentSlug?: string,
  root = process.cwd(),
): boolean {
  return resolveWorkspaceFeaturesForAgent(agentSlug, root)[feature]
}
