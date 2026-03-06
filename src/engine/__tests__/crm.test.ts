import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  addCrmLink,
  addCrmNote,
  archiveCrmRecord,
  createCrmRecord,
  getCrmRecord,
  getCrmTimeline,
  listCrmRecords,
  restoreCrmRecord,
  setCrmFollowup,
  setCrmRecordValue,
  unsetCrmRecordValue,
} from "../crm.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("crm storage", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-crm-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("creates canonical crm directories during workspace setup", () => {
    ensureWorkspaceDirs(root)
    expect(existsSync(join(root, ".termlings", "store", "crm", "records"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "crm", "activity"))).toBe(true)
  })

  it("stores records in per-type files and writes append-only timeline entries", () => {
    const org = createCrmRecord("org", "Acme", {
      owner: "agent:growth",
      stage: "lead",
      tags: ["warm", "b2b"],
      attrs: { domain: "acme.com" },
    }, { by: "human:default", byName: "Owner" }, root)

    const person = createCrmRecord("person", "Jane Doe", {
      attrs: { email: "jane@acme.com" },
    }, { by: "agent:growth", byName: "Growth" }, root)

    expect(org.ref).toBe("org/acme")
    expect(person.ref).toBe("person/jane-doe")
    expect(existsSync(join(root, ".termlings", "store", "crm", "records", "org", "acme.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "crm", "records", "person", "jane-doe.json"))).toBe(true)

    const timeline = getCrmTimeline(org.ref, root)
    expect(timeline).toHaveLength(1)
    expect(timeline[0]?.kind).toBe("create")

    const stored = JSON.parse(readFileSync(join(root, ".termlings", "store", "crm", "records", "org", "acme.json"), "utf8")) as Record<string, unknown>
    expect(stored.ref).toBe("org/acme")
    expect(stored.owner).toBe("agent:growth")
  })

  it("updates nested attrs, links, follow-ups, archive state, and timeline history", () => {
    const org = createCrmRecord("org", "Acme", {}, { by: "agent:growth", byName: "Growth" }, root)
    const person = createCrmRecord("person", "Jane Doe", {}, { by: "agent:growth", byName: "Growth" }, root)

    const setResult = setCrmRecordValue(org.ref, "attrs.company.size", 50, { by: "agent:growth", byName: "Growth" }, root)
    expect(setResult?.changed).toBe(true)
    expect(getCrmRecord(org.ref, root)?.attrs).toEqual({ company: { size: 50 } })

    const noteResult = addCrmNote(org.ref, "Warm intro from Nora", { by: "agent:growth", byName: "Growth" }, root)
    expect(noteResult?.changed).toBe(true)

    const linkResult = addCrmLink(person.ref, "works_at", org.ref, { by: "agent:growth", byName: "Growth" }, root)
    expect(linkResult?.changed).toBe(true)
    expect(getCrmRecord(person.ref, root)?.links[0]).toMatchObject({
      rel: "works-at",
      to: "org/acme",
    })

    const followupAt = Date.now() + 60_000
    const followupResult = setCrmFollowup(org.ref, {
      at: followupAt,
      text: "Send pricing",
      owner: "agent:growth",
    }, { by: "agent:growth", byName: "Growth" }, root)
    expect(followupResult?.changed).toBe(true)
    expect(getCrmRecord(org.ref, root)?.next).toMatchObject({
      at: followupAt,
      text: "Send pricing",
      owner: "agent:growth",
    })

    const archiveResult = archiveCrmRecord(org.ref, { by: "agent:growth", byName: "Growth" }, root)
    expect(archiveResult?.changed).toBe(true)
    expect(typeof getCrmRecord(org.ref, root)?.archivedAt).toBe("number")

    const restoreResult = restoreCrmRecord(org.ref, { by: "agent:growth", byName: "Growth" }, root)
    expect(restoreResult?.changed).toBe(true)
    expect(getCrmRecord(org.ref, root)?.archivedAt).toBeUndefined()

    const unsetResult = unsetCrmRecordValue(org.ref, "attrs.company.size", { by: "agent:growth", byName: "Growth" }, root)
    expect(unsetResult?.changed).toBe(true)
    expect(getCrmRecord(org.ref, root)?.attrs).toEqual({})

    const timeline = getCrmTimeline(org.ref, root)
    expect(timeline.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["create", "field", "note", "followup", "archive", "restore"]),
    )
  })

  it("filters active vs archived records and due follow-ups", () => {
    const due = createCrmRecord("org", "Due Co", {
      stage: "lead",
      next: {
        at: Date.now() - 5_000,
        text: "Reply today",
      },
    }, { by: "agent:growth", byName: "Growth" }, root)

    const later = createCrmRecord("org", "Later Co", {
      stage: "lead",
      next: {
        at: Date.now() + 86_400_000,
        text: "Check in tomorrow",
      },
    }, { by: "agent:growth", byName: "Growth" }, root)

    archiveCrmRecord(later.ref, { by: "agent:growth", byName: "Growth" }, root)

    expect(listCrmRecords({ type: "org" }, root).map((record) => record.ref)).toEqual(["org/due-co"])
    expect(listCrmRecords({ archived: "only" }, root).map((record) => record.ref)).toEqual(["org/later-co"])
    expect(listCrmRecords({ dueOnly: true }, root).map((record) => record.ref)).toEqual(["org/due-co"])
    expect(listCrmRecords({ archived: "include", stage: "lead" }, root).map((record) => record.ref)).toEqual([
      due.ref,
      later.ref,
    ])
  })
})
