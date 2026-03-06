import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { runCreate } from "../src/create.js"

describe("runCreate", () => {
  const originalCwd = process.cwd()
  const originalRandom = Math.random
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-create-test-"))
    process.chdir(root)
  })

  afterEach(() => {
    Math.random = originalRandom
    process.chdir(originalCwd)
    if (root) {
      rmSync(root, { recursive: true, force: true })
      root = ""
    }
  })

  it("generates a fun display name when --name is omitted", async () => {
    Math.random = () => 0

    await runCreate({
      slug: "backend",
      nonInteractive: true,
      dna: "0a3f201",
      purpose: "Build backend systems",
      title: "Backend Developer",
    })

    const soulPath = join(root, ".termlings", "agents", "backend", "SOUL.md")
    const soul = readFileSync(soulPath, "utf8")

    expect(soul).toContain("name: Pixel")
    expect(soul).not.toContain("name: Backend")
  })

  it("preserves an explicit display name override", async () => {
    await runCreate({
      slug: "backend",
      name: "Scout",
      nonInteractive: true,
      dna: "0a3f201",
      purpose: "Build backend systems",
      title: "Backend Developer",
    })

    const soulPath = join(root, ".termlings", "agents", "backend", "SOUL.md")
    const soul = readFileSync(soulPath, "utf8")

    expect(soul).toContain("name: Scout")
  })
})
