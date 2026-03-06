import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { WorkspaceTui } from "../tui.js"
import { truncateAnsi } from "../ui.js"

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
})
