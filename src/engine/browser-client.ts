/**
 * CLI wrapper client for agent-browser (native + CDP)
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "fs"
import { spawnSync } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import type { Cookie, HealthCheckResponse } from "./browser-types.js"
import { getTermlingsDir } from "./ipc.js"
import { getAvatarCSS, renderLayeredSVG } from "../index.js"

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
  private cursorScript: string | null = null
  private cursorScriptBuiltAt = 0
  private cursorLastX: number | null = null
  private cursorLastY: number | null = null

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
      this.captureCursorAnchorFromPage()
      this.runAgentBrowser(["open", url], options.timeout)
      await this.ensureInPageAvatarCursor()
      await this.recoverCursorAfterPotentialNavigation()
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
      await this.ensureInPageAvatarCursor()
      this.captureCursorAnchorFromPage()
      if (options.ref && options.ref.trim().length > 0) {
        const ref = options.ref.startsWith("@") ? options.ref : `@${options.ref}`
        this.runAgentBrowser(["type", ref, text])
        await this.recoverCursorAfterPotentialNavigation()
        return
      }

      if (options.selector && options.selector.trim().length > 0) {
        await this.animateCursorToSelector(options.selector)
        this.runAgentBrowser(["type", options.selector, text])
        await this.recoverCursorAfterPotentialNavigation()
        return
      }

      this.runAgentBrowser(["keyboard", "type", text])
      await this.recoverCursorAfterPotentialNavigation()
    })
  }

  async focusSelector(selector: string, options: { tabId?: string } = {}): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      await this.ensureInPageAvatarCursor()
      this.captureCursorAnchorFromPage()
      await this.animateCursorToSelector(selector)
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
      await this.recoverCursorAfterPotentialNavigation()
    })
  }

  /**
   * Click an element by CSS selector in the chosen tab
   */
  async clickSelector(selector: string, options: { tabId?: string } = {}): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      await this.ensureInPageAvatarCursor()
      this.captureCursorAnchorFromPage()
      await this.animateCursorToSelector(selector)
      this.runAgentBrowser(["click", selector])
      await this.recoverCursorAfterPotentialNavigation()
    })
  }

  /**
   * Extract visible text from page
   */
  async extractText(options: { tabId?: string; raw?: boolean } = {}): Promise<string> {
    return await this.withSelectedTab(options.tabId, async () => {
      await this.ensureInPageAvatarCursor()
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
      await this.ensureInPageAvatarCursor()
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
      await this.ensureInPageAvatarCursor()
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
      await this.ensureInPageAvatarCursor()
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
      await this.ensureInPageAvatarCursor()
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
      this.captureCursorAnchorFromPage()
      const args = ["tab", "new", ...(url ? [url] : [])]
      const data = this.runAgentBrowser(args)
      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>
        if (typeof record.index === "number") {
          const tabId = String(record.index)
          this.runAgentBrowser(["tab", tabId])
          await this.ensureInPageAvatarCursor()
          await this.recoverCursorAfterPotentialNavigation()
          return tabId
        }
      }
      const tabData = this.runAgentBrowser(["tab"])
      const tabRecord = (tabData && typeof tabData === "object" ? tabData as Record<string, unknown> : {})
      const tabsRaw = Array.isArray(tabRecord.tabs) ? tabRecord.tabs as Array<Record<string, unknown>> : []
      if (tabsRaw.length === 0) return ""
      const lastTab = tabsRaw[tabsRaw.length - 1]
      const tabIndex = typeof lastTab?.index === "number" ? lastTab.index : tabsRaw.length - 1
      const tabId = String(tabIndex)
      this.runAgentBrowser(["tab", tabId])
      await this.ensureInPageAvatarCursor()
      await this.recoverCursorAfterPotentialNavigation()
      return tabId
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
      await this.ensureInPageAvatarCursor()
      this.captureCursorAnchorFromPage()
      const target = ref.startsWith("@") ? ref : `@${ref}`
      this.runAgentBrowser(["type", target, text])
      await this.recoverCursorAfterPotentialNavigation()
    })
  }

  async pressKey(tabId: string, key: string, _ref?: string): Promise<void> {
    await this.withSelectedTab(tabId, async () => {
      await this.ensureInPageAvatarCursor()
      this.captureCursorAnchorFromPage()
      this.runAgentBrowser(["press", key])
      await this.recoverCursorAfterPotentialNavigation()
    })
  }

  async clickRef(tabId: string, ref: string): Promise<void> {
    await this.withSelectedTab(tabId, async () => {
      await this.ensureInPageAvatarCursor()
      this.captureCursorAnchorFromPage()
      const target = ref.startsWith("@") ? ref : `@${ref}`
      this.runAgentBrowser(["click", target])
      await this.recoverCursorAfterPotentialNavigation()
    })
  }

  async ensureAvatarCursor(options: { tabId?: string; force?: boolean } = {}): Promise<void> {
    await this.withSelectedTab(options.tabId, async () => {
      await this.ensureInPageAvatarCursor(options.force === true)
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
    const candidates: string[] = []
    const addCandidate = (slug: string | undefined) => {
      const clean = (slug || "").trim()
      if (!clean) return
      if (!candidates.includes(clean)) candidates.push(clean)
    }

    addCandidate(process.env.TERMLINGS_AGENT_SLUG)

    // Detached watcher process has no agent env; use the most recent actor.
    try {
      const agentsStateDir = join(getTermlingsDir(), "browser", "agents")
      if (existsSync(agentsStateDir)) {
        const recent = readdirSync(agentsStateDir)
          .filter((file) => file.endsWith(".json"))
          .map((file) => {
            try {
              const parsed = JSON.parse(readFileSync(join(agentsStateDir, file), "utf8")) as {
                agentSlug?: string
                lastActionAt?: number
              }
              return {
                slug: (parsed.agentSlug || "").trim(),
                ts: typeof parsed.lastActionAt === "number" ? parsed.lastActionAt : 0,
              }
            } catch {
              return { slug: "", ts: 0 }
            }
          })
          .filter((entry) => entry.slug.length > 0)
          .sort((a, b) => b.ts - a.ts)
        addCandidate(recent[0]?.slug)
      }
    } catch {
      // ignore state lookup
    }

    // Canonical default team lead avatar.
    addCandidate("pm")

    try {
      const agentsDir = join(getTermlingsDir(), "agents")
      if (existsSync(agentsDir)) {
        for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith(".")) continue
          addCandidate(entry.name)
        }
      }
    } catch {
      // ignore local agent scan
    }

    return candidates
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

  private getAvatarCursorMarkup(): { markup: string; css: string; signature: string } {
    const fallbackSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4fd1c5"/>
      <stop offset="100%" stop-color="#2c7a7b"/>
    </linearGradient>
  </defs>
  <circle cx="22" cy="22" r="18" fill="url(#g)" stroke="#0f172a" stroke-width="2"/>
  <circle cx="16.5" cy="20" r="2.1" fill="#0f172a"/>
  <circle cx="27.5" cy="20" r="2.1" fill="#0f172a"/>
  <path d="M14 27c2.2 3.4 5.1 5 8 5s5.8-1.6 8-5" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round"/>
</svg>
    `.trim()

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
      // ignore and use fallback
    }

    return {
      markup: `<div class="tg-avatar">${fallbackSvg}</div>`,
      css: getAvatarCSS(),
      signature: "fallback-smiley",
    }
  }

  private buildAvatarCursorScript(): string {
    const visual = this.getAvatarCursorMarkup()
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

  private async ensureInPageAvatarCursor(force: boolean = false): Promise<void> {
    if (!force && !this.shouldInjectAvatarCursor()) return

    try {
      const now = Date.now()
      if (!this.cursorScript || now - this.cursorScriptBuiltAt > 2_500) {
        this.cursorScript = this.buildAvatarCursorScript()
        this.cursorScriptBuiltAt = now
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
