import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { WorkspaceTui } from "../tui.js"
import { ANSI_RESET, BG_INPUT_PANEL, FG_COMMAND_TOKEN, FG_CURSOR_BLOCK, FG_INPUT, FG_PLACEHOLDER, FG_SELECTED, FG_SUBTLE_HINT, truncateAnsi } from "../ui.js"

describe("workspace tui render hot paths", () => {
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
    vi.restoreAllMocks()
    if (root) {
      rmSync(root, { recursive: true, force: true })
      root = ""
    }
  })

  it("keeps ansi truncation behavior while preserving reset codes", () => {
    const styled = "\x1b[31mhello\x1b[0m world"

    expect(truncateAnsi(styled, 0)).toBe("")
    expect(truncateAnsi(styled, 5)).toBe("\x1b[31mhello\x1b[0m")
    expect(truncateAnsi(styled, 8)).toBe("\x1b[31mhello\x1b[0m wo\x1b[0m")
  })

  it("skips animation renders when the ui is idle", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    const renderSpy = vi.fn()
    tui.render = renderSpy
    setSnapshot(tui)

    tui.tickAnimationFrame(1_000)

    expect(renderSpy).not.toHaveBeenCalled()
    expect(tui.cursorBlinkVisible).toBe(true)
  })

  it("renders animation frames only while ui motion is active", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    const renderSpy = vi.fn()
    tui.render = renderSpy
    setSnapshot(tui, {
      agents: [{
        dna: "abc1234",
        name: "Developer",
        online: true,
        typing: true,
      }],
    })

    tui.tickAnimationFrame(1_000)

    expect(renderSpy).toHaveBeenCalledTimes(1)
    expect(tui.cursorBlinkVisible).toBe(false)
  })

  it("animates speaking avatars instead of rendering a static frame", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        dna: "abc1234",
        name: "Developer",
        online: true,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:abc1234",
        dna: "abc1234",
        label: "Developer",
        online: true,
        typing: false,
      }],
    })
    tui.talkUntilByDna.set("abc1234", 2_000)

    const nowSpy = vi.spyOn(Date, "now")
    nowSpy.mockReturnValue(0)
    const first = tui.renderAvatarStrip(80).join("\n")

    nowSpy.mockReturnValue(500)
    const second = tui.renderAvatarStrip(80).join("\n")

    expect(first).not.toBe(second)
  })

  it("keeps the selected request visible within the requests viewport", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    const requests = Array.from({ length: 6 }, (_, index) => ({
      id: `req-${index}`,
      type: "env",
      status: "pending",
      from: "tl-dev-1",
      fromName: "Developer",
      fromSlug: "developer",
      fromDna: "abc1234",
      ts: index + 1,
      varName: `KEY_${index}`,
      reason: "Need a long explanation so each request card consumes multiple wrapped rows in the viewport.",
      envScope: "project",
    }))

    setSnapshot(tui, {
      requests,
      agents: [{
        dna: "abc1234",
        slug: "developer",
        name: "Developer",
        online: true,
        typing: false,
      }],
    })
    tui.view = "requests"
    tui.requestSelectionIndex = 5

    const lines = tui.renderRequestsView(16, 52)
    const output = lines.join("\n")

    expect(lines).toHaveLength(16)
    expect(output).toContain("KEY_5")
    expect(output).not.toContain("KEY_0")
    expect(tui.requestScrollOffset).toBeGreaterThan(0)
  })

  it("reuses cached message layout across identical renders", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    const messages = [
      {
        id: "msg-1",
        ts: 1,
        kind: "chat",
        channel: "workspace",
        from: "human:default",
        fromName: "Owner",
        text: "First message",
      },
      {
        id: "msg-2",
        ts: 2,
        kind: "chat",
        channel: "workspace",
        from: "human:default",
        fromName: "Owner",
        text: "Second message",
      },
    ]

    setSnapshot(tui, { messages })
    tui.messageWindow = {
      threadId: "activity",
      messages,
      limit: 120,
      hasOlder: false,
    }

    const renderCardSpy = vi.spyOn(tui, "renderMessageCard")

    tui.renderMessagesView(12, 60)
    expect(renderCardSpy).toHaveBeenCalledTimes(2)

    tui.renderMessagesView(12, 60)
    expect(renderCardSpy).toHaveBeenCalledTimes(2)
  })

  it("keeps the composer form background after inline color resets", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    tui.composerMode = "form"
    tui.composerForm = {
      kind: "schedule",
      threadId: "activity",
      target: "",
      targetLocked: false,
      message: "",
      recurrence: "daily",
      date: "2026-03-06",
      weekday: "mon",
      time: "09:00",
      timezone: "Europe/Oslo",
      selectedFieldIndex: 0,
    }

    const lines = tui.renderComposerFormLines(80)
    expect(lines[0]).toContain(`${BG_INPUT_PANEL}${FG_INPUT}`)
    expect(lines[0]).toContain(`${FG_SELECTED}/schedule${FG_INPUT}`)
    expect(lines[0]).toContain(`${ANSI_RESET}${BG_INPUT_PANEL}${FG_INPUT}`)
  })

  it("renders selected choice fields as left-right pickers instead of text cursors", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    tui.composerMode = "form"
    tui.composerForm = {
      kind: "schedule",
      threadId: "activity",
      target: "agent:ceo",
      targetLocked: false,
      message: "Check in",
      recurrence: "daily",
      date: "2026-03-06",
      weekday: "mon",
      time: "09:00",
      timezone: "Europe/Oslo",
      selectedFieldIndex: 2,
    }

    const lines = tui.renderComposerFormLines(80).join("\n")
    expect(lines).toContain(`Recurrence: ${FG_SUBTLE_HINT}←${ANSI_RESET}${BG_INPUT_PANEL}${FG_INPUT} daily ${FG_SUBTLE_HINT}→`)
    expect(lines).not.toContain("Recurrence: daily█")
  })

  it("renders timezone as an explicit searchable field and the create action in blue", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    tui.composerMode = "form"
    tui.composerForm = {
      kind: "schedule",
      threadId: "activity",
      target: "agent:ceo",
      targetLocked: false,
      message: "Check in",
      recurrence: "daily",
      date: "2026-03-06",
      weekday: "mon",
      time: "09:00",
      timezone: "Europe/Oslo",
      timeSegment: "hour",
      search: {
        timezone: {
          open: true,
          query: "oslo",
          selectionIndex: 0,
        },
      },
      selectedFieldIndex: 4,
    }

    const lines = tui.renderComposerFormLines(80).join("\n")
    expect(lines).toContain("Timezone:")
    expect(lines).toContain("oslo")
    expect(lines).toContain("Europe/Oslo")
    expect(lines).toContain("GMT")
    expect(lines).toContain("\x1b[38;5;75m[Create schedule]")
  })

  it("shows the default-target hint on bare /schedule drafts in all activity", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    tui.view = "messages"
    tui.selectedThreadId = "activity"
    tui.draft = "/schedule "
    tui.draftCursorIndex = tui.draft.length

    const lines = tui.renderComposerLines(80, tui.draft, false, tui.composerGhostHint()).join("\n")
    expect(lines).toContain(`${FG_COMMAND_TOKEN}/schedule`)
    expect(lines).toContain("Scheduled message. Defaults to the first agent.")
  })

  it("shows a scheduled-message hint after a /schedule target is present", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    tui.view = "messages"
    tui.selectedThreadId = "activity"
    tui.draft = "/schedule @Jordan "
    tui.draftCursorIndex = tui.draft.length

    const lines = tui.renderComposerLines(80, tui.draft, false, tui.composerGhostHint()).join("\n")
    expect(lines).toContain(`${FG_COMMAND_TOKEN}/schedule`)
    expect(lines).toContain("@Jordan")
    expect(lines).toContain("Scheduled message. Press Enter for details.")
  })

  it("shows the schedule target identity instead of the raw thread id", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    setSnapshot(tui, {
      agents: [{
        dna: "abc1234",
        slug: "ceo",
        name: "Jordan",
        title: "Chief Executive Officer",
        title_short: "CEO",
        online: true,
        typing: false,
      }],
      dmThreads: [{
        id: "agent:ceo",
        dna: "abc1234",
        slug: "ceo",
        label: "Jordan",
        online: true,
        typing: false,
      }],
    })
    tui.composerMode = "form"
    tui.composerForm = {
      kind: "schedule",
      threadId: "agent:ceo",
      target: "agent:ceo",
      targetLocked: true,
      message: "",
      recurrence: "daily",
      date: "2026-03-06",
      weekday: "mon",
      time: "09:00",
      timezone: "Europe/Oslo",
      selectedFieldIndex: 1,
    }

    const lines = tui.renderComposerFormLines(80).join("\n")
    expect(lines).toContain("To (thread):")
    expect(lines).toContain("Jordan")
    expect(lines).toContain("CEO")
    expect(lines).not.toContain("agent:ceo")
    expect(lines).toContain("Tip: you can also ask an agent to set up message schedules for you.")
  })

  it("renders empty text form fields as muted placeholders with a leading cursor", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-render-test-"))
    const tui = new WorkspaceTui(root) as any
    tui.composerMode = "form"
    tui.composerForm = {
      kind: "schedule",
      threadId: "activity",
      target: "agent:ceo",
      targetLocked: false,
      message: "",
      recurrence: "daily",
      date: "2026-03-06",
      weekday: "mon",
      time: "09:00",
      timezone: "Europe/Oslo",
      selectedFieldIndex: 1,
    }

    const lines = tui.renderComposerFormLines(80).join("\n")
    expect(lines).toContain(`Message: ${FG_CURSOR_BLOCK}█${FG_PLACEHOLDER}<Message to send>${FG_INPUT}`)
    expect(lines).not.toContain("<Message to send>█")
  })
})
