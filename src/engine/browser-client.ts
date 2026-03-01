/**
 * HTTP client for PinchTab browser server
 */

import type { Cookie, BrowserScreenshot, HealthCheckResponse } from "./browser-types.js"

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
    // Read agent context from environment
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
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    await this.fetch("/navigate", {
      method: "POST",
      body: JSON.stringify({ url }),
    })
  }

  /**
   * Take a screenshot of the current page
   */
  async screenshot(): Promise<string> {
    const response = await this.fetch("/screenshot", { method: "GET" })
    const data = (await response.json()) as { base64?: string; data?: string }
    return data.base64 || data.data || ""
  }

  /**
   * Type text into the focused element
   */
  async typeText(text: string): Promise<void> {
    await this.fetch("/input/type", {
      method: "POST",
      body: JSON.stringify({ text }),
    })
  }

  /**
   * Click an element by CSS selector
   */
  async clickSelector(selector: string): Promise<void> {
    await this.fetch("/click", {
      method: "POST",
      body: JSON.stringify({ selector }),
    })
  }

  /**
   * Extract visible text from the page
   */
  async extractText(): Promise<string> {
    const response = await this.fetch("/text", { method: "GET" })
    const data = (await response.json()) as { text?: string }
    return data.text || ""
  }

  /**
   * Get all cookies
   */
  async getCookies(): Promise<Cookie[]> {
    const response = await this.fetch("/cookies", { method: "GET" })
    const data = (await response.json()) as { cookies?: Cookie[] }
    return data.cookies || []
  }

  /**
   * Execute JavaScript in the page context
   */
  async executeScript(script: string, args?: unknown[]): Promise<unknown> {
    const response = await this.fetch("/execute", {
      method: "POST",
      body: JSON.stringify({ script, args }),
    })
    return await response.json()
  }

  /**
   * Wait for an element to appear
   */
  async waitForSelector(selector: string, timeout: number = 5000): Promise<void> {
    await this.fetch("/wait", {
      method: "POST",
      body: JSON.stringify({ selector, timeout }),
    })
  }

  /**
   * Get list of all tabs
   */
  async getTabs(): Promise<Array<{ id: string; title?: string; url?: string }>> {
    const response = await this.fetch("/tabs", { method: "GET" })
    const data = (await response.json()) as {
      tabs?: Array<{ id: string; title?: string; url?: string }>
    }
    return data.tabs || []
  }

  /**
   * Create a new tab
   */
  async createTab(url?: string): Promise<string> {
    const response = await this.fetch("/tabs", {
      method: "POST",
      body: JSON.stringify({ url }),
    })
    const data = (await response.json()) as { id?: string; tabId?: string }
    return data.id || data.tabId || ""
  }

  /**
   * Lock a tab with agent owner
   */
  async lockTab(tabId: string, owner: string, ttl: number = 3600): Promise<void> {
    await this.fetch(`/tabs/${tabId}/lock`, {
      method: "POST",
      body: JSON.stringify({ owner, ttl }),
    })
  }

  /**
   * Unlock a tab
   */
  async unlockTab(tabId: string): Promise<void> {
    await this.fetch(`/tabs/${tabId}/lock`, {
      method: "DELETE",
    })
  }

  /**
   * Internal fetch wrapper with error handling
   */
  private async fetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    // Build headers with agent context
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    }

    // Add agent context headers if available
    if (this.agentContext.sessionId) {
      headers["X-Termlings-Session-Id"] = this.agentContext.sessionId
    }
    if (this.agentContext.agentName) {
      headers["X-Termlings-Agent-Name"] = this.agentContext.agentName
    }
    if (this.agentContext.agentDna) {
      headers["X-Termlings-Agent-Dna"] = this.agentContext.agentDna
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `Browser API error: ${response.status} ${response.statusText}\n${text}`
        )
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
