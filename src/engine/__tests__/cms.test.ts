import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createCmsCollection,
  createCmsEntry,
  executeScheduledCmsPublishes,
  getCmsEntry,
  listCmsCollections,
  publishCmsEntry,
  readCmsHistory,
  scheduleCmsEntry,
  setCmsField,
  updateCmsBody,
} from "../cms.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("cms app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-cms-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
    ensureWorkspaceDirs(root)
    process.env.TERMLINGS_SESSION_ID = "tl-pm-1"
    process.env.TERMLINGS_AGENT_SLUG = "pm"
    process.env.TERMLINGS_AGENT_NAME = "Comet"
    process.env.TERMLINGS_AGENT_DNA = "20dfdf"
  })

  afterEach(() => {
    process.chdir(originalCwd)
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

  it("creates cms store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "cms", "entries"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "cms", "publish"))).toBe(true)
  })

  it("ships built-in collections and supports custom ones", () => {
    const collections = listCmsCollections(root)
    expect(collections.map((entry) => entry.id)).toEqual(expect.arrayContaining(["blog", "pages", "docs", "changelog"]))

    const custom = createCmsCollection({ id: "resources", title: "Resources" }, root)
    expect(custom.id).toBe("resources")
    expect(listCmsCollections(root).map((entry) => entry.id)).toContain("resources")
  })

  it("creates, updates, schedules, and publishes cms entries", () => {
    const entry = createCmsEntry({
      collection: "blog",
      title: "Launch Week Recap",
      slug: "launch-week-recap",
    }, root)

    const updatedBody = updateCmsBody(entry.id, "# Launch Week\n\nA strong start.", root)
    const updatedFields = setCmsField(updatedBody.id, "seo_title", "Launch Week Recap | Termlings", root)
    const scheduled = scheduleCmsEntry(updatedFields.id, "2099-03-10T09:00:00+01:00", root)

    expect(scheduled.status).toBe("scheduled")
    expect(scheduled.scheduledAt).toBeTypeOf("number")

    const published = publishCmsEntry(scheduled.id, root)
    expect(published.status).toBe("published")
    expect(published.outputPath).toBe(".termlings/store/cms/publish/blog/launch-week-recap.md")

    const markdownPath = join(root, ".termlings", "store", "cms", "publish", "blog", "launch-week-recap.md")
    const metadataPath = join(root, ".termlings", "store", "cms", "publish", "blog", "launch-week-recap.json")
    expect(existsSync(markdownPath)).toBe(true)
    expect(existsSync(metadataPath)).toBe(true)
    expect(readFileSync(markdownPath, "utf8")).toContain('title: "Launch Week Recap"')
    expect(readFileSync(markdownPath, "utf8")).toContain("# Launch Week")
    expect(readFileSync(markdownPath, "utf8")).toContain('seo_title: "Launch Week Recap | Termlings"')

    const persisted = getCmsEntry(entry.id, root)
    expect(persisted?.status).toBe("published")

    const history = readCmsHistory(20, root)
    expect(history.map((item) => item.status)).toEqual(expect.arrayContaining([
      "created",
      "updated",
      "scheduled",
      "published",
    ]))

    const activities = readRecentAppActivityEntries(20, root)
    expect(activities.map((entry) => entry.app)).toContain("cms")
    expect(activities.map((entry) => entry.kind)).toEqual(expect.arrayContaining([
      "entry.created",
      "entry.updated",
      "entry.scheduled",
      "entry.published",
    ]))
  })

  it("publishes due scheduled entries through the scheduler path", () => {
    const entry = createCmsEntry({
      collection: "docs",
      title: "API Notes",
      body: "Internal API notes",
    }, root)
    scheduleCmsEntry(entry.id, "2099-03-10T09:00:00+01:00", root)

    const persisted = getCmsEntry(entry.id, root)
    expect(persisted?.scheduledAt).toBeTypeOf("number")

    const results = executeScheduledCmsPublishes((persisted?.scheduledAt || Date.now()) + 1, root)
    expect(results).toHaveLength(1)
    expect(results[0]?.success).toBe(true)
    expect(results[0]?.collection).toBe("docs")
  })
})
