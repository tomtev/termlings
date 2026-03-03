/**
 * HTTP client for PinchTab browser server
 *
 * PinchTab 0.7.x uses root endpoints and supports tab targeting via
 * `tabId` query/body fields (not /tabs/{id}/... routes).
 */

import type { Cookie, HealthCheckResponse } from "./browser-types.js"

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

export class BrowserClient {
  private baseUrl: string
  private timeout: number
  private agentContext: {
    sessionId?: string
    agentName?: string
    agentDna?: string
  }

  constructor(port: number, timeout: number = 30000) {
    this.baseUrl = `http://127.0.0.1:${port}`
    this.timeout = timeout
    this.agentContext = {
      sessionId: process.env.TERMLINGS_SESSION_ID,
      agentName: process.env.TERMLINGS_AGENT_NAME,
      agentDna: process.env.TERMLINGS_AGENT_DNA,
    }
  }

  /**
   * Health check - verify server is running
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await this.fetch("/health", { method: "GET" })
    return (await response.json()) as HealthCheckResponse
  }

  /**
   * Navigate to a URL (active tab by default, or specific tabId)
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
    const tabId = await this.resolveTabId(options.tabId)
    const payload: Record<string, unknown> = { url, tabId }
    if (typeof options.timeout === "number") payload.timeout = options.timeout
    if (typeof options.blockImages === "boolean") payload.blockImages = options.blockImages
    if (typeof options.blockAds === "boolean") payload.blockAds = options.blockAds

    await this.fetch("/navigate", {
      method: "POST",
      body: JSON.stringify(payload),
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
    const tabId = await this.resolveTabId(options.tabId)
    const query = this.buildQuery({
      tabId,
      quality: options.quality,
      fullPage: options.fullPage,
      format: options.format,
    })

    const response = await this.fetch(`/screenshot${query}`, {
      method: "GET",
      headers: {
        Accept: "image/png,image/jpeg,application/json",
      },
    })

    const contentType = (response.headers.get("content-type") || "").toLowerCase()
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { base64?: string; data?: string }
      return data.base64 || data.data || ""
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    return Buffer.from(bytes).toString("base64")
  }

  /**
   * Type text into the currently focused element (tab-scoped)
   */
  async typeText(
    text: string,
    options: { tabId?: string; selector?: string; ref?: string } = {}
  ): Promise<void> {
    const tabId = await this.resolveTabId(options.tabId)
    const payload: Record<string, unknown> = {
      kind: "humanType",
      text,
      tabId,
    }

    if (options.ref) {
      payload.ref = options.ref
    } else {
      payload.selector = options.selector || ":focus"
    }

    await this.fetch("/action", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  /**
   * Click an element by CSS selector in the chosen tab
   */
  async clickSelector(selector: string, options: { tabId?: string } = {}): Promise<void> {
    const tabId = await this.resolveTabId(options.tabId)
    await this.fetch("/action", {
      method: "POST",
      body: JSON.stringify({ kind: "click", selector, tabId }),
    })
  }

  /**
   * Extract visible text from page
   */
  async extractText(options: { tabId?: string; raw?: boolean } = {}): Promise<string> {
    const tabId = await this.resolveTabId(options.tabId)
    const query = this.buildQuery({ tabId, raw: options.raw })
    const response = await this.fetch(`/text${query}`, { method: "GET" })
    const data = (await response.json()) as { text?: string } | string
    if (typeof data === "string") return data
    return data.text || ""
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
    const tabId = await this.resolveTabId(options.tabId)
    const query = this.buildQuery({
      tabId,
      compact: options.compact,
      interactive: options.interactive,
      depth: options.depth,
      maxTokens: options.maxTokens,
      selector: options.selector,
    })

    const response = await this.fetch(`/snapshot${query}`, { method: "GET" })
    return await response.json()
  }

  /**
   * Get cookies for current page
   */
  async getCookies(options: { tabId?: string } = {}): Promise<Cookie[]> {
    const tabId = await this.resolveTabId(options.tabId)
    const query = this.buildQuery({ tabId })
    const response = await this.fetch(`/cookies${query}`, { method: "GET" })
    const data = (await response.json()) as { cookies?: Cookie[] } | Cookie[]
    if (Array.isArray(data)) return data
    return data.cookies || []
  }

  /**
   * Execute JavaScript expression in page context
   */
  async executeScript(
    script: string,
    _args?: unknown[],
    options: { tabId?: string } = {}
  ): Promise<unknown> {
    const tabId = await this.resolveTabId(options.tabId)
    const response = await this.fetch("/evaluate", {
      method: "POST",
      body: JSON.stringify({ expression: script, tabId }),
    })

    const data = (await response.json()) as { result?: unknown } | unknown
    if (data && typeof data === "object" && "result" in (data as Record<string, unknown>)) {
      return (data as { result?: unknown }).result
    }
    return data
  }

  /**
   * Wait for selector by polling evaluate() (PinchTab has no /wait route in 0.7.x)
   */
  async waitForSelector(
    selector: string,
    timeout: number = 5000,
    options: { tabId?: string } = {}
  ): Promise<void> {
    const selectorLiteral = JSON.stringify(selector)
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeout) {
      const found = await this.executeScript(
        `Boolean(document.querySelector(${selectorLiteral}))`,
        undefined,
        { tabId: options.tabId }
      )

      if (found === true) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    throw new Error(`Timeout waiting for selector: ${selector}`)
  }

  /**
   * Get list of open tabs
   */
  async getTabs(): Promise<BrowserTab[]> {
    const response = await this.fetch("/tabs", { method: "GET" })
    const data = (await response.json()) as { tabs?: BrowserTab[] } | BrowserTab[]
    if (Array.isArray(data)) return data
    return data.tabs || []
  }

  /**
   * Create tab (legacy PinchTab 0.7.x)
   */
  async createTab(url?: string): Promise<string> {
    const payload: Record<string, unknown> = { action: "new" }
    if (url) payload.url = url

    const response = await this.fetch("/tab", {
      method: "POST",
      body: JSON.stringify(payload),
    })

    const data = (await response.json()) as { tabId?: string; id?: string }
    return data.tabId || data.id || ""
  }

  /**
   * Close tab by id (legacy PinchTab 0.7.x)
   */
  async closeTab(tabId: string): Promise<void> {
    await this.fetch("/tab", {
      method: "POST",
      body: JSON.stringify({ action: "close", tabId }),
    })
  }

  async lockTab(tabId: string, owner: string, ttl: number = 3600): Promise<void> {
    await this.fetch("/tab/lock", {
      method: "POST",
      body: JSON.stringify({ tabId, owner, timeoutMs: ttl * 1000 }),
    })
  }

  async unlockTab(tabId: string, owner?: string): Promise<void> {
    const resolvedOwner = owner || this.agentContext.agentName || this.agentContext.sessionId || "termlings"
    await this.fetch("/tab/unlock", {
      method: "POST",
      body: JSON.stringify({ tabId, owner: resolvedOwner }),
    })
  }

  async typeIntoRef(tabId: string, ref: string, text: string): Promise<void> {
    await this.fetch("/action", {
      method: "POST",
      body: JSON.stringify({ kind: "type", tabId, ref, text }),
    })
  }

  async pressKey(tabId: string, key: string, ref?: string): Promise<void> {
    const payload: Record<string, unknown> = { kind: "press", tabId, key }
    if (ref) payload.ref = ref
    await this.fetch("/action", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async clickRef(tabId: string, ref: string): Promise<void> {
    await this.fetch("/action", {
      method: "POST",
      body: JSON.stringify({ kind: "click", tabId, ref }),
    })
  }

  private async resolveTabId(explicitTabId?: string): Promise<string> {
    if (explicitTabId && explicitTabId.trim().length > 0) {
      return explicitTabId.trim()
    }

    const tabs = await this.getTabs()
    if (tabs.length === 0) {
      throw new Error("No tabs found. Open one first (for example: termlings browser navigate \"https://example.com\").")
    }

    const active = tabs.find((tab) => tab.active || tab.current || tab.selected || tab.focused)
    return active?.id || tabs[0]!.id
  }

  private buildQuery(params: Record<string, unknown>): string {
    const query = new URLSearchParams()

    for (const [key, rawValue] of Object.entries(params)) {
      if (rawValue === undefined || rawValue === null) continue
      if (typeof rawValue === "boolean") {
        if (rawValue) query.set(key, "true")
        continue
      }
      query.set(key, String(rawValue))
    }

    const value = query.toString()
    return value.length > 0 ? `?${value}` : ""
  }

  /**
   * Internal fetch wrapper with timeout + context headers
   */
  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    const headers = new Headers(options.headers)
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    if (this.agentContext.sessionId) {
      headers.set("X-Termlings-Session-Id", this.agentContext.sessionId)
    }
    if (this.agentContext.agentName) {
      headers.set("X-Termlings-Agent-Name", this.agentContext.agentName)
    }
    if (this.agentContext.agentDna) {
      headers.set("X-Termlings-Agent-Dna", this.agentContext.agentDna)
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Browser API error: ${response.status} ${response.statusText}\n${text}`)
      }

      return response
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Browser API timeout after ${this.timeout}ms`)
        }
        throw error
      }

      throw new Error(`Browser API error: ${error}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
