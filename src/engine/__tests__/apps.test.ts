import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { resolveWorkspaceAppsForAgent, workspaceAppEnabled } from "../apps.js"
import { findCommandOwnerApp, listEnabledAppTabs } from "../../apps/registry.js"
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
        messaging: false,
        crm: false,
        browser: false,
        requests: false,
        task: false,
        calendar: false,
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
    expect(growth.messaging).toBe(true)
    expect(developer.crm).toBe(false)
    expect(developer.messaging).toBe(true)
    expect(workspaceAppEnabled("crm", "growth", root)).toBe(true)
    expect(workspaceAppEnabled("crm", "developer", root)).toBe(false)
    expect(workspaceAppEnabled("messaging", "developer", root)).toBe(true)
    expect(listEnabledAppTabs(developer).map((entry) => entry.tab.view)).toEqual(["messages"])
  })

  it("maps commands back to their owning apps", () => {
    expect(findCommandOwnerApp("message")).toBe("messaging")
    expect(findCommandOwnerApp("conversation")).toBe("messaging")
    expect(findCommandOwnerApp("request")).toBe("requests")
    expect(findCommandOwnerApp("calendar")).toBe("calendar")
    expect(findCommandOwnerApp("crm")).toBe("crm")
    expect(findCommandOwnerApp("agents")).toBeNull()
  })
})
