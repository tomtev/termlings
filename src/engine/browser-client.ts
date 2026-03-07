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
  writeFileSync,
} from "fs"
import { spawnSync } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { fileURLToPath } from "url"
import type { Cookie, HealthCheckResponse } from "./browser-types.js"
import { getTermlingsDir } from "./ipc.js"
import { getAvatarCSS, renderLayeredSVG, renderSVGSmall } from "../index.js"

export interface BrowserTab {
  id: string
  targetId?: string
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

const LOCK_STALE_MS = 120_000
const LOCK_WAIT_TIMEOUT_MS = 35_000
const TAB_OWNER_STATE_VERSION = 1
const TAB_OWNER_STALE_MS = 7 * 24 * 60 * 60 * 1000

interface BrowserLockMetadata {
  pid: number
  createdAt: number
  sessionId?: string
  agentSlug?: string
  agentName?: string
}

interface TabOwnerRecord {
  tabId: string
  updatedAt: number
  sessionId?: string
  agentSlug?: string
  agentName?: string
}

interface TabOwnerState {
  version: number
  owners: Record<string, TabOwnerRecord>
}

export const TAB_IDENTITY_TITLE_PREFIX_RE = /^(\[[^\]]+\]\s*)+/

export function stripTabIdentityPrefixes(title: string): string {
  return String(title || "").replace(TAB_IDENTITY_TITLE_PREFIX_RE, "").trimStart()
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readBrowserLockMetadata(lockPath: string): BrowserLockMetadata | null {
  if (!existsSync(lockPath)) return null
  try {
    const raw = readFileSync(lockPath, "utf8").trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrowserLockMetadata>
    const pid = typeof parsed.pid === "number" ? parsed.pid : Number.parseInt(String(parsed.pid ?? ""), 10)
    if (!Number.isFinite(pid) || pid <= 0) return null
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0
    return {
      pid,
      createdAt,
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      agentSlug: typeof parsed.agentSlug === "string" ? parsed.agentSlug : undefined,
      agentName: typeof parsed.agentName === "string" ? parsed.agentName : undefined,
    }
  } catch {
    return null
  }
}

export class BrowserClient {
  private readonly cdpTarget: string
  private readonly timeout: number
  private commandTabId: string | null = null
  private tabIdentityScript: string | null = null
  private tabIdentityScriptBuiltAt = 0
  private cursorScript: string | null = null
  private cursorScriptBuiltAt = 0
  private cursorLastX: number | null = null
  private cursorLastY: number | null = null
  private lastSelectedTabId: string | null = null

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
      this.runAgentBrowser(["open", url], options.timeout, this.buildTabIdentityInitScriptEnv())
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

  async focusSelector(selector: string, options: { tabId?: string } = {}): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      const selectorJson = JSON.stringify(selector)
      const result = this.runAgentBrowser([
        "eval",
        `(() => {
          const el = document.querySelector(${selectorJson});
          if (!el) return { ok: false, reason: "not-found" };
          try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}
          try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
          return { ok: true };
        })()`,
      ])

      const record = (result && typeof result === "object" ? result as Record<string, unknown> : null)
      const state = (() => {
        if (!record) return null
        if (typeof record.ok === "boolean") return record
        const nested = record.result
        if (nested && typeof nested === "object") {
          const nestedRecord = nested as Record<string, unknown>
          if (typeof nestedRecord.ok === "boolean") return nestedRecord
        }
        return null
      })()
      if (state && state.ok === false) {
        throw new Error(`Element not found for focus selector: ${selector}`)
      }
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
      return this.listTabsUnlocked()
    })
  }

  async createTab(url?: string): Promise<string> {
    return await this.withBrowserLock(async () => {
      const tabId = this.createTabUnlocked(url)
      if (tabId) {
        const ownerKey = this.resolveTabOwnerKey()
        if (ownerKey) {
          this.recordOwnerTabUnlocked(ownerKey, tabId)
        }
        this.lastSelectedTabId = tabId
        await this.withCommandTab(tabId, async () => {
          await this.ensureTabIdentityOnSelectedTab()
        })
      }
      return tabId
    })
  }

  async closeTab(tabId: string): Promise<void> {
    await this.withBrowserLock(async () => {
      const stableTabId = this.resolveTabRefUnlocked(tabId)
      this.runAgentBrowser(["tab", "close", stableTabId])
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

  async ensureAvatarCursor(options: { tabId?: string; force?: boolean } = {}): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      await this.ensureInPageAvatarCursor(options.force === true)
    })
  }

  getLastSelectedTabId(): string | null {
    return this.lastSelectedTabId
  }

  private normalizeTabRef(tabId: string): string {
    const trimmed = String(tabId || "").trim()
    if (!trimmed) {
      throw new Error(`Invalid tab reference: ${tabId}`)
    }
    return trimmed
  }

  private resolveStableTabId(tab: BrowserTab): string {
    const targetId = (tab.targetId || "").trim()
    if (targetId) return targetId
    return this.normalizeTabRef(tab.id)
  }

  private resolveTabRefUnlocked(tabRef: string): string {
    const normalized = this.normalizeTabRef(tabRef)
    const tabs = this.listTabsUnlocked()
    const byStableId = tabs.find((tab) => this.resolveStableTabId(tab) === normalized)
    if (byStableId) return this.resolveStableTabId(byStableId)
    if (/^\d+$/.test(normalized)) {
      const byDisplayId = tabs.find((tab) => tab.id === normalized)
      if (byDisplayId) return this.resolveStableTabId(byDisplayId)
    }
    throw new Error(`Invalid tab reference: ${tabRef}`)
  }

  private async withSelectedTab<T>(tabId: string | undefined, run: () => Promise<T>): Promise<T> {
    return await this.withBrowserLock(async () => {
      const ownerKey = this.resolveTabOwnerKey()
      let resolvedTabId: string | null = null

      if (typeof tabId === "string" && tabId.trim().length > 0) {
        const requestedTabId = this.resolveTabRefUnlocked(tabId)
        if (ownerKey) {
          const requestedOwnerKey = this.findOwnerKeyForTabUnlocked(requestedTabId)
          if (requestedOwnerKey && requestedOwnerKey !== ownerKey) {
            resolvedTabId = this.resolveOrAssignOwnerTabUnlocked(ownerKey)
          } else {
            resolvedTabId = requestedTabId
            this.recordOwnerTabUnlocked(ownerKey, resolvedTabId)
          }
        } else {
          resolvedTabId = requestedTabId
        }
      } else if (ownerKey) {
        resolvedTabId = this.resolveOrAssignOwnerTabUnlocked(ownerKey)
      }

      if (resolvedTabId) {
        this.lastSelectedTabId = resolvedTabId
      } else {
        this.lastSelectedTabId = null
      }

      return await this.withCommandTab(resolvedTabId, async () => {
        const result = await run()

        if (resolvedTabId) {
          if (ownerKey) {
            this.recordOwnerTabUnlocked(ownerKey, resolvedTabId)
          }
          await this.ensureTabIdentityOnSelectedTab()
        }
        return result
      })
    })
  }

  private async withCommandTab<T>(tabId: string | null, run: () => Promise<T>): Promise<T> {
    const previous = this.commandTabId
    this.commandTabId = tabId
    try {
      return await run()
    } finally {
      this.commandTabId = previous
    }
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
        const lockMetadata: BrowserLockMetadata = {
          pid: process.pid,
          createdAt: Date.now(),
          sessionId: process.env.TERMLINGS_SESSION_ID,
          agentSlug: process.env.TERMLINGS_AGENT_SLUG,
          agentName: process.env.TERMLINGS_AGENT_NAME,
        }
        try {
          writeFileSync(lockFd, `${JSON.stringify(lockMetadata)}\n`, "utf8")
        } catch (error) {
          try {
            closeSync(lockFd)
          } catch {}
          lockFd = null
          try {
            if (existsSync(lockPath)) unlinkSync(lockPath)
          } catch {}
          throw error
        }
        break
      } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException
        if (maybeErr.code !== "EEXIST") {
          throw error
        }

        const currentOwner = readBrowserLockMetadata(lockPath)
        if (currentOwner && !isProcessAlive(currentOwner.pid)) {
          try {
            unlinkSync(lockPath)
            continue
          } catch {
            // ignore races
          }
        }

        try {
          const mtime = statSync(lockPath).mtimeMs
          if (!currentOwner && Date.now() - mtime > LOCK_STALE_MS) {
            unlinkSync(lockPath)
            continue
          }
        } catch {
          // ignore races
        }

        if (Date.now() - startedAt > LOCK_WAIT_TIMEOUT_MS) {
          const ownerLabel =
            currentOwner?.agentName ||
            currentOwner?.agentSlug ||
            currentOwner?.sessionId ||
            (currentOwner ? `pid ${currentOwner.pid}` : null)
          const ownerContext = ownerLabel ? ` Current owner: ${ownerLabel}.` : ""
          throw new Error(`Timed out waiting for browser lock.${ownerContext} Another browser command may be stuck.`)
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

  private listTabsUnlocked(): BrowserTab[] {
    const data = this.runAgentBrowser(["tab"])
    const record = (data && typeof data === "object" ? data as Record<string, unknown> : {})
    const active = typeof record.active === "number" ? record.active : undefined
    const tabsRaw = Array.isArray(record.tabs) ? record.tabs as Array<Record<string, unknown>> : []

    return tabsRaw.map((tab, index) => {
      const tabIndex = typeof tab.index === "number" ? tab.index : index
      const isActive = typeof tab.active === "boolean" ? tab.active : active === tabIndex
      return {
        id: String(tabIndex),
        targetId: typeof tab.targetId === "string" ? tab.targetId : undefined,
        title: typeof tab.title === "string" ? tab.title : undefined,
        url: typeof tab.url === "string" ? tab.url : undefined,
        active: isActive,
        current: isActive,
        selected: isActive,
        focused: isActive,
      }
    })
  }

  private createTabUnlocked(url?: string): string {
    const args = ["tab", "new", ...(url ? [url] : [])]
    const data = this.runAgentBrowser(args)
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>
      if (typeof record.targetId === "string" && record.targetId.trim().length > 0) {
        return record.targetId.trim()
      }
    }

    const tabs = this.listTabsUnlocked()
    if (tabs.length === 0) return ""
    const lastTab = tabs[tabs.length - 1]
    if (!lastTab) return ""
    return this.resolveStableTabId(lastTab)
  }

  private selectTabUnlocked(tabId: string): void {
    const stableTabId = this.resolveTabRefUnlocked(tabId)
    this.runAgentBrowser(["tab", stableTabId])
  }

  private tabOwnerStatePath(): string {
    return join(getTermlingsDir(), "browser", "tab-owners.json")
  }

  private emptyTabOwnerState(): TabOwnerState {
    return { version: TAB_OWNER_STATE_VERSION, owners: {} }
  }

  private readTabOwnerStateUnlocked(): TabOwnerState {
    const statePath = this.tabOwnerStatePath()
    if (!existsSync(statePath)) return this.emptyTabOwnerState()
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<TabOwnerState>
      const owners: Record<string, TabOwnerRecord> = {}
      const rawOwners = parsed.owners && typeof parsed.owners === "object"
        ? parsed.owners as Record<string, Partial<TabOwnerRecord>>
        : {}
      for (const [ownerKey, raw] of Object.entries(rawOwners)) {
        const tabIdRaw = typeof raw?.tabId === "string" ? raw.tabId.trim() : ""
        const updatedAt = typeof raw?.updatedAt === "number" ? raw.updatedAt : 0
        if (!tabIdRaw || updatedAt <= 0) continue
        owners[ownerKey] = {
          tabId: tabIdRaw,
          updatedAt,
          sessionId: typeof raw?.sessionId === "string" ? raw.sessionId : undefined,
          agentSlug: typeof raw?.agentSlug === "string" ? raw.agentSlug : undefined,
          agentName: typeof raw?.agentName === "string" ? raw.agentName : undefined,
        }
      }
      return {
        version: typeof parsed.version === "number" ? parsed.version : TAB_OWNER_STATE_VERSION,
        owners,
      }
    } catch {
      return this.emptyTabOwnerState()
    }
  }

  private writeTabOwnerStateUnlocked(state: TabOwnerState): void {
    const now = Date.now()
    const normalized: TabOwnerState = {
      version: TAB_OWNER_STATE_VERSION,
      owners: {},
    }
    for (const [ownerKey, owner] of Object.entries(state.owners || {})) {
      const tabId = (owner.tabId || "").trim()
      if (!tabId) continue
      const updatedAt = typeof owner.updatedAt === "number" && owner.updatedAt > 0
        ? owner.updatedAt
        : now
      normalized.owners[ownerKey] = {
        tabId,
        updatedAt,
        sessionId: owner.sessionId,
        agentSlug: owner.agentSlug,
        agentName: owner.agentName,
      }
    }
    const browserDir = join(getTermlingsDir(), "browser")
    mkdirSync(browserDir, { recursive: true })
    writeFileSync(this.tabOwnerStatePath(), JSON.stringify(normalized, null, 2) + "\n")
  }

  private pruneTabOwnerStateUnlocked(state: TabOwnerState, knownTabIds: Set<string>): void {
    const cutoff = Date.now() - TAB_OWNER_STALE_MS
    for (const [ownerKey, owner] of Object.entries(state.owners)) {
      if (owner.updatedAt < cutoff) {
        delete state.owners[ownerKey]
        continue
      }
      if (!knownTabIds.has(owner.tabId)) {
        delete state.owners[ownerKey]
      }
    }
  }

  private resolveTabOwnerKey(): string | null {
    const sessionId = (process.env.TERMLINGS_SESSION_ID || "").trim()
    if (sessionId) return `session:${sessionId}`
    const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
    if (agentSlug) return `agent:${agentSlug}`
    const agentDna = (process.env.TERMLINGS_AGENT_DNA || "").trim().toLowerCase()
    if (/^[0-9a-f]{6,16}$/.test(agentDna)) return `dna:${agentDna}`
    const agentName = (process.env.TERMLINGS_AGENT_NAME || "").trim()
    if (agentName) return `name:${agentName}`
    return null
  }

  private findOwnerKeyForTabUnlocked(tabId: string): string | null {
    const tabs = this.listTabsUnlocked()
    const knownTabIds = new Set(tabs.map((tab) => this.resolveStableTabId(tab)))
    const state = this.readTabOwnerStateUnlocked()
    this.pruneTabOwnerStateUnlocked(state, knownTabIds)
    this.writeTabOwnerStateUnlocked(state)

    for (const [ownerKey, owner] of Object.entries(state.owners)) {
      if ((owner.tabId || "").trim() === tabId) {
        return ownerKey
      }
    }
    return null
  }

  private recordOwnerTabUnlocked(ownerKey: string, tabId: string): void {
    const state = this.readTabOwnerStateUnlocked()
    state.owners[ownerKey] = {
      tabId,
      updatedAt: Date.now(),
      sessionId: (process.env.TERMLINGS_SESSION_ID || "").trim() || undefined,
      agentSlug: (process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined,
      agentName: (process.env.TERMLINGS_AGENT_NAME || "").trim() || undefined,
    }
    this.writeTabOwnerStateUnlocked(state)
  }

  private resolveOrAssignOwnerTabUnlocked(ownerKey: string): string | null {
    const tabs = this.listTabsUnlocked()
    const knownTabIds = new Set(tabs.map((tab) => this.resolveStableTabId(tab)))
    const state = this.readTabOwnerStateUnlocked()
    this.pruneTabOwnerStateUnlocked(state, knownTabIds)

    const existing = state.owners[ownerKey]
    if (existing && knownTabIds.has(existing.tabId)) {
      existing.updatedAt = Date.now()
      state.owners[ownerKey] = existing
      this.writeTabOwnerStateUnlocked(state)
      return existing.tabId
    }

    // Agent sessions get isolated tabs by default. Reusing Chrome's initial
    // bootstrap tab is unreliable in headed mode and can leave background
    // navigation stuck on about:blank.
    let assignedTabId = this.createTabUnlocked("about:blank")

    if (!assignedTabId) {
      this.writeTabOwnerStateUnlocked(state)
      return null
    }

    state.owners[ownerKey] = {
      tabId: assignedTabId,
      updatedAt: Date.now(),
      sessionId: (process.env.TERMLINGS_SESSION_ID || "").trim() || undefined,
      agentSlug: (process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined,
      agentName: (process.env.TERMLINGS_AGENT_NAME || "").trim() || undefined,
    }
    this.writeTabOwnerStateUnlocked(state)
    return assignedTabId
  }

  private shouldPreserveForegroundApp(): boolean {
    if (process.platform !== "darwin") return false
    const raw = (process.env.TERMLINGS_BROWSER_PRESERVE_FOCUS || "").trim().toLowerCase()
    if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false
    if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true
    return (process.env.TERMLINGS_SESSION_ID || "").trim().length > 0
  }

  private captureFrontmostMacApp(): string | null {
    if (!this.shouldPreserveForegroundApp()) return null
    try {
      const proc = spawnSync(
        "osascript",
        ["-e", "tell application \"System Events\" to get name of first application process whose frontmost is true"],
        {
          encoding: "utf8",
          timeout: 800,
          stdio: ["ignore", "pipe", "ignore"],
        },
      )
      if ((proc.status ?? 1) !== 0) return null
      const name = String(proc.stdout || "").trim()
      if (!name) return null
      const normalized = name.toLowerCase()
      if (normalized.includes("chrome") || normalized.includes("chromium")) return null
      return name
    } catch {
      return null
    }
  }

  private restoreFrontmostMacApp(appName: string | null): void {
    if (!appName) return
    try {
      spawnSync(
        "osascript",
        ["-e", `tell application ${JSON.stringify(appName)} to activate`],
        {
          encoding: "utf8",
          timeout: 800,
          stdio: ["ignore", "ignore", "ignore"],
        },
      )
    } catch {
      // best-effort only
    }
  }

  private browserRunnerPath(): string {
    return fileURLToPath(new URL("./browser-runner.mjs", import.meta.url))
  }

  private runAgentBrowser(
    commandArgs: string[],
    timeoutOverride?: number,
    extraEnv: Record<string, string> = {},
  ): unknown {
    const timeout = typeof timeoutOverride === "number" && timeoutOverride > 0
      ? timeoutOverride
      : this.timeout

    const args = [
      this.browserRunnerPath(),
      "--cdp",
      this.cdpTarget,
      ...commandArgs,
    ]

    const frontmostApp = this.captureFrontmostMacApp()
    const proc = spawnSync("node", args, {
      encoding: "utf8",
      timeout,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        TERMLINGS_BROWSER_TIMEOUT_MS: String(Math.max(1_000, Math.min(25_000, timeout))),
        ...(this.commandTabId ? { TERMLINGS_BROWSER_SELECTED_TAB_ID: this.commandTabId } : {}),
        ...extraEnv,
      },
    })
    this.restoreFrontmostMacApp(frontmostApp)

    if (proc.error) {
      const code = (proc.error as NodeJS.ErrnoException).code
      if (code === "ENOENT") {
        throw new Error("Browser runner failed to start")
      }
      if (code === "ETIMEDOUT") {
        throw new Error(`Browser command timed out after ${timeout}ms`)
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
      throw new Error(`Browser runner exited with status ${proc.status}`)
    }

    if (!envelope) return rawOutput
    if (envelope.success === false) {
      throw new Error(envelope.error || "Browser command failed")
    }
    return envelope.data
  }

  private shouldInjectAvatarCursor(): boolean {
    const raw = (process.env.TERMLINGS_BROWSER_INPAGE_CURSOR || "").trim().toLowerCase()
    if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false
    return true
  }

  private shouldFollowNativePointer(): boolean {
    // Keep browser avatar movement agent-driven only.
    // Native pointer mirroring caused confusing "follow my mouse" behavior.
    return false
  }

  private resolveAvatarCandidateSlugs(): string[] {
    const slug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
    if (slug) return [slug]
    return []
  }

  private resolveTabIdentityLabel(): string | null {
    const name = (process.env.TERMLINGS_AGENT_NAME || "").trim()
    if (name) {
      return name.length > 18 ? `${name.slice(0, 17)}…` : name
    }

    const slug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
    if (!slug) return null
    return slug.length > 18 ? `${slug.slice(0, 17)}…` : slug
  }

  private readAgentDNA(slug: string): string | null {
    if (!slug) return null
    const soulPath = join(getTermlingsDir(), "agents", slug, "SOUL.md")
    if (!existsSync(soulPath)) return null
    try {
      const content = readFileSync(soulPath, "utf8")
      const match = content.match(/^\s*dna:\s*([0-9a-f]{6,16})\s*$/im)
      return match?.[1]?.toLowerCase() || null
    } catch {
      return null
    }
  }

  private readPreferredAgentDna(): string | null {
    const fromEnv = (process.env.TERMLINGS_AGENT_DNA || "").trim().toLowerCase()
    if (/^[0-9a-f]{6,16}$/.test(fromEnv)) {
      return fromEnv
    }

    for (const slug of this.resolveAvatarCandidateSlugs()) {
      const dna = this.readAgentDNA(slug)
      if (dna) return dna
    }

    return null
  }

  private svgToDataUrl(svg: string): string {
    const compact = svg
      .replace(/\r?\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
    return `data:image/svg+xml,${encodeURIComponent(compact)}`
  }

  private getTabIdentityScript(force = false): string | null {
    const now = Date.now()
    if (!this.tabIdentityScript || force || now - this.tabIdentityScriptBuiltAt > 2_500) {
      this.tabIdentityScript = this.buildTabIdentityScript()
      this.tabIdentityScriptBuiltAt = now
    }
    return this.tabIdentityScript
  }

  private buildTabIdentityInitScriptEnv(force = false): Record<string, string> {
    const script = this.getTabIdentityScript(force)
    if (!script) return {}
    return {
      TERMLINGS_BROWSER_INIT_SCRIPT_B64: Buffer.from(script, "utf8").toString("base64"),
    }
  }

  private buildTabIdentityFavicon(): { iconHref: string; signature: string } {
    const agentDna = this.readPreferredAgentDna()
    if (agentDna) {
      try {
        const svg = renderSVGSmall(agentDna, 1, 0, null, 0)
        return {
          iconHref: this.svgToDataUrl(svg),
          signature: `dna-svg:${agentDna}`,
        }
      } catch {
        // fall through to label-only favicon below
      }
    }

    const label = this.resolveTabIdentityLabel() || "A"
    const glyph = label.slice(0, 1).toUpperCase()
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">`,
      `<text x="8" y="11" text-anchor="middle" font-family="monospace" font-size="8" fill="#111827">${glyph}</text>`,
      `</svg>`,
    ].join("")
    return {
      iconHref: this.svgToDataUrl(svg),
      signature: `glyph:${glyph}`,
    }
  }

  private buildTabIdentityScript(): string | null {
    const label = this.resolveTabIdentityLabel()
    if (!label) return null

    const favicon = this.buildTabIdentityFavicon()
    const prefixPatternJson = JSON.stringify(TAB_IDENTITY_TITLE_PREFIX_RE.source)
    const signatureJson = JSON.stringify(`label:${label}:${favicon.signature}`)
    const prefixJson = JSON.stringify(`[${label}] `)
    const iconHrefJson = JSON.stringify(favicon.iconHref)

    return `(() => {
  const GLOBAL_KEY = "__termlingsTabIdentity";
  const ICON_ID = "__termlingsTabIdentityIcon";
  const ICON_SELECTOR = 'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]';
  const signature = ${signatureJson};
      const iconHref = ${iconHrefJson};
      const titlePrefix = ${prefixJson};
      const root = document.documentElement || document;
      if (!root) return { ok: false, reason: "no-root" };

  const previous = window[GLOBAL_KEY];
  if (previous && previous.signature === signature && typeof previous.apply === "function") {
    previous.apply();
    return { ok: true, reused: true, title: document.title };
  }

  const state = {
    signature,
    titlePrefix,
    iconHref,
    originalTitle: "",
    observer: null,
    scheduled: false,
    normalizeTitle(rawTitle) {
      const text = typeof rawTitle === "string" ? rawTitle : "";
      return text.replace(new RegExp(${prefixPatternJson}), "").trimStart();
    },
    applyIcon(head) {
      const existingIcons = Array.from(document.querySelectorAll(ICON_SELECTOR));
      for (const node of existingIcons) {
        if (!node || node.id === ICON_ID || node.getAttribute("data-termlings-tab-identity") === "1") continue;
        node.setAttribute("data-termlings-tab-identity-disabled", "1");
        node.setAttribute("data-termlings-original-rel", node.getAttribute("rel") || "");
        if (node.hasAttribute("href")) {
          node.setAttribute("data-termlings-original-href", node.getAttribute("href") || "");
        }
        node.setAttribute("rel", "alternate");
        node.removeAttribute("href");
      }

      let icon = document.getElementById(ICON_ID);
      if (!icon || icon.tagName !== "LINK") {
        icon = document.createElement("link");
        icon.id = ICON_ID;
        icon.setAttribute("data-termlings-tab-identity", "1");
      }
      icon.setAttribute("rel", "icon");
      icon.setAttribute("type", "image/svg+xml");
      icon.setAttribute("sizes", "any");
      const currentHref = icon.getAttribute("href") || "";
      if (!currentHref.startsWith(iconHref)) {
        this.iconNonce = (this.iconNonce || 0) + 1;
        icon.setAttribute("href", iconHref + "#t=" + this.iconNonce);
      }
      if (!icon.parentNode) {
        head.insertBefore(icon, head.firstChild || null);
      } else if (head.firstChild !== icon) {
        head.insertBefore(icon, head.firstChild || null);
      }
    },
    ensureObserver() {
      if (this.observer || typeof MutationObserver !== "function") return;
      const scheduleApply = () => {
        if (this.scheduled) return;
        this.scheduled = true;
        setTimeout(() => {
          this.scheduled = false;
          try { this.apply(); } catch {}
        }, 0);
      };
      this.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            scheduleApply();
            return;
          }
          if (mutation.type === "characterData") {
            const target = mutation.target;
            const parent = target && target.parentElement;
            if (parent && parent.tagName === "TITLE") {
              scheduleApply();
              return;
            }
          }
          if (mutation.type === "attributes") {
            const target = mutation.target;
            if (target && target.nodeType === Node.ELEMENT_NODE) {
              const el = target;
              const rel = (el.getAttribute && el.getAttribute("rel")) || "";
              if ((rel && /icon/i.test(rel)) || el.id === ICON_ID) {
                scheduleApply();
                return;
              }
            }
          }
        }
      });
      this.observer.observe(document.documentElement || document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href", "rel"],
      });
    },
    apply() {
      const head = document.head || document.getElementsByTagName("head")[0] || root;
      if (head) {
        this.applyIcon(head);
      }

      const currentTitle = typeof document.title === "string" ? document.title : "";
      const normalizedTitle = state.normalizeTitle(currentTitle) || "Browser";
      if (!currentTitle.startsWith(titlePrefix) || currentTitle !== titlePrefix + normalizedTitle) {
        state.originalTitle = normalizedTitle;
      }

      const baseTitle = (state.originalTitle || normalizedTitle || "Browser").trim() || "Browser";
      const nextTitle = titlePrefix + baseTitle;
      if (currentTitle !== nextTitle) {
        document.title = nextTitle;
      }
      this.ensureObserver();
    },
  };
  window[GLOBAL_KEY] = state;
  state.apply();
  return { ok: true, title: document.title };
})()`
  }

  private async ensureTabIdentityOnSelectedTab(force = false): Promise<void> {
    try {
      const script = this.getTabIdentityScript(force)
      if (!script) return

      const attempts = force ? 8 : 5
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          this.runAgentBrowser(["eval", script], Math.min(this.timeout, 4_000))
          return
        } catch {
          if (attempt >= attempts - 1) return
          await this.sleep(150 + attempt * 120)
        }
      }
    } catch {
      // best-effort only
    }
  }

  private getAvatarCursorMarkup(): { markup: string; css: string; signature: string } | null {
    const tryReadAvatarSvg = (slug: string): { markup: string; signature: string } | null => {
      if (!slug) return null
      const avatarPath = join(getTermlingsDir(), "agents", slug, "avatar.svg")
      if (!existsSync(avatarPath)) return null
      try {
        const content = readFileSync(avatarPath, "utf8").trim()
        if (!content.startsWith("<svg")) return null
        return {
          markup: `<div class="tg-avatar">${content}</div>`,
          signature: `svg:${slug}`,
        }
      } catch {
        return null
      }
    }

    try {
      const candidates = this.resolveAvatarCandidateSlugs()
      for (const slug of candidates) {
        const dna = this.readAgentDNA(slug)
        if (dna) {
          try {
            const layered = renderLayeredSVG(dna, 6)
            const classes = ["tg-avatar", "walking"]
            if (layered.legFrames >= 4) {
              classes.push("walk-4f")
            } else if (layered.legFrames >= 3) {
              classes.push("walk-3f")
            }
            return {
              markup: `<div class="${classes.join(" ")}">${layered.svg}</div>`,
              css: getAvatarCSS(),
              signature: `dna:${dna}:legs:${layered.legFrames}`,
            }
          } catch {
            // continue to static fallback for this slug
          }
        }
        const staticSvg = tryReadAvatarSvg(slug)
        if (staticSvg) {
          return {
            markup: staticSvg.markup,
            css: getAvatarCSS(),
            signature: staticSvg.signature,
          }
        }
      }
    } catch {
      // ignore and treat as unavailable
    }

    return null
  }

  private buildAvatarCursorScript(): string | null {
    const visual = this.getAvatarCursorMarkup()
    if (!visual) return null
    const markupJson = JSON.stringify(visual.markup)
    const signatureJson = JSON.stringify(visual.signature)
    const cssJson = JSON.stringify(visual.css)
    const followNativeJson = JSON.stringify(this.shouldFollowNativePointer())
    return `(() => {
  const GLOBAL_KEY = "__termlingsAvatarCursor";
  const STYLE_KEY = "__termlingsAvatarCursorStyle";
  const SCRIPT_VERSION = 4;
  const FOLLOW_NATIVE = ${followNativeJson};
  const seedX = Number.isFinite(Number(window.__termlingsAvatarCursorSeedX))
    ? Number(window.__termlingsAvatarCursorSeedX)
    : 24;
  const seedY = Number.isFinite(Number(window.__termlingsAvatarCursorSeedY))
    ? Number(window.__termlingsAvatarCursorSeedY)
    : 24;
  const root = document.documentElement || document.body;
  if (!root) return { ok: false, reason: "no-root" };

  const ensureStyle = () => {
    let style = document.getElementById(STYLE_KEY);
    if (style && style.tagName === "STYLE") return;
    style = document.createElement("style");
    style.id = STYLE_KEY;
    style.textContent = ${cssJson} + "\\n"
      + ".termlings-avatar-cursor-svg { width: 100%; height: 100%; display: block; image-rendering: pixelated; }\\n"
      + ".termlings-avatar-cursor-svg svg { width: 100%; height: 100%; display: block; image-rendering: pixelated; }";
    (document.head || root).appendChild(style);
  };

  const ensure = () => {
    ensureStyle();
    const existing = window[GLOBAL_KEY];
    const normalizeCursorStyle = (el) => {
      el.style.position = "fixed";
      el.style.width = "24px";
      el.style.height = "24px";
      el.style.transform = "translate(-50%, -50%)";
      el.style.pointerEvents = "none";
      el.style.userSelect = "none";
      el.style.willChange = "left, top";
      el.style.zIndex = "2147483647";
      el.style.filter = "none";
      el.style.boxShadow = "none";
      el.style.transition = "left 70ms linear, top 70ms linear";
      el.setAttribute("data-termlings-avatar-cursor", "1");
    };
    const removeDuplicateCursors = (keep) => {
      const nodes = document.querySelectorAll('[data-termlings-avatar-cursor="1"], [data-termlings-avatar-signature]');
      for (const node of nodes) {
        if (keep && node === keep) continue;
        try { node.remove(); } catch {}
      }
    };

    if (existing && existing.el && existing.el.isConnected && Number(existing.version) === SCRIPT_VERSION) {
      normalizeCursorStyle(existing.el);
      if (existing.el.getAttribute("data-termlings-avatar-signature") !== ${signatureJson}) {
        existing.el.setAttribute("data-termlings-avatar-signature", ${signatureJson});
        existing.el.innerHTML = ${markupJson};
        const inner = existing.el.firstElementChild;
        if (inner && inner.classList) {
          inner.classList.add("termlings-avatar-cursor-svg");
        }
      }
      removeDuplicateCursors(existing.el);
      return existing;
    }
    if (existing && existing.el && existing.el.isConnected) {
      try {
        if (existing.bound && existing.onMouse) {
          window.removeEventListener("mousemove", existing.onMouse, true);
          window.removeEventListener("mousedown", existing.onMouse, true);
          window.removeEventListener("mouseup", existing.onMouse, true);
        }
        if (existing.bound && existing.onTouch) {
          window.removeEventListener("touchstart", existing.onTouch, true);
          window.removeEventListener("touchmove", existing.onTouch, true);
        }
      } catch {}
      try { existing.el.remove(); } catch {}
    }

    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("data-termlings-avatar-signature", ${signatureJson});
    el.setAttribute("data-termlings-avatar-cursor", "1");
    el.innerHTML = ${markupJson};
    el.style.position = "fixed";
    el.style.left = seedX + "px";
    el.style.top = seedY + "px";
    el.style.width = "24px";
    el.style.height = "24px";
    el.style.transform = "translate(-50%, -50%)";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.style.willChange = "left, top";
    el.style.zIndex = "2147483647";
    el.style.filter = "none";
    el.style.boxShadow = "none";
    el.style.transition = "left 70ms linear, top 70ms linear";
    const inner = el.firstElementChild;
    if (inner && inner.classList) {
      inner.classList.add("termlings-avatar-cursor-svg");
    }
    (document.body || root).appendChild(el);
    removeDuplicateCursors(el);

    const state = {
      version: SCRIPT_VERSION,
      el,
      lastX: seedX,
      lastY: seedY,
      update(x, y) {
        const nx = Math.max(2, Math.min(window.innerWidth - 2, Math.round(x)));
        const ny = Math.max(2, Math.min(window.innerHeight - 2, Math.round(y)));
        this.lastX = nx;
        this.lastY = ny;
        this.el.style.left = nx + "px";
        this.el.style.top = ny + "px";
      },
      bound: false,
      followNative: false,
      onMouse: null,
      onTouch: null,
    };
    window[GLOBAL_KEY] = state;
    return state;
  };

  const state = ensure();
  if (FOLLOW_NATIVE && !state.bound) {
    state.onMouse = (event) => {
      state.update(event.clientX, event.clientY);
    };
    state.onTouch = (event) => {
      const t = event.touches && event.touches[0] ? event.touches[0] : event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : null;
      if (t) state.update(t.clientX, t.clientY);
    };
    window.addEventListener("mousemove", state.onMouse, true);
    window.addEventListener("mousedown", state.onMouse, true);
    window.addEventListener("mouseup", state.onMouse, true);
    window.addEventListener("touchstart", state.onTouch, true);
    window.addEventListener("touchmove", state.onTouch, true);
    state.bound = true;
    state.followNative = true;
  } else if (!FOLLOW_NATIVE && state.bound) {
    try {
      if (state.onMouse) {
        window.removeEventListener("mousemove", state.onMouse, true);
        window.removeEventListener("mousedown", state.onMouse, true);
        window.removeEventListener("mouseup", state.onMouse, true);
      }
      if (state.onTouch) {
        window.removeEventListener("touchstart", state.onTouch, true);
        window.removeEventListener("touchmove", state.onTouch, true);
      }
    } catch {}
    state.bound = false;
    state.followNative = false;
    state.onMouse = null;
    state.onTouch = null;
  }

  if (!(state.lastX > 0 && state.lastY > 0)) {
    state.update(Math.round(window.innerWidth * 0.5), Math.round(window.innerHeight * 0.35));
  } else {
    state.update(state.lastX, state.lastY);
  }

  return { ok: true, x: state.lastX, y: state.lastY };
})()`
  }

  private removeInPageAvatarCursor(): void {
    try {
      this.runAgentBrowser([
        "eval",
        `(() => {
          try { delete window.__termlingsAvatarCursor; } catch {}
          const style = document.getElementById("__termlingsAvatarCursorStyle");
          if (style) { try { style.remove(); } catch {} }
          const nodes = document.querySelectorAll('[data-termlings-avatar-cursor="1"], [data-termlings-avatar-signature]');
          for (const node of nodes) {
            try { node.remove(); } catch {}
          }
          return true;
        })()`,
      ])
    } catch {
      // best-effort only
    }
  }

  private async ensureInPageAvatarCursor(force: boolean = false): Promise<void> {
    if (!force && !this.shouldInjectAvatarCursor()) return

    try {
      const now = Date.now()
      if (!this.cursorScript || now - this.cursorScriptBuiltAt > 2_500) {
        this.cursorScript = this.buildAvatarCursorScript()
        this.cursorScriptBuiltAt = now
      }

      if (!this.cursorScript) {
        this.removeInPageAvatarCursor()
        return
      }

      if (this.cursorLastX !== null && this.cursorLastY !== null) {
        this.runAgentBrowser([
          "eval",
          `window.__termlingsAvatarCursorSeedX=${Math.round(this.cursorLastX)};window.__termlingsAvatarCursorSeedY=${Math.round(this.cursorLastY)};true`,
        ])
      }
      this.runAgentBrowser(["eval", this.cursorScript])
      this.captureCursorAnchorFromPage()
    } catch {
      // Best-effort visual overlay only; never fail primary browser command.
    }
  }

  private extractCursorPoint(payload: unknown): { x: number; y: number } | null {
    if (!payload || typeof payload !== "object") return null
    const record = payload as Record<string, unknown>
    const state = (() => {
      if (typeof record.x === "number" && typeof record.y === "number") return record
      const result = record.result
      if (result && typeof result === "object") {
        const nested = result as Record<string, unknown>
        if (typeof nested.x === "number" && typeof nested.y === "number") return nested
      }
      return null
    })()
    if (!state) return null
    return { x: state.x as number, y: state.y as number }
  }

  private getSelectorCenter(selector: string): { x: number; y: number } | null {
    try {
      const selectorJson = JSON.stringify(selector)
      const data = this.runAgentBrowser([
        "eval",
        `(() => {
          const el = document.querySelector(${selectorJson});
          if (!el) return { ok: false, reason: "not-found" };
          try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}
          const rect = el.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) {
            return { ok: false, reason: "empty-rect" };
          }
          const clamp = (v, max) => Math.max(2, Math.min(Math.max(2, max - 2), Math.round(v)));
          const x = clamp(rect.left + rect.width / 2, window.innerWidth);
          // Bias slightly toward upper half so clicks look intentional on buttons/links.
          const y = clamp(rect.top + Math.max(4, Math.min(rect.height - 2, rect.height * 0.4)), window.innerHeight);
          return { ok: true, x, y };
        })()`,
      ])
      return this.extractCursorPoint(data)
    } catch {
      return null
    }
  }

  private moveCursorInPage(x: number, y: number): { x: number; y: number } | null {
    try {
      const nx = Math.round(x)
      const ny = Math.round(y)
      const data = this.runAgentBrowser([
        "eval",
        `(() => {
          const c = window.__termlingsAvatarCursor;
          if (!c || typeof c.update !== "function") return { ok: false, reason: "missing-cursor" };
          c.update(${nx}, ${ny});
          try {
            const target = document.elementFromPoint(c.lastX, c.lastY) || document;
            target.dispatchEvent(new MouseEvent("mousemove", {
              clientX: c.lastX,
              clientY: c.lastY,
              bubbles: true,
              cancelable: true,
              view: window
            }));
          } catch {}
          return { ok: true, x: Number(c.lastX), y: Number(c.lastY) };
        })()`,
      ])
      const point = this.extractCursorPoint(data)
      if (!point) return null
      this.cursorLastX = point.x
      this.cursorLastY = point.y
      return point
    } catch {
      return null
    }
  }

  private async animateCursorToSelector(selector: string): Promise<void> {
    if (!this.shouldInjectAvatarCursor()) return

    const target = this.getSelectorCenter(selector)
    if (!target) return

    const startX = typeof this.cursorLastX === "number" ? this.cursorLastX : target.x
    const startY = typeof this.cursorLastY === "number" ? this.cursorLastY : target.y
    const dx = target.x - startX
    const dy = target.y - startY
    const distance = Math.hypot(dx, dy)

    // Keep movement visible but fast enough to avoid slowing commands.
    const steps = Math.max(3, Math.min(11, Math.round(distance / 60)))
    const totalMs = Math.max(120, Math.min(340, Math.round(distance * 1.4)))
    const stepDelay = Math.max(10, Math.round(totalMs / Math.max(1, steps)))

    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const eased = 1 - (1 - t) * (1 - t)
      const x = startX + dx * eased
      const y = startY + dy * eased
      this.moveCursorInPage(x, y)
      if (i < steps) {
        await this.sleep(stepDelay)
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isCursorPresentInPage(): boolean {
    try {
      const data = this.runAgentBrowser([
        "eval",
        `(() => {
          const c = window.__termlingsAvatarCursor;
          if (!c || !c.el || !c.el.isConnected) return { present: false };
          return {
            present: true,
            x: Number.isFinite(Number(c.lastX)) ? Number(c.lastX) : undefined,
            y: Number.isFinite(Number(c.lastY)) ? Number(c.lastY) : undefined
          };
        })()`,
      ])
      if (typeof data === "boolean") return data
      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>
        const state = (() => {
          if (typeof record.present === "boolean") return record
          const nested = record.result
          if (nested && typeof nested === "object") {
            const nestedRecord = nested as Record<string, unknown>
            if (typeof nestedRecord.present === "boolean") return nestedRecord
          }
          return null
        })()
        if (state) {
          if (state.present === true) {
            if (typeof state.x === "number") this.cursorLastX = state.x
            if (typeof state.y === "number") this.cursorLastY = state.y
          }
          return state.present === true
        }
        if (typeof record.result === "boolean") return record.result
      }
    } catch {
      return false
    }
    return false
  }

  private async recoverCursorAfterPotentialNavigation(): Promise<void> {
    if (!this.shouldInjectAvatarCursor()) return

    // Click/navigation can replace the DOM; retry for a short window until
    // the destination document is ready and cursor overlay can be re-applied.
    const attempts = 12
    const intervalMs = 120
    for (let i = 0; i < attempts; i++) {
      if (this.isCursorPresentInPage()) return
      await this.ensureInPageAvatarCursor()
      if (this.isCursorPresentInPage()) return
      if (i < attempts - 1) {
        await this.sleep(intervalMs)
      }
    }
  }

  private captureCursorAnchorFromPage(): void {
    if (!this.shouldInjectAvatarCursor()) return
    try {
      this.isCursorPresentInPage()
    } catch {
      // ignore best-effort anchor capture
    }
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
