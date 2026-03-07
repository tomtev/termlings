import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  closeActiveAgentBrowserStates,
  logBrowserActivity,
  readAllAgentBrowserStates,
  syncAgentBrowserPresence,
} from "../browser.js"

describe("browser presence lifecycle", () => {
  const originalEnv = {
    ipcDir: process.env.TERMLINGS_IPC_DIR,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
  }

  let tempRoot = ""
  let termlingsDir = ""

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "termlings-browser-lifecycle-test-"))
    termlingsDir = join(tempRoot, ".termlings")
    mkdirSync(join(termlingsDir, "browser"), { recursive: true })
    process.env.TERMLINGS_IPC_DIR = termlingsDir
    process.env.TERMLINGS_SESSION_ID = "tl-browser-lifecycle"
    process.env.TERMLINGS_AGENT_SLUG = "developer"
    process.env.TERMLINGS_AGENT_NAME = "Haze"
    process.env.TERMLINGS_AGENT_DNA = "66a0f5"
  })

  afterEach(() => {
    if (originalEnv.ipcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalEnv.ipcDir
    if (originalEnv.sessionId === undefined) delete process.env.TERMLINGS_SESSION_ID
    else process.env.TERMLINGS_SESSION_ID = originalEnv.sessionId
    if (originalEnv.agentSlug === undefined) delete process.env.TERMLINGS_AGENT_SLUG
    else process.env.TERMLINGS_AGENT_SLUG = originalEnv.agentSlug
    if (originalEnv.agentName === undefined) delete process.env.TERMLINGS_AGENT_NAME
    else process.env.TERMLINGS_AGENT_NAME = originalEnv.agentName
    if (originalEnv.agentDna === undefined) delete process.env.TERMLINGS_AGENT_DNA
    else process.env.TERMLINGS_AGENT_DNA = originalEnv.agentDna
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it("writes active browser presence and emits an opened event on first successful command", () => {
    logBrowserActivity("navigate", ["https://example.com"], "success", undefined, "tab-1")

    const statePath = join(termlingsDir, "browser", "agents", "tl-browser-lifecycle.json")
    const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>
    expect(state.status).toBe("active")
    expect(state.active).toBe(true)
    expect(state.startedAt).toBeTypeOf("number")
    expect(state.lastSeenAt).toBeTypeOf("number")
    expect(state.lastAction).toBe("navigate")
    expect(state.tabId).toBe("tab-1")

    const historyPath = join(termlingsDir, "browser", "history", "all.jsonl")
    const lines = readFileSync(historyPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((entry) => entry.command)).toEqual(["navigate", "presence-opened"])
  })

  it("marks stale browser presence idle and emits an idle event", () => {
    logBrowserActivity("navigate", ["https://example.com"], "success", undefined, "tab-1")

    const statePath = join(termlingsDir, "browser", "agents", "tl-browser-lifecycle.json")
    const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>
    state.lastSeenAt = Date.now() - 10_000
    state.lastActionAt = Date.now() - 10_000
    writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8")

    const states = syncAgentBrowserPresence(1_000)
    expect(states[0]?.status).toBe("idle")
    expect(states[0]?.active).toBe(false)
    expect(states[0]?.endedAt).toBeTypeOf("number")
    expect(states[0]?.endReason).toBe("idle")

    const historyPath = join(termlingsDir, "browser", "history", "all.jsonl")
    const lines = readFileSync(historyPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((entry) => entry.command)).toContain("presence-idle")
  })

  it("marks active browser presence closed when the browser stops", () => {
    logBrowserActivity("navigate", ["https://example.com"], "success", undefined, "tab-1")

    const closed = closeActiveAgentBrowserStates("closed")
    expect(closed).toHaveLength(1)

    const states = readAllAgentBrowserStates()
    expect(states[0]?.status).toBe("closed")
    expect(states[0]?.active).toBe(false)
    expect(states[0]?.endReason).toBe("closed")

    const historyPath = join(termlingsDir, "browser", "history", "all.jsonl")
    const lines = readFileSync(historyPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((entry) => entry.command)).toContain("presence-closed")
  })
})
