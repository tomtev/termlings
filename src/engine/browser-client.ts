/**
 * CLI wrapper client for agent-browser (native + CDP)
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "fs"
import { spawnSync } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import type { Cookie, HealthCheckResponse } from "./browser-types.js"
import { getTermlingsDir } from "./ipc.js"

export interface BrowserTab {
  id: string
  title?: string
  url?: string
  type?: string
  active?: boolean
  current?: boolean
  selected?: boolean
  focused?: boolean
}

interface AgentBrowserEnvelope {
  success?: boolean
  data?: unknown
  error?: string | null
}

const LOCK_STALE_MS = 30_000
const LOCK_WAIT_TIMEOUT_MS = 20_000

export class BrowserClient {
  private readonly cdpTarget: string
  private readonly timeout: number

  constructor(cdpTarget: number | string, timeout: number = 30_000) {
    this.cdpTarget = String(cdpTarget)
    this.timeout = timeout
  }

  /**
   * Health check - verify CDP endpoint is reachable
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const versionUrl = this.getCdpVersionUrl()
    const response = await fetch(versionUrl, {
      signal: AbortSignal.timeout(Math.min(this.timeout, 3000)),
    })
    if (!response.ok) {
      throw new Error(`CDP health check failed: ${response.status} ${response.statusText}`)
    }
    const version = (await response.json()) as Record<string, unknown>
    return {
      status: "ok",
      version: typeof version.Browser === "string" ? version.Browser : undefined,
    }
  }

  /**
   * Navigate to a URL (active tab by default, or specific tab index)
   */
  async navigate(
    url: string,
    options: {
      tabId?: string
      timeout?: number
      blockImages?: boolean
      blockAds?: boolean
    } = {}
  ): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      this.runAgentBrowser(["open", url], options.timeout)
    })
  }

  /**
   * Take a screenshot and return base64 bytes
   */
  async screenshot(
    options: {
      tabId?: string
      quality?: number
      fullPage?: boolean
      format?: "jpeg" | "png"
    } = {}
  ): Promise<string> {
    return await this.withSelectedTab(options.tabId, async () => {
      const ext = options.format === "jpeg" ? "jpg" : "png"
      const outputPath = join(
        tmpdir(),
        `termlings-browser-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`,
      )

      try {
        const args = ["screenshot", ...(options.fullPage ? ["--full"] : []), outputPath]
        this.runAgentBrowser(args)
        const bytes = readFileSync(outputPath)
        return Buffer.from(bytes).toString("base64")
      } finally {
        try {
          unlinkSync(outputPath)
        } catch {
          // ignore
        }
      }
    })
  }

  /**
   * Type text into the currently focused element (tab-scoped)
   */
  async typeText(
    text: string,
    options: { tabId?: string; selector?: string; ref?: string } = {}
  ): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      if (options.ref && options.ref.trim().length > 0) {
        const ref = options.ref.startsWith("@") ? options.ref : `@${options.ref}`
        this.runAgentBrowser(["type", ref, text])
        return
      }

      if (options.selector && options.selector.trim().length > 0) {
        this.runAgentBrowser(["type", options.selector, text])
        return
      }

      this.runAgentBrowser(["keyboard", "type", text])
    })
  }

  /**
   * Click an element by CSS selector in the chosen tab
   */
  async clickSelector(selector: string, options: { tabId?: string } = {}): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      this.runAgentBrowser(["click", selector])
    })
  }

  /**
   * Extract visible text from page
   */
  async extractText(options: { tabId?: string; raw?: boolean } = {}): Promise<string> {
    return await this.withSelectedTab(options.tabId, async () => {
      const data = this.runAgentBrowser(["get", "text", "body"])
      if (typeof data === "string") return data
      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>
        if (typeof record.text === "string") return record.text
      }
      return ""
    })
  }

  /**
   * Get structured accessibility snapshot
   */
  async snapshot(options: {
    compact?: boolean
    interactive?: boolean
    depth?: number
    maxTokens?: number
    selector?: string
    tabId?: string
  } = {}): Promise<unknown> {
    return await this.withSelectedTab(options.tabId, async () => {
      const args = ["snapshot"]
      if (options.interactive) args.push("-i")
      if (options.compact) args.push("-c")
      if (typeof options.depth === "number") args.push("-d", String(options.depth))
      if (options.selector) args.push("-s", options.selector)
      return this.runAgentBrowser(args)
    })
  }

  /**
   * Get cookies for current page
   */
  async getCookies(options: { tabId?: string } = {}): Promise<Cookie[]> {
    return await this.withSelectedTab(options.tabId, async () => {
      const data = this.runAgentBrowser(["cookies"])
      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>
        if (Array.isArray(record.cookies)) return record.cookies as Cookie[]
      }
      return []
    })
  }

  /**
   * Execute JavaScript expression in page context
   */
  async executeScript(
    script: string,
    _args?: unknown[],
    options: { tabId?: string } = {}
  ): Promise<unknown> {
    return await this.withSelectedTab(options.tabId, async () => {
      const data = this.runAgentBrowser(["eval", script])
      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>
        if ("result" in record) return record.result
      }
      return data
    })
  }

  /**
   * Wait for selector
   */
  async waitForSelector(
    selector: string,
    _timeout: number = 5000,
    options: { tabId?: string } = {}
  ): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      this.runAgentBrowser(["wait", selector])
    })
  }

  /**
   * Get list of open tabs
   */
  async getTabs(): Promise<BrowserTab[]> {
    return await this.withBrowserLock(async () => {
      const data = this.runAgentBrowser(["tab"])
      const record = (data && typeof data === "object" ? data as Record<string, unknown> : {})
      const active = typeof record.active === "number" ? record.active : undefined
      const tabsRaw = Array.isArray(record.tabs) ? record.tabs as Array<Record<string, unknown>> : []

      return tabsRaw.map((tab, index) => {
        const tabIndex = typeof tab.index === "number" ? tab.index : index
        const isActive = typeof tab.active === "boolean" ? tab.active : active === tabIndex
        return {
          id: String(tabIndex),
          title: typeof tab.title === "string" ? tab.title : undefined,
          url: typeof tab.url === "string" ? tab.url : undefined,
          active: isActive,
          current: isActive,
          selected: isActive,
          focused: isActive,
        }
      })
    })
  }

  async createTab(url?: string): Promise<string> {
    return await this.withBrowserLock(async () => {
      const args = ["tab", "new", ...(url ? [url] : [])]
      const data = this.runAgentBrowser(args)
      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>
        if (typeof record.index === "number") {
          return String(record.index)
        }
      }
      const tabs = await this.getTabs()
      if (tabs.length === 0) return ""
      return tabs[tabs.length - 1]!.id
    })
  }

  async closeTab(tabId: string): Promise<void> {
    await this.withBrowserLock(async () => {
      const index = this.normalizeTabId(tabId)
      this.runAgentBrowser(["tab", "close", String(index)])
    })
  }

  async lockTab(_tabId: string, _owner: string, _ttl: number = 3600): Promise<void> {
    // No-op: termlings serializes browser commands via a local lock file.
  }

  async unlockTab(_tabId: string, _owner?: string): Promise<void> {
    // No-op: termlings serializes browser commands via a local lock file.
  }

  async typeIntoRef(tabId: string, ref: string, text: string): Promise<void> {
    await this.withSelectedTab(tabId, async () => {
      const target = ref.startsWith("@") ? ref : `@${ref}`
      this.runAgentBrowser(["type", target, text])
    })
  }

  async pressKey(tabId: string, key: string, _ref?: string): Promise<void> {
    await this.withSelectedTab(tabId, async () => {
      this.runAgentBrowser(["press", key])
    })
  }

  async clickRef(tabId: string, ref: string): Promise<void> {
    await this.withSelectedTab(tabId, async () => {
      const target = ref.startsWith("@") ? ref : `@${ref}`
      this.runAgentBrowser(["click", target])
    })
  }

  private normalizeTabId(tabId: string): number {
    const trimmed = String(tabId || "").trim()
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid tab index: ${tabId}`)
    }
    return Number.parseInt(trimmed, 10)
  }

  private async withSelectedTab<T>(tabId: string | undefined, run: () => Promise<T>): Promise<T> {
    return await this.withBrowserLock(async () => {
      if (typeof tabId === "string" && tabId.trim().length > 0) {
        const index = this.normalizeTabId(tabId)
        this.runAgentBrowser(["tab", String(index)])
      }
      return await run()
    })
  }

  private lockFilePath(): string {
    return join(getTermlingsDir(), "browser", ".agent-browser.lock")
  }

  private async withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = this.lockFilePath()
    mkdirSync(join(getTermlingsDir(), "browser"), { recursive: true })

    const startedAt = Date.now()
    let lockFd: number | null = null

    while (lockFd === null) {
      try {
        lockFd = openSync(lockPath, "wx")
        break
      } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException
        if (maybeErr.code !== "EEXIST") {
          throw error
        }

        try {
          const mtime = statSync(lockPath).mtimeMs
          if (Date.now() - mtime > LOCK_STALE_MS) {
            unlinkSync(lockPath)
            continue
          }
        } catch {
          // ignore races
        }

        if (Date.now() - startedAt > LOCK_WAIT_TIMEOUT_MS) {
          throw new Error("Timed out waiting for browser lock. Another browser command may be stuck.")
        }

        await new Promise((resolve) => setTimeout(resolve, 60))
      }
    }

    try {
      return await fn()
    } finally {
      try {
        if (lockFd !== null) closeSync(lockFd)
      } catch {
        // ignore
      }
      try {
        if (existsSync(lockPath)) unlinkSync(lockPath)
      } catch {
        // ignore
      }
    }
  }

  private runAgentBrowser(commandArgs: string[], timeoutOverride?: number): unknown {
    const timeout = typeof timeoutOverride === "number" && timeoutOverride > 0
      ? timeoutOverride
      : this.timeout

    const args = [
      "--native",
      "--json",
      "--cdp",
      this.cdpTarget,
      ...commandArgs,
    ]

    const proc = spawnSync("agent-browser", args, {
      encoding: "utf8",
      timeout,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        AGENT_BROWSER_DEFAULT_TIMEOUT: String(Math.max(1_000, Math.min(25_000, timeout))),
      },
    })

    if (proc.error) {
      const code = (proc.error as NodeJS.ErrnoException).code
      if (code === "ENOENT") {
        throw new Error("agent-browser CLI not found. Install with: npm install -g agent-browser && agent-browser install")
      }
      if (code === "ETIMEDOUT") {
        throw new Error(`agent-browser command timed out after ${timeout}ms`)
      }
      throw proc.error
    }

    const rawOutput = `${proc.stdout || ""}`.trim()
    const envelope = this.parseEnvelope(rawOutput)

    if ((proc.status ?? 1) !== 0) {
      if (envelope && envelope.error) {
        throw new Error(String(envelope.error))
      }
      if (rawOutput.length > 0) {
        throw new Error(rawOutput)
      }
      throw new Error(`agent-browser exited with status ${proc.status}`)
    }

    if (!envelope) return rawOutput
    if (envelope.success === false) {
      throw new Error(envelope.error || "agent-browser command failed")
    }
    return envelope.data
  }

  private parseEnvelope(raw: string): AgentBrowserEnvelope | null {
    if (!raw) return null

    try {
      return JSON.parse(raw) as AgentBrowserEnvelope
    } catch {
      // Some commands may emit extra lines; try last JSON line.
    }

    const lines = raw.split(/\r?\n/)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!.trim()
      if (!line.startsWith("{")) continue
      try {
        return JSON.parse(line) as AgentBrowserEnvelope
      } catch {
        // keep scanning upwards
      }
    }

    return null
  }

  private getCdpVersionUrl(): string {
    const trimmed = this.cdpTarget.trim()

    if (/^\\d+$/.test(trimmed)) {
      return `http://127.0.0.1:${trimmed}/json/version`
    }

    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      const url = new URL(trimmed)
      const protocol = url.protocol === "wss:" ? "https:" : "http:"
      return `${protocol}//${url.host}/json/version`
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed)
      return `${url.protocol}//${url.host}/json/version`
    }

    // Fallback: assume host:port
    return `http://${trimmed}/json/version`
  }
}
