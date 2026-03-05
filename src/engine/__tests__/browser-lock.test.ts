import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { BrowserClient } from "../browser-client.js"

describe("browser command lock recovery", () => {
  const originalEnv = {
    ipcDir: process.env.TERMLINGS_IPC_DIR,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
  }

  let tempRoot = ""
  let termlingsDir = ""

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "termlings-browser-lock-test-"))
    termlingsDir = join(tempRoot, ".termlings")
    mkdirSync(join(termlingsDir, "browser"), { recursive: true })
    process.env.TERMLINGS_IPC_DIR = termlingsDir
    process.env.TERMLINGS_SESSION_ID = "tl-test-lock"
    process.env.TERMLINGS_AGENT_SLUG = "agent:support"
    process.env.TERMLINGS_AGENT_NAME = "Pickle"
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
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it("reclaims dead lock owners and writes fresh owner metadata", async () => {
    const lockPath = join(termlingsDir, "browser", ".agent-browser.lock")
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999_999_999,
        createdAt: Date.now() - 5_000,
        sessionId: "tl-dead-lock",
        agentSlug: "agent:growth",
        agentName: "Frost",
      }) + "\n",
      "utf8",
    )

    const client = new BrowserClient("9223")
    let observedMetadata: Record<string, unknown> | null = null

    const result = await (client as any).withBrowserLock(async () => {
      observedMetadata = JSON.parse(readFileSync(lockPath, "utf8")) as Record<string, unknown>
      return "ok"
    })

    expect(result).toBe("ok")
    expect(observedMetadata).toMatchObject({
      pid: process.pid,
      sessionId: "tl-test-lock",
      agentSlug: "agent:support",
      agentName: "Pickle",
    })
    expect(existsSync(lockPath)).toBe(false)
  })
})
