import { describe, expect, it } from "bun:test"

import claude from "../src/agents/claude.js"
import codex from "../src/agents/codex.js"
import { composeLaunchArgs } from "../src/agents/launcher.js"

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
