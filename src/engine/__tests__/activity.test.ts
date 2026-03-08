import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  appendAppActivity,
  readRecentAppActivityEntries,
  readRecentThreadActivityEntries,
  resolveAgentActivityThreadId,
} from "../activity.js"
import { createTask } from "../tasks.js"
import { createRequest } from "../requests.js"
import { createScheduledMessage } from "../message-schedules.js"
import { logBrowserActivity } from "../browser.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("shared app activity feed", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    ipcDir: process.env.TERMLINGS_IPC_DIR,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-activity-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
    process.env.TERMLINGS_IPC_DIR = join(root, ".termlings")
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalEnv.ipcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalEnv.ipcDir
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

  it("stores global and per-thread activity entries for future app apis", () => {
    appendAppActivity({
      ts: 1,
      app: "custom-ai",
      kind: "output",
      text: "custom app emitted an event",
      surface: "both",
      threadId: "agent:developer",
      actorName: "Custom AI",
    }, root)
    appendAppActivity({
      ts: 2,
      app: "custom-ai",
      kind: "broadcast",
      text: "custom app emitted a global-only event",
      surface: "feed",
      threadId: "agent:developer",
      actorName: "Custom AI",
    }, root)

    expect(readRecentAppActivityEntries(10, root).map((entry) => entry.text)).toEqual([
      "custom app emitted an event",
      "custom app emitted a global-only event",
    ])
    expect(readRecentThreadActivityEntries("agent:developer", 10, root).map((entry) => entry.text)).toEqual([
      "custom app emitted an event",
    ])
    expect(resolveAgentActivityThreadId({ agentSlug: "developer" })).toBe("agent:developer")
  })

  it("collects task, request, schedule, and browser events into the same activity system", () => {
    process.env.TERMLINGS_SESSION_ID = "tl-dev-1"
    process.env.TERMLINGS_AGENT_SLUG = "developer"
    process.env.TERMLINGS_AGENT_NAME = "Developer"
    process.env.TERMLINGS_AGENT_DNA = "abc1234"

    createTask(
      "Ship browser logging",
      "Add shared activity feed",
      "high",
      undefined,
      { createdBy: "agent:developer", createdByName: "Developer" },
    )
    createRequest({
      type: "confirm",
      from: "tl-dev-1",
      fromName: "Developer",
      fromSlug: "developer",
      fromDna: "abc1234",
      question: "Ship the browser activity feed?",
    })
    createScheduledMessage({
      target: "agent:developer",
      targetName: "Developer",
      targetDna: "abc1234",
      text: "Follow up on the browser logs",
      recurrence: "once",
      date: "2026-03-08",
      time: "09:00",
      timezone: "Europe/Oslo",
      createdBy: "human:default",
    }, root, Date.UTC(2026, 2, 7, 8, 0, 0))
    logBrowserActivity("click", ["button.publish"], "success", undefined, "tab-1")

    const feed = readRecentAppActivityEntries(20, root)
    expect(feed.map((entry) => entry.app)).toEqual(
      expect.arrayContaining(["task", "requests", "messaging", "browser"]),
    )
    expect(feed.map((entry) => entry.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("created task"),
        expect.stringContaining("created request"),
        expect.stringContaining("scheduled message to Developer"),
        "clicked button.publish",
      ]),
    )

    const thread = readRecentThreadActivityEntries("agent:developer", 20, root)
    expect(thread.map((entry) => entry.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("created task"),
        expect.stringContaining("created request"),
        expect.stringContaining("scheduled message to Developer"),
        "clicked button.publish",
      ]),
    )
  })
})
