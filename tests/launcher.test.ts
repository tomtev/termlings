import { describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import claude from "../src/agents/claude.js"
import codex from "../src/agents/codex.js"
import { buildLaunchContextEnv, composeLaunchArgs, writeSystemContextDebugFile } from "../src/agents/launcher.js"
import { BUILTIN_WORKSPACE_APPS } from "../src/engine/apps.js"
import { renderSoulContext, renderSystemContext } from "../src/system-context.js"

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

describe("writeSystemContextDebugFile", () => {
  it("writes the rendered system context into the saved agent folder", () => {
    const root = mkdtempSync(join(tmpdir(), "termlings-launcher-test-"))
    mkdirSync(join(root, ".termlings", "agents", "developer"), { recursive: true })
    const context = [
      renderSoulContext({
        name: "Scout",
        slug: "developer",
        sessionId: "tl-test",
        dna: "0a3f201",
        title: "Developer",
        titleShort: "Dev",
        role: "Build and ship",
        team: "Engineering",
        reportsTo: "agent:pm",
        description: "Turn validated ideas into working software.",
      }),
      renderSystemContext({
        apps: BUILTIN_WORKSPACE_APPS,
      }),
    ].join("\n\n")

    const written = writeSystemContextDebugFile({
      agentName: "Scout",
      agentSlug: "developer",
      sessionId: "tl-test",
      runtimeName: "claude",
      context,
      root,
      generatedAt: Date.parse("2026-03-09T10:00:00Z"),
    })

    expect(written).toBe(join(root, ".termlings", "agents", "developer", "system-context.debug.md"))

    const content = readFileSync(written!, "utf8")
    expect(content).toContain("# System Context Debug")
    expect(content).toContain("- Agent: Scout")
    expect(content).toContain("- Slug: developer")
    expect(content).toContain("- Session ID: tl-test")
    expect(content).toContain("- Runtime: claude")
    expect(content).toContain("- Generated At: 2026-03-09T10:00:00.000Z")
    expect(content).toContain("<TERMLINGS-SOUL>")
    expect(content).toContain("<TERMLINGS-SYSTEM-MESSAGE>")
    expect(content.indexOf("<TERMLINGS-SOUL>")).toBeLessThan(content.indexOf("<TERMLINGS-SYSTEM-MESSAGE>"))

    rmSync(root, { recursive: true, force: true })
  })

  it("skips writing when the saved agent folder does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "termlings-launcher-test-"))

    expect(writeSystemContextDebugFile({
      agentName: "Scout",
      agentSlug: "developer",
      sessionId: "tl-test",
      runtimeName: "claude",
      context: "hello",
      root,
    })).toBeUndefined()

    rmSync(root, { recursive: true, force: true })
  })
})
