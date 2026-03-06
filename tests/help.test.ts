import { describe, expect, it } from "vitest"

import { BUILTIN_WORKSPACE_APPS } from "../src/engine/apps.js"
import { renderTopLevelHelp } from "../src/help.js"

describe("renderTopLevelHelp", () => {
  it("hides disabled app commands from top-level help", () => {
    const help = renderTopLevelHelp({
      ...BUILTIN_WORKSPACE_APPS,
      brief: false,
      messaging: false,
      requests: false,
      "org-chart": false,
      task: false,
      workflows: false,
      calendar: false,
      browser: false,
      skills: false,
      brand: false,
      crm: false,
    })

    expect(help.includes("termlings brief")).toBe(false)
    expect(help.includes("termlings org-chart")).toBe(false)
    expect(help.includes("termlings list-agents")).toBe(false)
    expect(help.includes("termlings skills <cmd>")).toBe(false)
    expect(help.includes("termlings message <target> <text>")).toBe(false)
    expect(help.includes("termlings conversation <target>")).toBe(false)
    expect(help.includes("termlings request <type>")).toBe(false)
    expect(help.includes("termlings task <cmd>")).toBe(false)
    expect(help.includes("termlings workflow <cmd>")).toBe(false)
    expect(help.includes("termlings calendar <cmd>")).toBe(false)
    expect(help.includes("termlings brand <cmd>")).toBe(false)
    expect(help.includes("termlings crm <cmd>")).toBe(false)
    expect(help.includes("Browser Automation:")).toBe(false)
    expect(help.includes("termlings browser --help")).toBe(false)
    expect(help.includes("termlings agents <cmd>")).toBe(true)
  })

  it("shows enabled app commands in top-level help", () => {
    const help = renderTopLevelHelp(BUILTIN_WORKSPACE_APPS)

    expect(help.includes("termlings brief")).toBe(true)
    expect(help.includes("termlings message <target> <text>")).toBe(true)
    expect(help.includes("termlings crm <cmd>")).toBe(true)
    expect(help.includes("termlings browser --help")).toBe(true)
  })
})
