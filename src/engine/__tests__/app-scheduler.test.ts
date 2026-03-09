import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createScheduledAppJob,
  getAllScheduledAppJobs,
  saveScheduledAppJobs,
} from "../app-schedules.js"
import { executeScheduledAppJobs } from "../app-scheduler.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("scheduled app jobs", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-app-scheduler-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("creates and persists app schedules", () => {
    const job = createScheduledAppJob({
      app: "analytics",
      action: "sync",
      provider: "google-analytics",
      last: "30d",
      recurrence: "daily",
      time: "07:00",
      timezone: "Europe/Oslo",
      createdBy: "human:default",
    }, root)

    const jobs = getAllScheduledAppJobs(root)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.id).toBe(job.id)
    expect(jobs[0]?.app).toBe("analytics")
    expect(jobs[0]?.nextRunAt).toBeTypeOf("number")
  })

  it("executes due recurring app jobs and advances the next run", async () => {
    const analyticsSync = vi.fn(async () => ({ ok: true }))
    const created = createScheduledAppJob({
      app: "analytics",
      action: "sync",
      provider: "google-analytics",
      last: "7d",
      recurrence: "daily",
      time: "07:00",
      timezone: "UTC",
      createdBy: "agent:growth",
    }, root)

    const jobs = getAllScheduledAppJobs(root)
    jobs[0]!.nextRunAt = Date.now() - 1_000
    saveScheduledAppJobs(jobs, root)

    const results = await executeScheduledAppJobs(Date.now(), root, { analyticsSync })

    expect(results).toHaveLength(1)
    expect(results[0]?.success).toBe(true)
    expect(analyticsSync).toHaveBeenCalledTimes(1)
    expect(analyticsSync).toHaveBeenCalledWith({ provider: "google-analytics", last: "7d" }, root)

    const updated = getAllScheduledAppJobs(root).find((job) => job.id === created.id)
    expect(updated?.enabled).toBe(true)
    expect(updated?.lastSuccessAt).toBeTypeOf("number")
    expect(updated?.nextRunAt).toBeTypeOf("number")
    expect((updated?.nextRunAt || 0)).toBeGreaterThan(Date.now() - 10_000)

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.kind)).toContain("schedule.created")
    expect(activities.map((entry) => entry.kind)).toContain("schedule.executed")
  })

  it("records failure and disables one-time jobs after attempt", async () => {
    const financeSync = vi.fn(async () => {
      throw new Error("bad token")
    })
    const created = createScheduledAppJob({
      app: "finance",
      action: "sync",
      provider: "stripe",
      last: "30d",
      recurrence: "once",
      time: "08:00",
      timezone: "UTC",
      date: "2027-01-01",
      createdBy: "human:default",
    }, root)

    const jobs = getAllScheduledAppJobs(root)
    jobs[0]!.nextRunAt = Date.now() - 1_000
    saveScheduledAppJobs(jobs, root)

    const results = await executeScheduledAppJobs(Date.now(), root, { financeSync })

    expect(results).toHaveLength(1)
    expect(results[0]?.success).toBe(false)
    expect(results[0]?.error).toContain("bad token")

    const updated = getAllScheduledAppJobs(root).find((job) => job.id === created.id)
    expect(updated?.enabled).toBe(false)
    expect(updated?.nextRunAt).toBe(null)
    expect(updated?.lastError).toContain("bad token")

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.kind)).toContain("schedule.failed")
  })
})
