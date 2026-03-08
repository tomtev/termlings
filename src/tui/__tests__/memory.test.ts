import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { WorkspaceTui } from "../tui.js"
import { appendWorkspaceMessage } from "../../workspace/state.js"
import { appendAppActivity } from "../../engine/activity.js"

describe("workspace tui memory guards", () => {
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-memory-test-"))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("prunes draft-only placeholder caches when draft content changes or clears", () => {
    const tui = new WorkspaceTui(root) as any

    tui.draft = "[Image #1] [Pasted Content #1 900 chars]"
    tui.imagePlaceholderByUrl.set("/tmp/active.png", "[Image #1]")
    tui.imageSourceByPlaceholder.set("[Image #1]", "/tmp/active.png")
    tui.imagePlaceholderByUrl.set("/tmp/stale.png", "[Image #2]")
    tui.imageSourceByPlaceholder.set("[Image #2]", "/tmp/stale.png")
    tui.pastedContentByPlaceholder.set("[Pasted Content #1 900 chars]", "a".repeat(900))
    tui.pastedContentByPlaceholder.set("[Pasted Content #2 900 chars]", "b".repeat(900))

    tui.syncMentionSelection()

    expect(Array.from(tui.imageSourceByPlaceholder.keys())).toEqual(["[Image #1]"])
    expect(Array.from(tui.pastedContentByPlaceholder.keys())).toEqual(["[Pasted Content #1 900 chars]"])

    tui.clearDraftInput()

    expect(tui.imageSourceByPlaceholder.size).toBe(0)
    expect(tui.imagePlaceholderByUrl.size).toBe(0)
    expect(tui.pastedContentByPlaceholder.size).toBe(0)
  })

  it("keeps app activity ids stable as history grows", () => {
    const tui = new WorkspaceTui(root) as any
    appendAppActivity({ ts: 10, app: "browser", kind: "navigate", text: "visited https://one.test", actorSlug: "developer" }, root)
    appendAppActivity({ ts: 20, app: "browser", kind: "navigate", text: "visited https://two.test", actorSlug: "developer" }, root)

    const first = tui.readAppActivityMessages(10)
    const firstByText = new Map(first.map((message: any) => [message.text, message.id]))

    appendAppActivity({ ts: 30, app: "browser", kind: "navigate", text: "visited https://three.test", actorSlug: "developer" }, root)

    const second = tui.readAppActivityMessages(10)
    const secondByText = new Map(second.map((message: any) => [message.text, message.id]))

    expect(secondByText.get("visited https://one.test")).toBe(firstByText.get("visited https://one.test"))
    expect(secondByText.get("visited https://two.test")).toBe(firstByText.get("visited https://two.test"))
  })

  it("prunes last-read state for threads that no longer exist", () => {
    const tui = new WorkspaceTui(root) as any
    tui.lastReadByThread.set("agent:keep", 1)
    tui.lastReadByThread.set("agent:drop", 2)

    tui.pruneLastReadThreadState([{ id: "agent:keep" }])

    expect(tui.lastReadByThread.has("agent:keep")).toBe(true)
    expect(tui.lastReadByThread.has("agent:drop")).toBe(false)
  })

  it("keeps only a bounded activity window until older history is explicitly loaded", async () => {
    for (let index = 0; index < 260; index += 1) {
      appendWorkspaceMessage(
        {
          id: `msg-${index}`,
          ts: index + 1,
          kind: "chat",
          channel: "workspace",
          from: "human:default",
          fromName: "Owner",
          text: `message ${index}`,
        },
        root,
      )
    }

    const tui = new WorkspaceTui(root) as any
    await tui.reloadSnapshot()

    expect(tui.messageWindow.threadId).toBe("activity")
    expect(tui.messageWindow.messages).toHaveLength(120)
    expect(tui.messageWindow.messages[0]?.id).toBe("msg-140")
    expect(tui.messageWindow.hasOlder).toBe(true)

    tui.messageScrollOffset = tui.messageScrollMax
    await tui.handleInput("\u001b[5~")

    expect(tui.messageWindow.messages).toHaveLength(240)
    expect(tui.messageWindow.messages[0]?.id).toBe("msg-20")
    expect(tui.messageWindow.hasOlder).toBe(true)

    tui.loadOlderMessages()
    expect(tui.messageWindow.messages).toHaveLength(260)
    expect(tui.messageWindow.messages[0]?.id).toBe("msg-0")
    expect(tui.messageWindow.hasOlder).toBe(false)
  })

  it("loads a DM thread directly from its own history instead of the global recent snapshot", () => {
    const devDna = "abc1234"
    const otherDna = "def5678"

    appendWorkspaceMessage(
      {
        id: "dm-out",
        ts: 1,
        kind: "dm",
        from: "human:default",
        fromName: "Owner",
        target: `agent:${devDna}`,
        targetDna: devDna,
        text: "outbound",
      },
      root,
    )
    appendWorkspaceMessage(
      {
        id: "dm-in",
        ts: 2,
        kind: "dm",
        from: "tl-dev-1",
        fromName: "Developer",
        fromDna: devDna,
        target: "human:default",
        text: "inbound",
      },
      root,
    )
    appendWorkspaceMessage(
      {
        id: "dm-other",
        ts: 3,
        kind: "dm",
        from: "tl-other-1",
        fromName: "Other",
        fromDna: otherDna,
        target: "human:default",
        text: "other",
      },
      root,
    )

    const tui = new WorkspaceTui(root) as any
    tui.snapshot.dmThreads = [{
      id: `agent:${devDna}`,
      dna: devDna,
      label: "Developer",
      online: true,
      typing: false,
    }]

    const loaded = tui.loadDmThreadWindow(`agent:${devDna}`, 10)
    expect(loaded.messages.map((message: any) => message.id)).toEqual(["dm-out", "dm-in"])
    expect(loaded.hasOlder).toBe(false)
  })

  it("merges per-thread app activity into an agent thread window", () => {
    const devDna = "abc1234"

    appendWorkspaceMessage(
      {
        id: "dm-in",
        ts: 2,
        kind: "dm",
        from: "tl-dev-1",
        fromName: "Developer",
        fromDna: devDna,
        target: "human:default",
        text: "inbound",
      },
      root,
    )
    appendAppActivity({
      ts: 3,
      app: "browser",
      kind: "click",
      text: "clicked button.publish",
      actorSlug: "developer",
      actorDna: devDna,
      threadId: "agent:developer",
      surface: "both",
    }, root)

    const tui = new WorkspaceTui(root) as any
    tui.snapshot.dmThreads = [{
      id: "agent:developer",
      dna: devDna,
      slug: "developer",
      label: "Developer",
      online: true,
      typing: false,
    }]
    tui.rebuildSnapshotIndexes()

    const loaded = tui.loadDmThreadWindow("agent:developer", 10)
    expect(loaded.messages.map((message: any) => message.text)).toEqual([
      "inbound",
      "clicked button.publish",
    ])
    expect(loaded.hasOlder).toBe(false)
  })
})
