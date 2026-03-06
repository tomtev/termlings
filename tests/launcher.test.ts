import { describe, expect, it } from "bun:test"

import claude from "../src/agents/claude.js"
import codex from "../src/agents/codex.js"
import { buildLaunchContextEnv, composeLaunchArgs } from "../src/agents/launcher.js"

describe("composeLaunchArgs", () => {
  it("keeps Codex preset flags before the injected prompt", () => {
    const args = composeLaunchArgs(
      codex,
      "termlings context",
      [],
      ["--dangerously-bypass-approvals-and-sandbox"],
    )

    expect(args).toEqual([
      "--dangerously-bypass-approvals-and-sandbox",
      "termlings context",
    ])
  })

  it("appends the injected prompt after Codex resume args", () => {
    const args = composeLaunchArgs(
      codex,
      "termlings context",
      [],
      ["--dangerously-bypass-approvals-and-sandbox", "resume", "--last"],
    )

    expect(args).toEqual([
      "--dangerously-bypass-approvals-and-sandbox",
      "resume",
      "--last",
      "termlings context",
    ])
  })

  it("prepends Claude system prompt args before runtime session args", () => {
    const args = composeLaunchArgs(
      claude,
      "termlings context",
      ["--session-id", "session-123"],
      ["--dangerously-skip-permissions"],
    )

    expect(args).toEqual([
      "--append-system-prompt",
      "termlings context",
      "--session-id",
      "session-123",
      "--dangerously-skip-permissions",
    ])
  })
})

describe("buildLaunchContextEnv", () => {
  it("returns undefined when no context is provided", () => {
    expect(buildLaunchContextEnv("")).toBeUndefined()
  })

  it("passes through the final context when simple mode is off", () => {
    expect(buildLaunchContextEnv("termlings context", false)).toBe("termlings context")
  })

  it("appends workspace mode guidance when simple mode is enabled", () => {
    const result = buildLaunchContextEnv("termlings context", true)

    expect(result).toContain("termlings context")
    expect(result).toContain("## Workspace Mode")
    expect(result).toContain("termlings message <target> <message>")
    expect(result).toContain("termlings workflow")
  })
})
