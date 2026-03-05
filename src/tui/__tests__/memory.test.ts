import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { WorkspaceTui } from "../tui.js"

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

  it("keeps browser activity ids stable as history grows", () => {
    const tui = new WorkspaceTui(root) as any
    const historyPath = join(root, ".termlings", "browser", "history", "all.jsonl")
    mkdirSync(join(root, ".termlings", "browser", "history"), { recursive: true })

    writeFileSync(
      historyPath,
      [
        JSON.stringify({ ts: 10, agentSlug: "developer", command: "navigate", args: ["https://one.test"], result: "success" }),
        JSON.stringify({ ts: 20, agentSlug: "developer", command: "navigate", args: ["https://two.test"], result: "success" }),
        "",
      ].join("\n"),
      "utf8",
    )

    const first = tui.readBrowserActivityMessages(10)
    const firstByText = new Map(first.map((message: any) => [message.text, message.id]))

    appendFileSync(
      historyPath,
      JSON.stringify({ ts: 30, agentSlug: "developer", command: "navigate", args: ["https://three.test"], result: "success" }) + "\n",
      "utf8",
    )

    const second = tui.readBrowserActivityMessages(10)
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
})
