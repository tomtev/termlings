import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  acceptBrowserTabInvite,
  createBrowserTabInvite,
  findJoinedBrowserTabInviteForCurrentIdentity,
  leaveBrowserTabInvite,
  listRelevantBrowserTabInvites,
} from "../browser-invites.js"

function writeAgent(root: string, slug: string, name: string, dna: string, title: string): void {
  const dir = join(root, ".termlings", "agents", slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "SOUL.md"),
    [
      "---",
      `name: ${name}`,
      `title: ${title}`,
      `dna: ${dna}`,
      "---",
      "",
    ].join("\n"),
    "utf8",
  )
}

describe("browser tab invites", () => {
  const originalEnv = {
    ipcDir: process.env.TERMLINGS_IPC_DIR,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
  }

  let root = ""
  let previousCwd = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-browser-invites-test-"))
    previousCwd = process.cwd()
    process.chdir(root)
    mkdirSync(join(root, ".termlings", "browser"), { recursive: true })
    writeAgent(root, "pm", "Jordan", "0a3f201", "PM")
    writeAgent(root, "designer", "Rogue", "f0c0a11", "Design")
    process.env.TERMLINGS_IPC_DIR = join(root, ".termlings")
    process.env.TERMLINGS_SESSION_ID = "tl-pm"
    process.env.TERMLINGS_AGENT_SLUG = "pm"
    process.env.TERMLINGS_AGENT_NAME = "Jordan"
    process.env.TERMLINGS_AGENT_DNA = "0a3f201"
  })

  afterEach(() => {
    process.chdir(previousCwd)
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

  it("creates, accepts, and leaves browser tab invites", () => {
    const invite = createBrowserTabInvite({
      target: "agent:designer",
      tabId: "tab-foreign",
      tabTitle: "Design Review",
      tabUrl: "https://example.com/review",
      note: "Need a second opinion",
    }, root)

    expect(invite.target).toBe("agent:designer")
    expect(invite.targetAgentSlug).toBe("designer")
    expect(invite.status).toBe("pending")
    expect(listRelevantBrowserTabInvites(root).map((entry) => entry.id)).toContain(invite.id)

    process.env.TERMLINGS_SESSION_ID = "tl-design"
    process.env.TERMLINGS_AGENT_SLUG = "designer"
    process.env.TERMLINGS_AGENT_NAME = "Rogue"
    process.env.TERMLINGS_AGENT_DNA = "f0c0a11"

    const accepted = acceptBrowserTabInvite(invite.id, root)
    expect(accepted.status).toBe("accepted")
    expect(accepted.acceptedBySessionId).toBe("tl-design")
    expect(findJoinedBrowserTabInviteForCurrentIdentity(undefined, root)?.id).toBe(invite.id)

    const left = leaveBrowserTabInvite(invite.id, root)
    expect(left.status).toBe("left")
    expect(findJoinedBrowserTabInviteForCurrentIdentity(undefined, root)).toBeNull()
  })
})
