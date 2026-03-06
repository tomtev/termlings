import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { listManagedRuntimeProcesses, sanitizeManagedRuntimeEnv } from "../runtime-processes.js"

describe("sanitizeManagedRuntimeEnv", () => {
  it("removes inherited runtime session control vars but preserves user auth", () => {
    const sanitized = sanitizeManagedRuntimeEnv({
      PATH: "/usr/bin:/bin",
      HOME: "/Users/test",
      TERMLINGS_SESSION_ID: "tl-parent",
      TERMLINGS_AGENT_SLUG: "pm",
      CLAUDE_CODE_ENTRYPOINT: "parent-shell",
      CLAUDE_CODE_SESSION_ACCESS_TOKEN: "secret",
      CLAUDE_SESSION_ID: "claude-parent",
      CLAUDE_PROJECT_DIR: "/tmp/parent-project",
      CLAUDE_API_KEY: "claude-api-key",
      ANTHROPIC_API_KEY: "anthropic-api-key",
      OPENAI_API_KEY: "openai-api-key",
      CODEX_THREAD_ID: "codex-thread",
      SUPERSET_TAB_ID: "superset-tab",
      TERM_SESSION_ID: "term-session",
      ITERM_SESSION_ID: "iterm-session",
    })

    expect(sanitized).toMatchObject({
      PATH: "/usr/bin:/bin",
      HOME: "/Users/test",
      CLAUDE_API_KEY: "claude-api-key",
      ANTHROPIC_API_KEY: "anthropic-api-key",
      OPENAI_API_KEY: "openai-api-key",
    })

    expect(sanitized.TERMLINGS_SESSION_ID).toBeUndefined()
    expect(sanitized.TERMLINGS_AGENT_SLUG).toBeUndefined()
    expect(sanitized.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
    expect(sanitized.CLAUDE_CODE_SESSION_ACCESS_TOKEN).toBeUndefined()
    expect(sanitized.CLAUDE_SESSION_ID).toBeUndefined()
    expect(sanitized.CLAUDE_PROJECT_DIR).toBeUndefined()
    expect(sanitized.CODEX_THREAD_ID).toBeUndefined()
    expect(sanitized.SUPERSET_TAB_ID).toBeUndefined()
    expect(sanitized.TERM_SESSION_ID).toBeUndefined()
    expect(sanitized.ITERM_SESSION_ID).toBeUndefined()
  })

  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-runtime-processes-test-"))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("drops legacy runtime log metadata and removes runtime-logs directory", () => {
    const storeDir = join(root, ".termlings", "store")
    const logsDir = join(storeDir, "runtime-logs")
    mkdirSync(logsDir, { recursive: true })
    writeFileSync(join(logsDir, "agent-dev.log"), "sensitive output\n", "utf8")
    writeFileSync(
      join(storeDir, "runtime-processes.json"),
      JSON.stringify({
        version: 1,
        processes: [
          {
            key: "agent:developer",
            kind: "agent",
            pid: 12345,
            command: "termlings spawn claude default --agent=developer --inline",
            args: ["spawn", "claude"],
            cwd: root,
            startedAt: 1,
            updatedAt: 1,
            agentSlug: "developer",
            runtimeName: "claude",
            presetName: "default",
            logPath: join(logsDir, "agent-dev.log"),
          },
        ],
      }, null, 2) + "\n",
      "utf8",
    )

    const processes = listManagedRuntimeProcesses(root)
    expect(processes).toHaveLength(1)
    expect("logPath" in processes[0]!).toBe(false)
    expect(existsSync(logsDir)).toBe(false)

    const state = JSON.parse(readFileSync(join(storeDir, "runtime-processes.json"), "utf8")) as {
      processes?: Array<Record<string, unknown>>
    }
    expect(state.processes).toHaveLength(1)
    expect(state.processes?.[0]?.logPath).toBeUndefined()
  })
})
