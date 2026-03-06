import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { BUILTIN_WORKSPACE_APPS } from "../../engine/apps.js"
import { WorkspaceTui } from "../tui.js"
import { getAllScheduledMessages } from "../../engine/message-schedules.js"
import { executeSlashCommand } from "../slash-commands.js"
import { updateWorkspaceApps } from "../../workspace/state.js"

describe("workspace tui slash commands", () => {
  let root = ""

  const setSnapshot = (tui: any, overrides: Record<string, unknown> = {}): void => {
    tui.snapshot = {
      sessions: [],
      messages: [],
      tasks: [],
      calendarEvents: [],
      agents: [],
      dmThreads: [],
      requests: [],
      generatedAt: 1,
      ...overrides,
    }
    tui.rebuildSnapshotIndexes()
  }

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
      root = ""
    }
  })

  it("locks the schedule target to the selected dm thread by default", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        slug: "ceo",
        dna: "ceo0001",
        name: "CEO",
        title: "Chief Executive Officer",
        online: false,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:ceo",
        slug: "ceo",
        dna: "ceo0001",
        label: "CEO",
        online: false,
        typing: false,
      }],
    })
    tui.selectedThreadId = "agent:ceo"

    const handled = await tui.openSlashCommand("/schedule")

    expect(handled).toBe(true)
    expect(tui.composerMode).toBe("form")
    expect(tui.composerForm.target).toBe("agent:ceo")
    expect(tui.composerForm.targetLocked).toBe(true)
  })

  it("defaults /schedule from activity to the first agent in mention order", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [
        {
          slug: "alex",
          dna: "alex001",
          name: "Alex",
          title: "Developer",
          sort_order: 20,
          online: true,
          typing: false,
        },
        {
          slug: "jordan",
          dna: "jord001",
          name: "Jordan",
          title: "CEO",
          sort_order: 10,
          online: true,
          typing: false,
        },
      ],
      dmThreads: [
        {
          id: "agent:alex",
          slug: "alex",
          dna: "alex001",
          label: "Alex",
          online: true,
          typing: false,
          sort_order: 20,
        },
        {
          id: "agent:jordan",
          slug: "jordan",
          dna: "jord001",
          label: "Jordan",
          online: true,
          typing: false,
          sort_order: 10,
        },
      ],
    })
    tui.selectedThreadId = "activity"

    const handled = await tui.openSlashCommand("/schedule")

    expect(handled).toBe(true)
    expect(tui.composerForm.target).toBe("agent:jordan")
    expect(tui.composerForm.targetLocked).toBe(false)
    expect(tui.composerForm.recurrence).toBe("once")
  })

  it("treats /schedule text in activity as the initial message draft", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [
        {
          slug: "alex",
          dna: "alex001",
          name: "Alex",
          title: "Developer",
          sort_order: 20,
          online: true,
          typing: false,
        },
        {
          slug: "jordan",
          dna: "jord001",
          name: "Jordan",
          title: "CEO",
          sort_order: 10,
          online: true,
          typing: false,
        },
      ],
      dmThreads: [
        {
          id: "agent:alex",
          slug: "alex",
          dna: "alex001",
          label: "Alex",
          online: true,
          typing: false,
          sort_order: 20,
        },
        {
          id: "agent:jordan",
          slug: "jordan",
          dna: "jord001",
          label: "Jordan",
          online: true,
          typing: false,
          sort_order: 10,
        },
      ],
    })
    tui.selectedThreadId = "activity"

    const result = executeSlashCommand("/schedule Check in on blockers", { selectedThreadId: "activity" }, BUILTIN_WORKSPACE_APPS)
    expect(result).toMatchObject({
      kind: "open-form",
      form: "schedule",
      message: "Check in on blockers",
      targetLocked: false,
    })

    const handled = await tui.openSlashCommand("/schedule Check in on blockers")

    expect(handled).toBe(true)
    expect(tui.composerForm.target).toBe("agent:jordan")
    expect(tui.composerForm.targetLocked).toBe(false)
    expect(tui.composerForm.message).toBe("Check in on blockers")
  })

  it("creates a scheduled message from the /schedule form", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        slug: "ceo",
        dna: "ceo0001",
        name: "CEO",
        title: "Chief Executive Officer",
        online: false,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:ceo",
        slug: "ceo",
        dna: "ceo0001",
        label: "CEO",
        online: false,
        typing: false,
      }],
    })

    const result = executeSlashCommand("/schedule agent:ceo", { selectedThreadId: "activity" }, BUILTIN_WORKSPACE_APPS)
    expect(result).toMatchObject({
      kind: "open-form",
      form: "schedule",
      target: "agent:ceo",
      targetLocked: false,
    })

    await tui.openSlashCommand("/schedule agent:ceo")
    tui.composerForm.message = "Check in on the team and share blockers."
    tui.composerForm.recurrence = "weekly"
    tui.composerForm.weekday = "mon"
    tui.composerForm.time = "09:00"
    tui.composerForm.timezone = "UTC"
    await tui.submitComposerForm()

    const schedules = getAllScheduledMessages(root)
    expect(schedules).toHaveLength(1)
    expect(schedules[0]).toMatchObject({
      target: "agent:ceo",
      text: "Check in on the team and share blockers.",
      recurrence: "weekly",
      weekday: "mon",
      time: "09:00",
      timezone: "UTC",
    })
    expect(tui.composerMode).toBe("text")
    expect(tui.statusMessage).toContain("Scheduled weekly on Mon at 09:00 UTC -> CEO.")
  })

  it("prefills the schedule form from /schedule target message drafts", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        slug: "jordan",
        dna: "jord001",
        name: "Jordan",
        title: "CEO",
        online: true,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:jordan",
        slug: "jordan",
        dna: "jord001",
        label: "Jordan",
        online: true,
        typing: false,
      }],
    })
    tui.selectedThreadId = "activity"

    const handled = await tui.openSlashCommand("/schedule @Jordan Check in on blockers")

    expect(handled).toBe(true)
    expect(tui.composerForm.target).toBe("agent:jordan")
    expect(tui.composerForm.message).toBe("Check in on blockers")
  })

  it("hides disabled request/task/calendar tabs but keeps messaging enabled", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    updateWorkspaceApps({
      defaults: {
        messaging: false,
        requests: false,
        task: false,
        calendar: false,
      },
    }, root)

    const tui = new WorkspaceTui(root) as any

    expect(tui.enabledApps.messaging).toBe(true)
    expect(tui.tabViews()).toEqual(["messages"])
  })

  it("enters time editing explicitly before using segmented arrow controls", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        slug: "ceo",
        dna: "ceo0001",
        name: "CEO",
        title: "Chief Executive Officer",
        online: true,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:ceo",
        slug: "ceo",
        dna: "ceo0001",
        label: "CEO",
        online: true,
        typing: false,
      }],
    })

    await tui.openSlashCommand("/schedule agent:ceo")
    tui.composerForm.selectedFieldIndex = 4

    await tui.handleComposerFormInput("\u001b[B", false)
    expect(tui.composerForm.selectedFieldIndex).toBe(5)

    tui.composerForm.selectedFieldIndex = 4
    await tui.handleComposerFormInput("\r", false)
    expect(tui.composerForm.timeEditing).toBe(true)

    await tui.handleComposerFormInput("\u001b[C", false)
    await tui.handleComposerFormInput("\u001b[A", false)
    await tui.handleComposerFormInput("\u001b[1;2A", false)

    expect(tui.composerForm.timeSegment).toBe("minute")
    expect(tui.composerForm.time).toBe("09:11")

    await tui.handleComposerFormInput("\r", false)
    expect(tui.composerForm.timeEditing).toBe(false)

    await tui.handleComposerFormInput("\u001b[B", false)
    expect(tui.composerForm.selectedFieldIndex).toBe(5)
  })

  it("filters timezone search results and selects a timezone with enter", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        slug: "ceo",
        dna: "ceo0001",
        name: "CEO",
        title: "Chief Executive Officer",
        online: true,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:ceo",
        slug: "ceo",
        dna: "ceo0001",
        label: "CEO",
        online: true,
        typing: false,
      }],
    })

    await tui.openSlashCommand("/schedule agent:ceo")
    tui.composerForm.selectedFieldIndex = 5
    tui.composerForm.timezone = "UTC"

    await tui.handleComposerFormInput("\r", false)
    await tui.handleComposerFormInput("oslo", false)
    expect(tui.composerForm.search.timezone?.query).toBe("oslo")

    await tui.handleComposerFormInput("\r", false)

    expect(tui.composerForm.timezone).toBe("Europe/Oslo")
    expect(tui.composerForm.search.timezone?.query).toBe("")
    expect(tui.composerForm.selectedFieldIndex).toBe(6)
  })

  it("supports hourly recurrence in the schedule form", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        slug: "ceo",
        dna: "ceo0001",
        name: "CEO",
        title: "Chief Executive Officer",
        online: true,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:ceo",
        slug: "ceo",
        dna: "ceo0001",
        label: "CEO",
        online: true,
        typing: false,
      }],
    })

    await tui.openSlashCommand("/schedule agent:ceo")
    tui.composerForm.message = "Run the hourly status check."
    tui.composerForm.recurrence = "hourly"
    tui.composerForm.time = "00:15"
    await tui.submitComposerForm()

    const schedules = getAllScheduledMessages(root)
    expect(schedules[0]).toMatchObject({
      recurrence: "hourly",
      time: "00:15",
    })
    expect(tui.statusMessage).toContain("Scheduled hourly at :15")
  })

  it("shows slash command suggestions and accepts them like mentions", async () => {
    root = mkdtempSync(join(tmpdir(), "termlings-slash-command-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui)
    tui.view = "messages"
    tui.selectedThreadId = "activity"
    tui.draft = "/"
    tui.draftCursorIndex = 1

    const menu = tui.getSlashCommandMenuState()
    expect(menu?.candidates.map((candidate: any) => candidate.insertText)).toEqual(["/schedule"])

    await tui.handleInput("\r")

    expect(tui.draft).toBe("/schedule ")
  })
})
