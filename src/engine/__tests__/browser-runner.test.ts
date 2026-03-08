import { describe, expect, it } from "vitest"
import {
  buildBackgroundCreateTargetParams,
  buildDeferredInitScript,
  collectVisibleTabs,
  isIgnoredInternalBrowserPage,
  resolveHttpBase,
  rewriteDevtoolsWebSocketUrl,
} from "../browser-runner.mjs"

function fakeTarget(id: string, url: string, title: string) {
  return {
    id,
    type: "page",
    url,
    title,
    webSocketDebuggerUrl: `ws://127.0.0.1:9223/devtools/page/${id}`,
  }
}

describe("browser runner tab filtering", () => {
  it("filters top-chrome internal targets from the visible tab list", () => {
    const targets = [
      fakeTarget("internal-1", "chrome://omnibox-popup.top-chrome/", "Omnibox Popup"),
      fakeTarget("blank-1", "about:blank", ""),
      fakeTarget("page-1", "https://example.com", "Example Domain"),
    ]

    const tabs = collectVisibleTabs(targets)

    expect(tabs.map((tab) => tab.id)).toEqual(["0", "1"])
    expect(tabs.map((tab) => tab.url)).toEqual(["about:blank", "https://example.com"])
    expect(tabs.map((tab) => tab.targetId)).toEqual(["blank-1", "page-1"])
    expect(tabs[0]?.active).toBe(true)
    expect(tabs[1]?.active).toBe(false)
  })

  it("keeps ordinary tabs visible", () => {
    expect(isIgnoredInternalBrowserPage("https://example.com")).toBe(false)
    expect(isIgnoredInternalBrowserPage("about:blank")).toBe(false)
    expect(isIgnoredInternalBrowserPage("chrome://newtab/")).toBe(false)
  })

  it("ignores omnibox and devtools targets", () => {
    expect(isIgnoredInternalBrowserPage("chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html")).toBe(true)
    expect(isIgnoredInternalBrowserPage("devtools://devtools/bundled/inspector.html")).toBe(true)
  })
})

describe("browser runner init script deferral", () => {
  it("wraps init script so it waits for DOM readiness before eval", () => {
    const wrapped = buildDeferredInitScript("window.__test = 1;")
    expect(wrapped).toContain("DOMContentLoaded")
    expect(wrapped).toContain("window.addEventListener(\"load\"")
    expect(wrapped).toContain("eval")
    expect(wrapped).toContain("atob")
  })
})

describe("browser runner background tab creation", () => {
  it("creates new targets in the background", () => {
    expect(buildBackgroundCreateTargetParams("https://example.com")).toEqual({
      url: "https://example.com",
      background: true,
    })
  })
})

describe("browser runner websocket rewriting", () => {
  it("accepts plain host:port cdp targets", () => {
    expect(resolveHttpBase("host.docker.internal:9324")).toBe("http://host.docker.internal:9324")
  })

  it("normalizes numeric and websocket cdp targets to http bases", () => {
    expect(resolveHttpBase("9224")).toBe("http://127.0.0.1:9224")
    expect(resolveHttpBase("ws://127.0.0.1:9224/devtools/browser/test")).toBe("http://127.0.0.1:9224")
    expect(resolveHttpBase("wss://browser.example.com/devtools/browser/test")).toBe("https://browser.example.com")
  })

  it("rejects unsupported cdp target shapes", () => {
    expect(() => resolveHttpBase("not a target")).toThrow("Unsupported CDP target")
  })

  it("rewrites browser websocket urls through a proxied host target", () => {
    expect(
      rewriteDevtoolsWebSocketUrl(
        "ws://127.0.0.1:9224/devtools/browser/abc123",
        "http://host.docker.internal:9324",
      ),
    ).toBe("ws://host.docker.internal:9324/devtools/browser/abc123")
  })

  it("leaves invalid websocket urls unchanged", () => {
    expect(rewriteDevtoolsWebSocketUrl("", "http://host.docker.internal:9324")).toBe("")
    expect(rewriteDevtoolsWebSocketUrl("not-a-url", "http://host.docker.internal:9324")).toBe("not-a-url")
  })

  it("upgrades to secure websocket when the http base is https", () => {
    expect(
      rewriteDevtoolsWebSocketUrl(
        "ws://127.0.0.1:9224/devtools/browser/secure",
        "https://browser.example.com",
      ),
    ).toBe("wss://browser.example.com/devtools/browser/secure")
  })
})
