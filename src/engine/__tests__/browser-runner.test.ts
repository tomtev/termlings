import { describe, expect, it } from "vitest"
import { collectVisibleTabs, isIgnoredInternalBrowserPage } from "../browser-runner.mjs"

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
