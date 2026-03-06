import { describe, expect, it } from "vitest"

import { getTopLevelInitOptions, listUnsupportedTopLevelFlags } from "../top-level-startup.js"

describe("top-level startup helpers", () => {
  it("allows --template when used with --spawn", () => {
    const flags = new Set(["spawn", "template"])

    expect(listUnsupportedTopLevelFlags(flags)).toEqual([])
    expect(getTopLevelInitOptions(flags, { template: "personal-assistant" })).toEqual({
      template: "personal-assistant",
    })
  })

  it("rejects --template without --spawn", () => {
    const flags = new Set(["template"])

    expect(listUnsupportedTopLevelFlags(flags)).toEqual(["template"])
    expect(getTopLevelInitOptions(flags, { template: "personal-assistant" })).toEqual({})
  })
})
