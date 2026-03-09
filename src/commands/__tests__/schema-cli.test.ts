import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { spawnSync } from "child_process"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { ensureWorkspaceDirs } from "../../workspace/state.js"

const CLI_ENTRY = join(import.meta.dir, "../../../bin/termlings.js")

function runCli(root: string, args: string[]) {
  return spawnSync(process.execPath, ["run", CLI_ENTRY, ...args], {
    cwd: root,
    encoding: "utf8",
  })
}

describe("command schema CLI", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    originalCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), "termlings-schema-cli-"))
    process.chdir(root)
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("prints schema for legacy command surfaces", () => {
    const cases = [
      { args: ["brief", "schema"], needle: "\"command\": \"brief\"" },
      { args: ["org-chart", "schema"], needle: "\"command\": \"org-chart\"" },
      { args: ["message", "schema"], needle: "\"command\": \"message\"" },
      { args: ["conversation", "schema"], needle: "\"command\": \"conversation\"" },
      { args: ["request", "schema"], needle: "\"command\": \"request\"" },
      { args: ["task", "schema"], needle: "\"command\": \"task\"" },
      { args: ["workflow", "schema"], needle: "\"command\": \"workflow\"" },
      { args: ["calendar", "schema"], needle: "\"command\": \"calendar\"" },
      { args: ["skills", "schema"], needle: "\"command\": \"skills\"" },
      { args: ["browser", "schema"], needle: "\"command\": \"browser\"" },
      { args: ["brand", "schema"], needle: "\"command\": \"brand\"" },
    ]

    for (const testCase of cases) {
      const result = runCli(root, testCase.args)
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(testCase.needle)
      expect(result.stdout).toContain("\"actions\"")
    }
  })

  it("prints action-level schema for nested commands", () => {
    const workflow = runCli(root, ["workflow", "schema", "step.done"])
    expect(workflow.status).toBe(0)
    expect(workflow.stdout).toContain("\"action\": \"step.done\"")
    expect(workflow.stdout).toContain("termlings workflow step done <ref> <step-id> [--agent <slug>]")
    expect(workflow.stdout).toContain("\"invoke\": [")

    const browser = runCli(root, ["browser", "schema", "patterns.execute"])
    expect(browser.status).toBe(0)
    expect(browser.stdout).toContain("\"action\": \"patterns.execute\"")
    expect(browser.stdout).toContain("termlings browser patterns execute <id> [key=value ...] [--tab <index>] [--out <path>]")
  })

  it("prints brand command schema instead of a brand profile template", () => {
    const result = runCli(root, ["brand", "schema"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("\"command\": \"brand\"")
    expect(result.stdout).toContain("\"actions\"")
    expect(result.stdout).not.toContain("\"schemaVersion\": 1")
  })

  it("applies calendar flag options through the shared parser", () => {
    const createAlice = runCli(root, [
      "calendar",
      "create",
      "alice",
      "Standup",
      "2026-03-02T09:00:00Z",
      "2026-03-02T09:30:00Z",
      "daily",
    ])
    expect(createAlice.status).toBe(0)

    const createBob = runCli(root, [
      "calendar",
      "create",
      "bob",
      "Planning",
      "2026-03-03T09:00:00Z",
      "2026-03-03T09:30:00Z",
    ])
    expect(createBob.status).toBe(0)

    const list = runCli(root, ["calendar", "list", "--agent", "alice"])
    expect(list.status).toBe(0)
    expect(list.stdout).toContain("Standup")
    expect(list.stdout).not.toContain("Planning")

    const calendarFile = join(root, ".termlings/store/calendar/calendar.json")
    const beforeEdit = JSON.parse(readFileSync(calendarFile, "utf8")) as Array<{ id: string }>
    const eventId = beforeEdit[0]?.id
    expect(eventId).toBeTruthy()

    const edit = runCli(root, ["calendar", "edit", eventId, "--title", "Team Standup", "--recurrence", "weekly", "--agents", "alice,bob"])
    expect(edit.status).toBe(0)

    const afterEdit = JSON.parse(readFileSync(calendarFile, "utf8")) as Array<{
      id: string
      title: string
      recurrence: string
      assignedAgents: string[]
    }>
    const edited = afterEdit.find((event) => event.id === eventId)
    expect(edited?.title).toBe("Team Standup")
    expect(edited?.recurrence).toBe("weekly")
    expect(edited?.assignedAgents).toEqual(["alice", "bob"])
  })
})
