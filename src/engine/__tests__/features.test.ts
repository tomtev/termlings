import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { resolveWorkspaceFeaturesForAgent, workspaceFeatureEnabled } from "../features.js"
import { ensureWorkspaceDirs, updateWorkspaceFeatures } from "../../workspace/state.js"

describe("workspace feature resolution", () => {
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-features-test-"))
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("defaults every feature to true when workspace.features is missing", () => {
    const resolved = resolveWorkspaceFeaturesForAgent("developer", root)

    for (const value of Object.values(resolved)) {
      expect(value).toBe(true)
    }
  })

  it("applies workspace defaults and agent overrides", () => {
    updateWorkspaceFeatures({
      defaults: {
        crm: false,
        browser: false,
      },
      agents: {
        growth: {
          crm: true,
        },
      },
    }, root)

    const growth = resolveWorkspaceFeaturesForAgent("growth", root)
    const developer = resolveWorkspaceFeaturesForAgent("developer", root)

    expect(growth.crm).toBe(true)
    expect(growth.browser).toBe(false)
    expect(developer.crm).toBe(false)
    expect(workspaceFeatureEnabled("crm", "growth", root)).toBe(true)
    expect(workspaceFeatureEnabled("crm", "developer", root)).toBe(false)
  })
})
