import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  ensureWorkspaceDirs,
  readWorkspaceApps,
  readWorkspaceSettings,
  updateWorkspaceApps,
  updateWorkspaceSettings,
} from "../state.js"

describe("workspace settings", () => {
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-settings-test-"))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("persists browser activity feed toggle", () => {
    ensureWorkspaceDirs(root)

    const updated = updateWorkspaceSettings({ showBrowserActivity: false }, root)
    expect(updated.showBrowserActivity).toBe(false)

    const reread = readWorkspaceSettings(root)
    expect(reread.showBrowserActivity).toBe(false)
  })

  it("sanitizes invalid browser activity setting values", () => {
    ensureWorkspaceDirs(root)
    const workspaceJson = join(root, ".termlings", "workspace.json")
    writeFileSync(
      workspaceJson,
      JSON.stringify(
        {
          version: 1,
          projectName: "settings-test",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          settings: {
            showBrowserActivity: "yes",
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )

    const settings = readWorkspaceSettings(root)
    expect(settings.showBrowserActivity).toBeUndefined()
  })

  it("persists workspace apps and preserves them when updating settings", () => {
    ensureWorkspaceDirs(root)

    const apps = updateWorkspaceApps({
      defaults: {
        crm: false,
        browser: true,
      },
      agents: {
        growth: {
          crm: true,
        },
      },
    }, root)

    expect(apps.defaults?.crm).toBe(false)
    expect(apps.agents?.growth?.crm).toBe(true)

    updateWorkspaceSettings({ showBrowserActivity: false }, root)

    const reread = readWorkspaceApps(root)
    expect(reread.defaults?.crm).toBe(false)
    expect(reread.agents?.growth?.crm).toBe(true)
  })
})
