import { describe, expect, it } from "vitest"
import { sanitizeManagedRuntimeEnv } from "../runtime-processes.js"

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
})
