import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { createScheduledMessage, getAllScheduledMessages } from "../message-schedules.js"
import { executeScheduledMessages } from "../message-scheduler.js"
import { readQueuedMessages, updateDirs } from "../ipc.js"
import { getDmMessages } from "../../workspace/state.js"

function writeSoul(root: string, slug: string, opts: { name: string; dna: string }): void {
  const dir = join(root, ".termlings", "agents", slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "SOUL.md"),
    `---\nname: ${opts.name}\ndna: ${opts.dna}\n---\n`,
    "utf8",
  )
}

describe("scheduled message execution", () => {
  const originalCwd = process.cwd()
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-message-scheduler-test-"))
    process.chdir(root)
    updateDirs()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    updateDirs()
    rmSync(root, { recursive: true, force: true })
  })

  it("queues one-time scheduled agent messages and disables the schedule after delivery", () => {
    writeSoul(root, "ceo", { name: "CEO", dna: "ceo0001" })

    const created = createScheduledMessage(
      {
        target: "agent:ceo",
        targetName: "CEO",
        targetDna: "ceo0001",
        text: "Check in on the team and report blockers.",
        recurrence: "once",
        date: "2026-03-07",
        time: "09:00",
        timezone: "UTC",
        createdBy: "human:default",
      },
      root,
      Date.UTC(2026, 2, 6, 8, 0, 0),
    )

    expect(created.nextRunAt).toBe(Date.UTC(2026, 2, 7, 9, 0, 0))

    const results = executeScheduledMessages(Date.UTC(2026, 2, 7, 9, 0, 0), root)
    expect(results).toHaveLength(1)
    expect(results[0]?.target).toBe("agent:ceo")

    const queued = readQueuedMessages("ceo")
    expect(queued).toHaveLength(1)
    expect(queued[0]?.text).toBe("Check in on the team and report blockers.")

    const schedules = getAllScheduledMessages(root)
    expect(schedules[0]?.enabled).toBe(false)
    expect(schedules[0]?.nextRunAt).toBe(null)

    const thread = getDmMessages("agent:ceo", root)
    expect(thread).toHaveLength(1)
    expect(thread[0]).toMatchObject({
      from: "system:scheduler",
      target: "agent:ceo",
      text: "Check in on the team and report blockers.",
    })
  })

  it("advances recurring daily schedules to the next run after delivery", () => {
    createScheduledMessage(
      {
        target: "human:default",
        targetName: "Owner",
        text: "Daily company pulse check.",
        recurrence: "daily",
        time: "09:00",
        timezone: "UTC",
        createdBy: "human:default",
      },
      root,
      Date.UTC(2026, 2, 6, 8, 0, 0),
    )

    const results = executeScheduledMessages(Date.UTC(2026, 2, 6, 9, 0, 0), root)
    expect(results).toHaveLength(1)

    const schedules = getAllScheduledMessages(root)
    expect(schedules[0]?.enabled).toBe(true)
    expect(schedules[0]?.nextRunAt).toBe(Date.UTC(2026, 2, 7, 9, 0, 0))

    const thread = getDmMessages("human:default", root)
    expect(thread).toHaveLength(1)
    expect(thread[0]?.text).toBe("Daily company pulse check.")
  })

  it("advances recurring hourly schedules to the next hour after delivery", () => {
    createScheduledMessage(
      {
        target: "human:default",
        targetName: "Owner",
        text: "Hourly pulse check.",
        recurrence: "hourly",
        time: "00:15",
        timezone: "UTC",
        createdBy: "human:default",
      },
      root,
      Date.UTC(2026, 2, 6, 8, 0, 0),
    )

    const results = executeScheduledMessages(Date.UTC(2026, 2, 6, 8, 15, 0), root)
    expect(results).toHaveLength(1)

    const schedules = getAllScheduledMessages(root)
    expect(schedules[0]?.enabled).toBe(true)
    expect(schedules[0]?.nextRunAt).toBe(Date.UTC(2026, 2, 6, 9, 15, 0))

    const thread = getDmMessages("human:default", root)
    expect(thread).toHaveLength(1)
    expect(thread[0]?.text).toBe("Hourly pulse check.")
  })
})
