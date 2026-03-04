import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  appendWorkspaceMessage,
  clearWorkspaceRuntime,
  ensureWorkspaceDirs,
  listSessions,
} from "../state.js"

describe("presence state", () => {
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-presence-test-"))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("migrates legacy typing files into store/presence", () => {
    const legacyDir = join(root, ".termlings")
    mkdirSync(legacyDir, { recursive: true })
    const sessionId = "tl-legacy-123"
    const legacyPath = join(legacyDir, `${sessionId}.typing.json`)
    writeFileSync(
      legacyPath,
      JSON.stringify({ typing: true, source: "terminal", updatedAt: Date.now() }) + "\n",
      "utf8",
    )

    ensureWorkspaceDirs(root)

    const migratedPath = join(root, ".termlings", "store", "presence", `${sessionId}.typing.json`)
    expect(existsSync(migratedPath)).toBe(true)
    expect(existsSync(legacyPath)).toBe(false)
  })

  it("clears sender typing presence when a tl-* session sends a message", () => {
    ensureWorkspaceDirs(root)
    const sessionId = "tl-presence-1"
    const typingPath = join(root, ".termlings", "store", "presence", `${sessionId}.typing.json`)
    writeFileSync(
      typingPath,
      JSON.stringify({ typing: true, source: "terminal", updatedAt: 1 }) + "\n",
      "utf8",
    )

    const record = appendWorkspaceMessage(
      {
        kind: "dm",
        from: sessionId,
        fromName: "Alice",
        target: "human:default",
        text: "hello",
      },
      root,
    )

    const parsed = JSON.parse(readFileSync(typingPath, "utf8")) as {
      typing?: unknown
      source?: unknown
      updatedAt?: unknown
    }
    expect(parsed.typing).toBe(false)
    expect(parsed.source).toBe("terminal")
    expect(parsed.updatedAt).toBe(record.ts)
  })

  it("does not clear typing file for non-session sender ids", () => {
    ensureWorkspaceDirs(root)
    const sessionId = "tl-presence-2"
    const typingPath = join(root, ".termlings", "store", "presence", `${sessionId}.typing.json`)
    writeFileSync(
      typingPath,
      JSON.stringify({ typing: true, source: "terminal", updatedAt: 123 }) + "\n",
      "utf8",
    )

    appendWorkspaceMessage(
      {
        kind: "dm",
        from: "agent:developer",
        fromName: "Developer",
        target: "human:default",
        text: "status update",
      },
      root,
    )

    const parsed = JSON.parse(readFileSync(typingPath, "utf8")) as {
      typing?: unknown
      source?: unknown
      updatedAt?: unknown
    }
    expect(parsed.typing).toBe(true)
    expect(parsed.source).toBe("terminal")
    expect(parsed.updatedAt).toBe(123)
  })

  it("clears runtime presence + session files", () => {
    ensureWorkspaceDirs(root)
    const base = join(root, ".termlings")
    const presence = join(base, "store", "presence")
    const sessions = join(base, "sessions")
    const queuePath = join(base, "tl-queue.queue.jsonl")

    writeFileSync(join(presence, "tl-a.typing.json"), '{"typing":true,"source":"terminal","updatedAt":1}\n', "utf8")
    writeFileSync(join(sessions, "tl-a.json"), '{"sessionId":"tl-a","name":"A","dna":"aaaaaaa","joinedAt":1,"lastSeenAt":1}\n', "utf8")
    writeFileSync(queuePath, '{"action":"send","ts":1}\n', "utf8")

    clearWorkspaceRuntime(root)

    const presenceFiles = readdirSync(presence).filter((file) => file.endsWith(".typing.json"))
    const sessionFiles = readdirSync(sessions).filter((file) => file.endsWith(".json"))
    expect(presenceFiles).toHaveLength(0)
    expect(sessionFiles).toHaveLength(0)
    expect(existsSync(queuePath)).toBe(false)
  })

  it("prunes stale sessions when listing", () => {
    ensureWorkspaceDirs(root)
    const sessions = join(root, ".termlings", "sessions")
    const now = Date.now()
    const staleId = "tl-stale-1"
    const freshId = "tl-fresh-1"
    const stalePath = join(sessions, `${staleId}.json`)

    writeFileSync(
      stalePath,
      JSON.stringify({
        sessionId: staleId,
        name: "Stale",
        dna: "1111111",
        joinedAt: now - 60_000,
        lastSeenAt: now - 60_000,
      }) + "\n",
      "utf8",
    )
    writeFileSync(
      join(sessions, `${freshId}.json`),
      JSON.stringify({
        sessionId: freshId,
        name: "Fresh",
        dna: "2222222",
        joinedAt: now,
        lastSeenAt: now,
      }) + "\n",
      "utf8",
    )

    const listed = listSessions(root)
    expect(listed.map((item) => item.sessionId)).toEqual([freshId])
    expect(existsSync(stalePath)).toBe(false)
  })
})
