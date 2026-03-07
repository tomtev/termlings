import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { BrowserClient, stripTabIdentityPrefixes } from "../browser-client.js"

describe("browser tab identity presence", () => {
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
    process.env.TERMLINGS_SESSION_ID = "tl-pm"
    process.env.TERMLINGS_AGENT_SLUG = "pm"
    process.env.TERMLINGS_AGENT_NAME = "Jordan"
    process.env.TERMLINGS_AGENT_DNA = "0a3f201"
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

  it("builds a favicon/title identity script for the connected agent", () => {
    const client = new BrowserClient("9223") as any

    const favicon = client.buildTabIdentityFavicon()
    const script = client.buildTabIdentityScript()
    const svg = decodeURIComponent(favicon.iconHref.replace(/^data:image\/svg\+xml,/, ""))

    expect(favicon.signature).toBe("dna-svg:0a3f201")
    expect(svg).toContain(`width="9"`)
    expect(svg).toContain(`height="9"`)
    expect(svg).toContain(`viewBox="0 0 9 9"`)
    expect(svg).toContain(`shape-rendering="crispEdges"`)
    expect(svg).not.toContain(`<rect width="`)
    expect(svg).toContain(`y="8"`)
    expect(script).toContain("__termlingsTabIdentity")
    expect(script).toContain("data-termlings-tab-identity-disabled")
    expect(script).toContain("MutationObserver")
    expect(script).toContain("characterData")
    expect(script).toContain("data:image/svg+xml,")
    expect(script).toContain("[Jordan] ")
  })

  it("strips prior agent prefixes before applying a new tab identity", () => {
    expect(stripTabIdentityPrefixes("[Rogue] [Spark] [Pebble] Dagbladet")).toBe("Dagbladet")
    expect(stripTabIdentityPrefixes("Dagbladet")).toBe("Dagbladet")
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

  it("passes the tab identity script into navigate so new documents get branded early", async () => {
    const client = new BrowserClient("9223") as any
    let capturedEnv: Record<string, string> | null = null

    client.withSelectedTab = async (_tabId: string | undefined, fn: () => Promise<unknown>) => await fn()
    client.runAgentBrowser = (_args: string[], _timeout?: number, extraEnv?: Record<string, string>) => {
      capturedEnv = extraEnv || null
      return true
    }

    await client.navigate("https://example.com")

    expect(capturedEnv?.TERMLINGS_BROWSER_INIT_SCRIPT_B64).toBeTruthy()
    const decoded = Buffer.from(String(capturedEnv?.TERMLINGS_BROWSER_INIT_SCRIPT_B64 || ""), "base64").toString("utf8")
    expect(decoded).toContain("__termlingsTabIdentity")
  })

  it("keeps an agent on its own tab when an explicit tab belongs to another owner", async () => {
    const client = new BrowserClient("9223") as any
    const selectedCommandTabs: Array<string | null> = []

    writeFileSync(
      join(termlingsDir, "browser", "tab-owners.json"),
      JSON.stringify({
        version: 1,
        owners: {
          "session:tl-other": {
            tabId: "tab-foreign",
            updatedAt: Date.now(),
            sessionId: "tl-other",
            agentSlug: "designer",
            agentName: "Rogue",
          },
          "session:tl-pm": {
            tabId: "tab-own",
            updatedAt: Date.now(),
            sessionId: "tl-pm",
            agentSlug: "pm",
            agentName: "Jordan",
          },
        },
      }, null, 2),
      "utf8",
    )

    client.withBrowserLock = async (fn: () => Promise<unknown>) => await fn()
    client.runAgentBrowser = (args: string[]) => {
      selectedCommandTabs.push(client.commandTabId)
      if (args[0] === "tab") {
        return {
          active: 0,
          tabs: [
            { index: 0, targetId: "tab-foreign", title: "Foreign", url: "https://example.com", active: true },
            { index: 1, targetId: "tab-own", title: "Own", url: "https://example.org", active: false },
          ],
        }
      }
      return true
    }

    await client.withSelectedTab("0", async () => {})

    expect(selectedCommandTabs.filter((tabId) => tabId !== null).every((tabId) => tabId === "tab-own")).toBe(true)

    const owners = JSON.parse(readFileSync(join(termlingsDir, "browser", "tab-owners.json"), "utf8")) as {
      owners: Record<string, { tabId: string }>
    }
    expect(owners.owners["session:tl-other"]?.tabId).toBe("tab-foreign")
    expect(owners.owners["session:tl-pm"]?.tabId).toBe("tab-own")
  })

  it("falls back to agent dna when session and slug are missing", () => {
    delete process.env.TERMLINGS_SESSION_ID
    delete process.env.TERMLINGS_AGENT_SLUG

    const client = new BrowserClient("9223") as any
    expect(client.resolveTabOwnerKey()).toBe("dna:0a3f201")
  })
})
