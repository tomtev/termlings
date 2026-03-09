import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createMemoryCollection,
  createMemoryRecord,
  getQmdStatus,
  listMemoryCollections,
  readMemoryHistory,
  searchMemoryRecords,
  syncMemoryQmd,
} from "../memory.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("memory app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-memory-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
    ensureWorkspaceDirs(root)
    mkdirSync(join(root, ".termlings", "agents", "growth"), { recursive: true })
    writeFileSync(join(root, ".termlings", "agents", "growth", "SOUL.md"), "# Growth\n")
    process.env.TERMLINGS_SESSION_ID = "tl-growth-1"
    process.env.TERMLINGS_AGENT_SLUG = "growth"
    process.env.TERMLINGS_AGENT_NAME = "Mango"
    process.env.TERMLINGS_AGENT_DNA = "80bf40"
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalEnv.sessionId === undefined) delete process.env.TERMLINGS_SESSION_ID
    else process.env.TERMLINGS_SESSION_ID = originalEnv.sessionId
    if (originalEnv.agentSlug === undefined) delete process.env.TERMLINGS_AGENT_SLUG
    else process.env.TERMLINGS_AGENT_SLUG = originalEnv.agentSlug
    if (originalEnv.agentName === undefined) delete process.env.TERMLINGS_AGENT_NAME
    else process.env.TERMLINGS_AGENT_NAME = originalEnv.agentName
    if (originalEnv.agentDna === undefined) delete process.env.TERMLINGS_AGENT_DNA
    else process.env.TERMLINGS_AGENT_DNA = originalEnv.agentDna
    rmSync(root, { recursive: true, force: true })
  })

  it("creates memory store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "memory", "records"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "memory", "qmd"))).toBe(true)
  })

  it("lists built-in and custom memory collections", () => {
    const collections = listMemoryCollections(root)
    expect(collections.map((entry) => entry.id)).toEqual(expect.arrayContaining(["project", "shared", "agent-growth"]))

    const custom = createMemoryCollection("research", "Research Notes", root)
    expect(custom.id).toBe("research")
    expect(listMemoryCollections(root).map((entry) => entry.id)).toContain("research")
  })

  it("creates local memory and searches it without qmd", () => {
    createMemoryRecord({
      collection: "project",
      title: "CSV export",
      text: "Customer keeps asking for CSV export in onboarding",
      tags: ["feedback", "export"],
    }, root)

    createMemoryRecord({
      collection: "agent-growth",
      text: "Meta CAC spiked this week",
      tags: ["ads"],
    }, root)

    const results = searchMemoryRecords("csv export", { collection: "project" }, root)
    expect(results[0]?.collection).toBe("project")
    expect(results[0]?.snippet).toContain("CSV export")

    const history = readMemoryHistory(10, root)
    expect(history[0]?.status).toBe("created")

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.app)).toContain("memory")
    expect(activities.map((entry) => entry.kind)).toContain("record.created")
  })

  it("reports qmd status and syncs exports when qmd is available", () => {
    createMemoryRecord({
      collection: "project",
      title: "Search source",
      text: "This note should be exported for qmd",
    }, root)

    const missing = getQmdStatus(root, () => ({
      pid: 0,
      output: [],
      stdout: "",
      stderr: "",
      status: null,
      signal: null,
      error: new Error("spawn qmd ENOENT"),
    }))
    expect(missing.available).toBe(false)

    const calls: string[][] = []
    const synced = syncMemoryQmd({ embed: true }, root, (_command, args) => {
      calls.push(args)
      return {
        pid: 1,
        output: [],
        stdout: "ok",
        stderr: "",
        status: 0,
        signal: null,
      }
    })

    expect(synced.available).toBe(true)
    expect(synced.exportedFiles.length).toBe(1)
    expect(synced.registeredCollections).toEqual(expect.arrayContaining(["project", "shared", "agent-growth"]))
    expect(calls.some((args) => args[0] === "status")).toBe(true)
    expect(calls.some((args) => args[0] === "collection" && args[1] === "add")).toBe(true)
    expect(calls.some((args) => args[0] === "embed")).toBe(true)
  })
})
