import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { discoverLocalAgents } from "../../agents/discover.js"
import { getAllCalendarEvents } from "../../engine/calendar.js"
import { listRequests, type AgentRequest } from "../../engine/requests.js"
import { getAllTasks, type Task } from "../../engine/tasks.js"
import {
  appendWorkspaceMessage,
  ensureWorkspaceDirs,
  listSessions,
  readWorkspaceMessages,
  updateWorkspaceSettings,
  upsertSession,
} from "../state.js"

describe("workspace scaling guards", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-scaling-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("returns recent merged messages without touching workspace metadata on reads", async () => {
    ensureWorkspaceDirs(root)
    updateWorkspaceSettings({ showBrowserActivity: true }, root)
    upsertSession("tl-test-1", { name: "Agent", dna: "1234567" }, root)

    appendWorkspaceMessage(
      { kind: "chat", channel: "workspace", from: "tl-test-1", fromName: "Agent", text: "old", ts: 10, id: "m1" },
      root,
    )
    appendWorkspaceMessage(
      { kind: "dm", from: "human:default", fromName: "Owner", target: "agent:developer", text: "middle", ts: 20, id: "m2" },
      root,
    )
    appendWorkspaceMessage(
      { kind: "system", from: "system", fromName: "System", text: "new", ts: 30, id: "m3" },
      root,
    )

    const workspacePath = join(root, ".termlings", "workspace.json")
    const before = statSync(workspacePath).mtimeMs

    await new Promise((resolve) => setTimeout(resolve, 20))

    const sessions = listSessions(root)
    const messages = readWorkspaceMessages({ limit: 2 }, root)

    const after = statSync(workspacePath).mtimeMs
    expect(after).toBe(before)
    expect(sessions.map((session) => session.sessionId)).toEqual(["tl-test-1"])
    expect(messages.map((message) => message.id)).toEqual(["m2", "m3"])
  })

  it("reuses cached task arrays until the backing file changes", () => {
    const tasksPath = join(root, ".termlings", "store", "tasks", "tasks.json")
    mkdirSync(join(root, ".termlings", "store", "tasks"), { recursive: true })

    const tasks: Task[] = [
      {
        id: "task-1",
        title: "Task One",
        description: "",
        status: "open",
        priority: "medium",
        createdAt: 1,
        createdBy: "human:default",
        updatedAt: 1,
        notes: [],
      },
    ]

    writeFileSync(tasksPath, JSON.stringify(tasks, null, 2) + "\n", "utf8")

    const first = getAllTasks()
    const second = getAllTasks()
    expect(second).toBe(first)

    const nextTasks = [...tasks, {
      id: "task-2",
      title: "Task Two",
      description: "",
      status: "open",
      priority: "high",
      createdAt: 2,
      createdBy: "human:default",
      updatedAt: 2,
      notes: [],
    }]

    writeFileSync(tasksPath, JSON.stringify(nextTasks, null, 2) + "\n", "utf8")

    const third = getAllTasks()
    expect(third).not.toBe(first)
    expect(third.map((task) => task.id)).toEqual(["task-1", "task-2"])
  })

  it("reuses cached calendar arrays until the backing file changes", () => {
    const calendarPath = join(root, ".termlings", "store", "calendar", "calendar.json")
    mkdirSync(join(root, ".termlings", "store", "calendar"), { recursive: true })

    const events = [
      {
        id: "event-1",
        title: "Standup",
        description: "",
        assignedAgents: ["developer"],
        startTime: 100,
        endTime: 200,
        recurrence: "none",
        enabled: true,
        createdAt: 1,
        createdBy: "OWNER",
        updatedAt: 1,
      },
    ]

    writeFileSync(calendarPath, JSON.stringify(events, null, 2) + "\n", "utf8")

    const first = getAllCalendarEvents()
    const second = getAllCalendarEvents()
    expect(second).toBe(first)

    const nextEvents = [...events, {
      id: "event-2",
      title: "Review",
      description: "",
      assignedAgents: ["developer"],
      startTime: 300,
      endTime: 400,
      recurrence: "weekly",
      enabled: true,
      createdAt: 2,
      createdBy: "OWNER",
      updatedAt: 2,
    }]

    writeFileSync(calendarPath, JSON.stringify(nextEvents, null, 2) + "\n", "utf8")

    const third = getAllCalendarEvents()
    expect(third).not.toBe(first)
    expect(third.map((event) => event.id)).toEqual(["event-1", "event-2"])
  })

  it("reuses discovered agents until SOUL files change", () => {
    const agentDir = join(root, ".termlings", "agents", "developer")
    mkdirSync(agentDir, { recursive: true })
    const soulPath = join(agentDir, "SOUL.md")

    writeFileSync(
      soulPath,
      [
        "---",
        "name: Developer",
        "dna: abcdef0",
        "title: Developer",
        "---",
        "Build things",
        "",
      ].join("\n"),
      "utf8",
    )

    const first = discoverLocalAgents()
    const second = discoverLocalAgents()
    expect(second).toBe(first)

    writeFileSync(
      soulPath,
      [
        "---",
        "name: Developer",
        "dna: abcdef0",
        "title: Senior Developer",
        "---",
        "Build more things",
        "",
      ].join("\n"),
      "utf8",
    )

    const third = discoverLocalAgents()
    expect(third).not.toBe(first)
    expect(third[0]?.soul?.title).toBe("Senior Developer")
  })

  it("reuses cached request lists until request files change", () => {
    const requestsDir = join(root, ".termlings", "store", "requests")
    mkdirSync(requestsDir, { recursive: true })

    const requests: AgentRequest[] = [
      {
        id: "req-1",
        type: "confirm",
        status: "pending",
        from: "tl-test-1",
        fromName: "Agent",
        ts: 1,
        question: "Proceed?",
      },
    ]

    writeFileSync(join(requestsDir, "req-1.json"), JSON.stringify(requests[0], null, 2) + "\n", "utf8")

    const first = listRequests()
    const second = listRequests()
    expect(second).toBe(first)

    const nextRequest: AgentRequest = {
      id: "req-2",
      type: "choice",
      status: "resolved",
      from: "tl-test-2",
      fromName: "Agent Two",
      ts: 2,
      options: ["yes", "no"],
      response: "yes",
      resolvedAt: 3,
    }

    writeFileSync(join(requestsDir, "req-2.json"), JSON.stringify(nextRequest, null, 2) + "\n", "utf8")

    const third = listRequests()
    expect(third).not.toBe(first)
    expect(third.map((request) => request.id)).toEqual(["req-2", "req-1"])
  })
})
