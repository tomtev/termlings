/**
 * HTTP client for PinchTab browser server
 */

import type { Cookie, BrowserScreenshot, HealthCheckResponse } from "./browser-types.js"

export class BrowserClient {
  private baseUrl: string
  private timeout: number

  constructor(port: number, timeout: number = 30000) {
    this.baseUrl = `http://127.0.0.1:${port}`
    this.timeout = timeout
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
   * Internal fetch wrapper with error handling
   */
  private async fetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
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
