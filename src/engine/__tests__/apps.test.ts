import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { resolveWorkspaceAppsForAgent, workspaceAppEnabled } from "../apps.js"
import { ensureWorkspaceDirs, updateWorkspaceApps } from "../../workspace/state.js"

describe("workspace app resolution", () => {
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-apps-test-"))
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("defaults every app to true when workspace.apps is missing", () => {
    const resolved = resolveWorkspaceAppsForAgent("developer", root)

    for (const value of Object.values(resolved)) {
      expect(value).toBe(true)
    }
  })

  it("applies workspace defaults and agent overrides", () => {
    updateWorkspaceApps({
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

    const growth = resolveWorkspaceAppsForAgent("growth", root)
    const developer = resolveWorkspaceAppsForAgent("developer", root)

    expect(growth.crm).toBe(true)
    expect(growth.browser).toBe(false)
    expect(developer.crm).toBe(false)
    expect(workspaceAppEnabled("crm", "growth", root)).toBe(true)
    expect(workspaceAppEnabled("crm", "developer", root)).toBe(false)
  })
})
