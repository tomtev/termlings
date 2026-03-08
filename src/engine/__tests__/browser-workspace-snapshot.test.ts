import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  buildBrowserWorkspaceSnapshot,
  readBrowserWorkspaceSnapshot,
  updateProcessState,
  writeBrowserWorkspaceSnapshot,
} from "../browser.js"

describe("browser workspace snapshot", () => {
  const originalIpcDir = process.env.TERMLINGS_IPC_DIR
  let root = ""
  let termlingsDir = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-browser-workspace-snapshot-"))
    termlingsDir = join(root, ".termlings")
    mkdirSync(join(termlingsDir, "browser", "invites"), { recursive: true })
    mkdirSync(join(termlingsDir, "browser", "agents"), { recursive: true })
    process.env.TERMLINGS_IPC_DIR = termlingsDir
  })

  afterEach(() => {
    if (originalIpcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalIpcDir
    rmSync(root, { recursive: true, force: true })
  })

  it("builds a remote-ready browser snapshot from tabs, ownership, invites, and agent presence", () => {
    writeFileSync(
      join(termlingsDir, "browser", "profile.json"),
      JSON.stringify({
        name: "acme-browser",
        location: "/tmp/profile",
        projectName: "acme",
        createdAt: 1,
      }) + "\n",
      "utf8",
    )
    writeFileSync(
      join(termlingsDir, "browser", "tab-owners.json"),
      JSON.stringify({
        version: 1,
        owners: {
          "agent:designer": {
            tabId: "target-1",
            updatedAt: 100,
            agentSlug: "designer",
            agentName: "Rogue",
          },
        },
      }) + "\n",
      "utf8",
    )
    writeFileSync(
      join(termlingsDir, "browser", "agents", "tl-123.json"),
      JSON.stringify({
        sessionId: "tl-123",
        agentName: "Rogue",
        agentSlug: "designer",
        tabId: "target-1",
        status: "active",
        active: true,
        startedAt: 50,
        lastSeenAt: 60,
        lastAction: "navigate",
        lastActionAt: 60,
      }) + "\n",
      "utf8",
    )
    writeFileSync(
      join(termlingsDir, "browser", "invites", "brinv_demo.json"),
      JSON.stringify({
        id: "brinv_demo",
        version: 1,
        tabId: "target-1",
        tabUrl: "https://example.com",
        tabTitle: "Example Domain",
        ownerAgentSlug: "designer",
        ownerAgentName: "Rogue",
        target: "agent:developer",
        targetAgentSlug: "developer",
        status: "pending",
        createdAt: 70,
        updatedAt: 80,
      }) + "\n",
      "utf8",
    )

    updateProcessState({
      pid: 4242,
      port: 9222,
      status: "running",
      startedAt: 10,
      profilePath: "/tmp/profile",
      mode: "cdp",
    })

    const snapshot = buildBrowserWorkspaceSnapshot({
      tabs: [
        {
          id: "1",
          targetId: "target-1",
          title: "Example Domain",
          url: "https://example.com",
          active: true,
        },
      ],
      replaceTabs: true,
    })

    expect(snapshot.process?.status).toBe("running")
    expect(snapshot.profile?.name).toBe("acme-browser")
    expect(snapshot.agents).toHaveLength(1)
    expect(snapshot.owners).toHaveLength(1)
    expect(snapshot.invites).toHaveLength(1)
    expect(snapshot.tabs).toHaveLength(1)
    expect(snapshot.tabs[0]?.owner?.agentSlug).toBe("designer")
    expect(snapshot.tabs[0]?.inviteCount).toBe(1)
    expect(snapshot.tabs[0]?.active).toBe(true)
  })

  it("writes and reads the browser workspace snapshot file", () => {
    const snapshot = writeBrowserWorkspaceSnapshot({
      tabs: [
        {
          id: "tab-1",
          title: "Remote Browser",
          url: "https://example.com",
          active: true,
        },
      ],
      replaceTabs: true,
    })

    const stored = readBrowserWorkspaceSnapshot()
    expect(stored?.version).toBe(snapshot.version)
    expect(stored?.tabs[0]?.title).toBe("Remote Browser")

    const raw = JSON.parse(readFileSync(join(termlingsDir, "browser", "workspace-state.json"), "utf8")) as {
      tabs: Array<{ id: string }>
    }
    expect(raw.tabs[0]?.id).toBe("tab-1")
  })
})
