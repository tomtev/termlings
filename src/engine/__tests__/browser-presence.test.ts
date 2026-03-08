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
    mkdirSync(join(termlingsDir, "browser", "invites"), { recursive: true })
    mkdirSync(join(termlingsDir, "agents", "pm"), { recursive: true })
    mkdirSync(join(termlingsDir, "agents", "designer"), { recursive: true })
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
    writeFileSync(
      join(termlingsDir, "agents", "designer", "SOUL.md"),
      [
        "---",
        "name: Rogue",
        "dna: f0c0a11",
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
    expect(script).toContain('const baseLabel = "Jordan"')
    expect(script).toContain('return "[" + baseLabel + suffix + "] "')
    expect(script).toContain('spinnerFrames: ["", ".", "..", "..."]')
    expect(script).toContain("setBusy(nextBusy)")
    expect(script).not.toContain("titlePrefix,")
  })

  it("strips prior agent prefixes before applying a new tab identity", () => {
    expect(stripTabIdentityPrefixes("[Rogue] [Spark] [Pebble] Dagbladet")).toBe("Dagbladet")
    expect(stripTabIdentityPrefixes("Dagbladet")).toBe("Dagbladet")
  })

  it("reapplies agent identity and toggles busy state when selecting an owned tab", async () => {
    const client = new BrowserClient("9223") as any
    const events: string[] = []

    client.withBrowserLock = async (fn: () => Promise<unknown>) => await fn()
    client.resolveTabOwnerKey = () => "session:tl-pm"
    client.resolveOrAssignOwnerTabUnlocked = () => "3"
    client.recordOwnerTabUnlocked = () => {}
    client.runAgentBrowser = (args: string[]) => {
      const selectedTab = client.commandTabId
      if (args[0] === "eval" && args[1]?.includes("state.setBusy(true)")) {
        events.push(`busy-on:${selectedTab}`)
      } else if (args[0] === "eval" && args[1]?.includes("state.setBusy(false)")) {
        events.push(`busy-off:${selectedTab}`)
      } else if (args[0] === "eval" && args[1]?.includes("__termlingsTabIdentity")) {
        events.push(`identity:${selectedTab}`)
      } else {
        events.push(`${args[0]}:${selectedTab}`)
      }
      return true
    }

    await client.withSelectedTab(undefined, async () => {
      events.push("run")
    })

    expect(events.filter((event) => event.endsWith(":3")).length).toBeGreaterThanOrEqual(4)
    expect(events).toContain("run")
    expect(events).toContain("busy-on:3")
    expect(events).toContain("busy-off:3")
    const firstIdentityIndex = events.findIndex((event) => event === "identity:3")
    const busyOnIndex = events.findIndex((event) => event === "busy-on:3")
    const runIndex = events.findIndex((event) => event === "run")
    const busyOffIndex = events.findIndex((event) => event === "busy-off:3")
    expect(firstIdentityIndex).toBeGreaterThanOrEqual(0)
    expect(busyOnIndex).toBeGreaterThan(firstIdentityIndex)
    expect(runIndex).toBeGreaterThan(busyOnIndex)
    expect(busyOffIndex).toBeGreaterThan(runIndex)
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

  it("previews the avatar cursor before selector clicks and restores it after the action", async () => {
    const client = new BrowserClient("9223") as any
    const events: string[] = []

    client.withSelectedTab = async (_tabId: string | undefined, fn: () => Promise<unknown>) => await fn()
    client.ensureInPageAvatarCursor = async () => {
      events.push("cursor")
    }
    client.animateCursorToSelector = async (selector: string) => {
      events.push(`animate:${selector}`)
    }
    client.recoverCursorAfterPotentialNavigation = async () => {
      events.push("recover")
    }
    client.runAgentBrowser = (args: string[]) => {
      events.push(`run:${args.join(" ")}`)
      return true
    }

    await client.clickSelector("button.submit")

    expect(events).toEqual([
      "cursor",
      "animate:button.submit",
      "run:click button.submit",
      "recover",
    ])
  })

  it("previews the avatar cursor before selector focus actions", async () => {
    const client = new BrowserClient("9223") as any
    const events: string[] = []

    client.withSelectedTab = async (_tabId: string | undefined, fn: () => Promise<unknown>) => await fn()
    client.ensureInPageAvatarCursor = async () => {
      events.push("cursor")
    }
    client.animateCursorToSelector = async (selector: string) => {
      events.push(`animate:${selector}`)
    }
    client.runAgentBrowser = (args: string[]) => {
      events.push(`run:${args[0]}`)
      return { ok: true }
    }

    await client.focusSelector("input[name='email']")

    expect(events).toEqual([
      "cursor",
      "animate:input[name='email']",
      "run:eval",
    ])
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

  it("allows an accepted participant to use a foreign shared tab without stealing ownership", async () => {
    process.env.TERMLINGS_SESSION_ID = "tl-design"
    process.env.TERMLINGS_AGENT_SLUG = "designer"
    process.env.TERMLINGS_AGENT_NAME = "Rogue"
    process.env.TERMLINGS_AGENT_DNA = "f0c0a11"

    const client = new BrowserClient("9223") as any
    const selectedCommandTabs: Array<string | null> = []

    writeFileSync(
      join(termlingsDir, "browser", "tab-owners.json"),
      JSON.stringify({
        version: 1,
        owners: {
          "session:tl-pm": {
            tabId: "tab-foreign",
            updatedAt: Date.now(),
            sessionId: "tl-pm",
            agentSlug: "pm",
            agentName: "Jordan",
          },
          "session:tl-design": {
            tabId: "tab-own",
            updatedAt: Date.now(),
            sessionId: "tl-design",
            agentSlug: "designer",
            agentName: "Rogue",
          },
        },
      }, null, 2),
      "utf8",
    )

    writeFileSync(
      join(termlingsDir, "browser", "invites", "brinv_shared.json"),
      JSON.stringify({
        id: "brinv_shared",
        version: 1,
        tabId: "tab-foreign",
        target: "agent:designer",
        targetAgentSlug: "designer",
        targetAgentName: "Rogue",
        targetAgentDna: "f0c0a11",
        ownerSessionId: "tl-pm",
        ownerAgentSlug: "pm",
        ownerAgentName: "Jordan",
        ownerAgentDna: "0a3f201",
        status: "accepted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        acceptedAt: Date.now(),
        acceptedBySessionId: "tl-design",
        acceptedByAgentSlug: "designer",
        acceptedByAgentName: "Rogue",
        acceptedByAgentDna: "f0c0a11",
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

    expect(selectedCommandTabs.filter((tabId) => tabId !== null).every((tabId) => tabId === "tab-foreign")).toBe(true)

    const owners = JSON.parse(readFileSync(join(termlingsDir, "browser", "tab-owners.json"), "utf8")) as {
      owners: Record<string, { tabId: string }>
    }
    expect(owners.owners["session:tl-pm"]?.tabId).toBe("tab-foreign")
    expect(owners.owners["session:tl-design"]?.tabId).toBe("tab-own")
  })

  it("defaults joined participants into the active shared tab", async () => {
    process.env.TERMLINGS_SESSION_ID = "tl-design"
    process.env.TERMLINGS_AGENT_SLUG = "designer"
    process.env.TERMLINGS_AGENT_NAME = "Rogue"
    process.env.TERMLINGS_AGENT_DNA = "f0c0a11"

    const client = new BrowserClient("9223") as any
    const selectedCommandTabs: Array<string | null> = []

    writeFileSync(
      join(termlingsDir, "browser", "tab-owners.json"),
      JSON.stringify({
        version: 1,
        owners: {
          "session:tl-pm": {
            tabId: "tab-foreign",
            updatedAt: Date.now(),
            sessionId: "tl-pm",
            agentSlug: "pm",
            agentName: "Jordan",
          },
          "session:tl-design": {
            tabId: "tab-own",
            updatedAt: Date.now(),
            sessionId: "tl-design",
            agentSlug: "designer",
            agentName: "Rogue",
          },
        },
      }, null, 2),
      "utf8",
    )

    writeFileSync(
      join(termlingsDir, "browser", "invites", "brinv_shared_default.json"),
      JSON.stringify({
        id: "brinv_shared_default",
        version: 1,
        tabId: "tab-foreign",
        target: "agent:designer",
        targetAgentSlug: "designer",
        targetAgentName: "Rogue",
        targetAgentDna: "f0c0a11",
        ownerSessionId: "tl-pm",
        ownerAgentSlug: "pm",
        ownerAgentName: "Jordan",
        ownerAgentDna: "0a3f201",
        status: "accepted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        acceptedAt: Date.now(),
        acceptedBySessionId: "tl-design",
        acceptedByAgentSlug: "designer",
        acceptedByAgentName: "Rogue",
        acceptedByAgentDna: "f0c0a11",
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

    await client.withSelectedTab(undefined, async () => {})

    expect(selectedCommandTabs.filter((tabId) => tabId !== null).every((tabId) => tabId === "tab-foreign")).toBe(true)
  })

  it("falls back to agent dna when session and slug are missing", () => {
    delete process.env.TERMLINGS_SESSION_ID
    delete process.env.TERMLINGS_AGENT_SLUG

    const client = new BrowserClient("9223") as any
    expect(client.resolveTabOwnerKey()).toBe("dna:0a3f201")
  })
})
