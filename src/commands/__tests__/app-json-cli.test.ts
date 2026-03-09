import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { spawnSync } from "child_process"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { ensureWorkspaceDirs } from "../../workspace/state.js"

const CLI_ENTRY = join(import.meta.dir, "../../../bin/termlings.js")

function runCli(root: string, args: string[], stdin?: string) {
  return spawnSync(process.execPath, ["run", CLI_ENTRY, ...args], {
    cwd: root,
    encoding: "utf8",
    input: stdin,
  })
}

describe("JSON-first app CLI", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    originalCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), "termlings-app-json-cli-"))
    process.chdir(root)
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("prints social schema and accepts stdin-json writes", () => {
    const schema = runCli(root, ["social", "schema", "create"])
    expect(schema.status).toBe(0)
    expect(schema.stdout).toContain("\"action\": \"create\"")
    expect(schema.stdout).toContain("\"stdinJson\"")

    const create = runCli(root, ["social", "create", "--stdin-json", "--json"], JSON.stringify({
      platform: "x",
      text: "Ship update",
    }))
    expect(create.status).toBe(0)
    expect(create.stdout).toContain("\"platform\": \"x\"")
    expect(create.stdout).toContain("\"status\": \"draft\"")

    const list = runCli(root, ["social", "list", "--params", "{\"status\":\"all\",\"limit\":10}", "--json"])
    expect(list.status).toBe(0)
    expect(list.stdout).toContain("\"Ship update\"")
  })

  it("rejects the old positional social create form", () => {
    const legacy = runCli(root, ["social", "create", "x", "Ship update"])
    expect(legacy.status).not.toBe(0)
    expect(legacy.stderr).toContain("Use --params and --stdin-json instead")
  })

  it("creates and lists app schedules through JSON", () => {
    const create = runCli(
      root,
      ["analytics", "schedule", "create", "--stdin-json", "--json"],
      JSON.stringify({
        action: "sync",
        recurrence: "daily",
        time: "07:00",
        last: "30d",
      }),
    )
    expect(create.status).toBe(0)
    expect(create.stdout).toContain("\"app\": \"analytics\"")

    const list = runCli(root, ["analytics", "schedule", "list", "--json"])
    expect(list.status).toBe(0)
    expect(list.stdout).toContain("\"recurrence\": \"daily\"")
  })
})
