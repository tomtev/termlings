import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { sendMessage } from "../messaging-util.js"
import { readMessages, readQueuedMessages, updateDirs } from "../ipc.js"
import { getDmMessages, upsertSession } from "../../workspace/state.js"

function writeSoul(
  root: string,
  slug: string,
  opts: { name: string; dna: string; title?: string; titleShort?: string },
): void {
  const dir = join(root, ".termlings", "agents", slug)
  mkdirSync(dir, { recursive: true })
  const titleLine = opts.title ? `title: ${opts.title}\n` : ""
  const titleShortLine = opts.titleShort ? `title_short: ${opts.titleShort}\n` : ""
  writeFileSync(
    join(dir, "SOUL.md"),
    `---\nname: ${opts.name}\n${titleLine}${titleShortLine}dna: ${opts.dna}\n---\n`,
    "utf8",
  )
}

describe("message delivery paths", () => {
  const originalCwd = process.cwd()
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-message-test-"))
    process.chdir(root)
    updateDirs()
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.chdir(originalCwd)
    updateDirs()
    rmSync(root, { recursive: true, force: true })
  })

  it("writes live session mailboxes under message-queue", async () => {
    writeSoul(root, "dev-pagefun", { name: "Alex", dna: "08c883a" })
    upsertSession("tl-alex", {
      name: "Alex",
      dna: "08c883a",
    }, root)

    await sendMessage("agent:alex", "hello", "tl-river", "River", "03b00ce")

    const mailbox = join(root, ".termlings", "message-queue", "tl-alex.msg.json")
    expect(existsSync(mailbox)).toBe(true)
    expect(existsSync(join(root, ".termlings", "tl-alex.msg.json"))).toBe(false)

    const messages = readMessages("tl-alex")
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      from: "tl-river",
      fromName: "River",
      text: "hello",
    })
    expect(existsSync(mailbox)).toBe(false)
  })

  it("queues offline agent messages under the canonical slug even when addressed by display name", async () => {
    writeSoul(root, "dev-pagefun", { name: "Alex", dna: "08c883a", title: "Lead Developer" })

    await sendMessage("agent:alex", "status update", "tl-river", "River", "03b00ce")

    const canonicalQueue = join(root, ".termlings", "message-queue", "dev-pagefun.queue.jsonl")
    const legacyQueue = join(root, ".termlings", "message-queue", "alex.queue.jsonl")
    expect(existsSync(canonicalQueue)).toBe(true)
    expect(existsSync(legacyQueue)).toBe(false)

    const queued = readQueuedMessages("dev-pagefun")
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      from: "tl-river",
      fromName: "River",
      text: "status update",
      fromDna: "03b00ce",
    })

    const thread = getDmMessages("agent:dev-pagefun", root)
    expect(thread).toHaveLength(1)
    expect(thread[0]?.target).toBe("agent:dev-pagefun")
  })

  it("repairs legacy display-name queue files to the agent slug before delivery", () => {
    writeSoul(root, "dev-pagefun", { name: "Alex", dna: "08c883a" })
    const queueDir = join(root, ".termlings", "message-queue")
    mkdirSync(queueDir, { recursive: true })
    writeFileSync(
      join(queueDir, "alex.queue.jsonl"),
      '{"from":"tl-river","fromName":"River","text":"legacy","ts":1,"fromDna":"03b00ce"}\n',
      "utf8",
    )

    const queued = readQueuedMessages("dev-pagefun")
    expect(queued).toHaveLength(1)
    expect(queued[0]?.text).toBe("legacy")
    expect(existsSync(join(queueDir, "alex.queue.jsonl"))).toBe(false)
  })
})
