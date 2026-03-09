import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { spawnSync } from "child_process"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { readRecentThreadActivityEntries } from "../../engine/activity.js"
import { appendWorkspaceMessage, ensureWorkspaceDirs } from "../../workspace/state.js"

const CLI_ENTRY = join(import.meta.dir, "../../../bin/termlings.js")

function runCli(root: string, args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, ["run", CLI_ENTRY, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  })
}

describe("read activity logging", () => {
  let root = ""
  let originalCwd = ""

  const agentEnv = {
    TERMLINGS_IPC_DIR: "",
    TERMLINGS_SESSION_ID: "tl-designer-1",
    TERMLINGS_AGENT_SLUG: "designer",
    TERMLINGS_AGENT_NAME: "Storm",
    TERMLINGS_AGENT_DNA: "abc1234",
  }

  beforeEach(() => {
    originalCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), "termlings-read-activity-"))
    process.chdir(root)
    ensureWorkspaceDirs(root)
    agentEnv.TERMLINGS_IPC_DIR = join(root, ".termlings")
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("logs brief reads to the current agent thread", () => {
    const result = runCli(root, ["brief", "--json"], agentEnv)
    expect(result.status).toBe(0)

    const entries = readRecentThreadActivityEntries("agent:designer", 10, root)
    expect(entries.map((entry) => entry.text)).toContain("read brief for workspace context.")
    expect(entries.some((entry) => entry.app === "brief" && entry.kind === "read")).toBe(true)
  })

  it("logs conversation reads to the current agent thread", () => {
    appendWorkspaceMessage({
      kind: "dm",
      from: "human:default",
      fromName: "Owner",
      target: "agent:designer",
      targetName: "Storm",
      targetDna: "abc1234",
      text: "Need a design update.",
    }, root)

    const result = runCli(root, ["conversation", "human:default", "--limit", "20"], agentEnv)
    expect(result.status).toBe(0)

    const entries = readRecentThreadActivityEntries("agent:designer", 10, root)
    expect(entries.map((entry) => entry.text)).toContain("checked earlier conversation with Owner.")
    expect(entries.some((entry) => entry.app === "messaging" && entry.kind === "conversation-read")).toBe(true)
  })
})
