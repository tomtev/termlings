import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
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

    for (const [key, value] of Object.entries(resolved)) {
      if (key === "eval") {
        expect(value).toBe(false)
      } else {
        expect(value).toBe(true)
      }
    }

    const operatorResolved = resolveWorkspaceAppsForAgent(undefined, root)
    expect(operatorResolved.eval).toBe(true)
  })

  it("applies workspace defaults and SOUL app allowlists", () => {
    updateWorkspaceApps({
      defaults: {
        messaging: false,
        crm: false,
        browser: false,
        requests: false,
        task: false,
        calendar: false,
      },
    }, root)

    const growthDir = join(root, ".termlings", "agents", "growth")
    mkdirSync(growthDir, { recursive: true })
    writeFileSync(
      join(growthDir, "SOUL.md"),
      `---\nname: Growth\ndna: 80bf40\napps:\n  - crm\n  - browser\n---\nGrowth agent\n`,
      "utf8",
    )

    const growth = resolveWorkspaceAppsForAgent("growth", root)
    const developer = resolveWorkspaceAppsForAgent("developer", root)

    expect(growth.crm).toBe(true)
    expect(growth.browser).toBe(true)
    expect(growth.task).toBe(false)
    expect(growth.messaging).toBe(true)
    expect(growth.eval).toBe(false)
    expect(developer.crm).toBe(false)
    expect(developer.messaging).toBe(true)
    expect(developer.eval).toBe(false)
    expect(workspaceAppEnabled("crm", "growth", root)).toBe(true)
    expect(workspaceAppEnabled("crm", "developer", root)).toBe(false)
    expect(workspaceAppEnabled("messaging", "developer", root)).toBe(true)
    expect(workspaceAppEnabled("eval", "developer", root)).toBe(false)
    expect(listEnabledAppTabs(developer).map((entry) => entry.tab.view)).toEqual(["messages"])
  })

  it("maps commands back to their owning apps", () => {
    expect(findCommandOwnerApp("message")).toBe("messaging")
    expect(findCommandOwnerApp("conversation")).toBe("messaging")
    expect(findCommandOwnerApp("request")).toBe("requests")
    expect(findCommandOwnerApp("calendar")).toBe("calendar")
    expect(findCommandOwnerApp("design")).toBe("design")
    expect(findCommandOwnerApp("social")).toBe("social")
    expect(findCommandOwnerApp("ads")).toBe("ads")
    expect(findCommandOwnerApp("memory")).toBe("memory")
    expect(findCommandOwnerApp("cms")).toBe("cms")
    expect(findCommandOwnerApp("crm")).toBe("crm")
    expect(findCommandOwnerApp("image")).toBe("media")
    expect(findCommandOwnerApp("video")).toBe("media")
    expect(findCommandOwnerApp("analytics")).toBe("analytics")
    expect(findCommandOwnerApp("finance")).toBe("finance")
    expect(findCommandOwnerApp("eval")).toBe("eval")
    expect(findCommandOwnerApp("agents")).toBeNull()
  })
})
