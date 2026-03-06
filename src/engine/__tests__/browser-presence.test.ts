import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { BrowserClient } from "../browser-client.js"

describe("browser tab identity presence", () => {
  const originalEnv = {
    ipcDir: process.env.TERMLINGS_IPC_DIR,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
  }

  let tempRoot = ""
  let termlingsDir = ""

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "termlings-browser-presence-test-"))
    termlingsDir = join(tempRoot, ".termlings")
    mkdirSync(join(termlingsDir, "browser"), { recursive: true })
    mkdirSync(join(termlingsDir, "agents", "pm"), { recursive: true })
    writeFileSync(
      join(termlingsDir, "agents", "pm", "SOUL.md"),
      [
        "---",
        "name: Jordan",
        "dna: 0a3f201",
        "---",
        "",
      ].join("\n"),
      "utf8",
    )
    process.env.TERMLINGS_IPC_DIR = termlingsDir
    process.env.TERMLINGS_AGENT_SLUG = "pm"
    process.env.TERMLINGS_AGENT_NAME = "Jordan"
    process.env.TERMLINGS_AGENT_DNA = "0a3f201"
  })

  afterEach(() => {
    if (originalEnv.ipcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalEnv.ipcDir
    if (originalEnv.agentSlug === undefined) delete process.env.TERMLINGS_AGENT_SLUG
    else process.env.TERMLINGS_AGENT_SLUG = originalEnv.agentSlug
    if (originalEnv.agentName === undefined) delete process.env.TERMLINGS_AGENT_NAME
    else process.env.TERMLINGS_AGENT_NAME = originalEnv.agentName
    if (originalEnv.agentDna === undefined) delete process.env.TERMLINGS_AGENT_DNA
    else process.env.TERMLINGS_AGENT_DNA = originalEnv.agentDna
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it("builds a favicon/title identity script for the connected agent", () => {
    const client = new BrowserClient("9223") as any

    const favicon = client.buildTabIdentityFavicon()
    const script = client.buildTabIdentityScript()

    expect(favicon.signature).toBe("dna-svg:0a3f201")
    expect(script).toContain("__termlingsTabIdentity")
    expect(script).toContain("data:image/svg+xml,")
    expect(script).toContain("[Jordan] ")
  })

  it("reapplies agent identity when selecting an owned tab", async () => {
    const client = new BrowserClient("9223") as any
    const selectedCommandTabs: Array<string | null> = []
    const commands: string[][] = []

    client.withBrowserLock = async (fn: () => Promise<unknown>) => await fn()
    client.resolveTabOwnerKey = () => "session:tl-pm"
    client.resolveOrAssignOwnerTabUnlocked = () => "3"
    client.recordOwnerTabUnlocked = () => {}
    client.runAgentBrowser = (args: string[]) => {
      selectedCommandTabs.push(client.commandTabId)
      commands.push(args)
      return true
    }

    await client.withSelectedTab(undefined, async () => {})

    expect(selectedCommandTabs.every((tabId) => tabId === "3")).toBe(true)
    const evalCalls = commands.filter((args) => args[0] === "eval")
    expect(evalCalls.length).toBeGreaterThanOrEqual(1)
    expect(evalCalls[0]?.[1]).toContain("__termlingsTabIdentity")
  })
})
