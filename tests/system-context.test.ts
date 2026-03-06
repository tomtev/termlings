import { describe, expect, it } from "bun:test"

import { BUILTIN_WORKSPACE_APPS } from "../src/engine/apps.js"
import { renderSystemContext } from "../src/system-context.js"

describe("renderSystemContext", () => {
  it("omits crm guidance when crm app is disabled", () => {
    const context = renderSystemContext({
      name: "Growth",
      sessionId: "tl-test",
      title: "Growth",
      titleShort: "Growth",
      role: "Own customer discovery",
      description: "Growth agent",
      apps: {
        ...BUILTIN_WORKSPACE_APPS,
        crm: false,
      },
    })

    expect(context.includes("termlings crm --help")).toBe(false)
    expect(context.includes("## CRM")).toBe(false)
    expect(context.includes("system of record for external relationships")).toBe(false)
  })

  it("includes crm guidance when crm app is enabled", () => {
    const context = renderSystemContext({
      name: "Growth",
      sessionId: "tl-test",
      title: "Growth",
      titleShort: "Growth",
      role: "Own customer discovery",
      description: "Growth agent",
      apps: BUILTIN_WORKSPACE_APPS,
    })

    expect(context.includes("termlings crm --help")).toBe(true)
    expect(context.includes("## CRM")).toBe(true)
  })
})
