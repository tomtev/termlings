import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs"
import { join } from "path"

export type CrmActivityKind = "create" | "note" | "field" | "link" | "followup" | "archive" | "restore"
export type CrmActivityOp = "set" | "unset"

export interface CrmActor {
  by: string
  byName?: string
}

export interface CrmLink {
  rel: string
  to: string
  createdAt: number
  createdBy?: string
  createdByName?: string
}

export interface CrmNextAction {
  at?: number
  text?: string
  owner?: string
}

export interface CrmRecord {
  ref: string
  type: string
  slug: string
  name: string
  owner?: string
  status?: string
  stage?: string
  tags: string[]
  attrs: Record<string, unknown>
  links: CrmLink[]
  next?: CrmNextAction
  archivedAt?: number
  createdAt: number
  createdBy: string
  createdByName?: string
  updatedAt: number
  lastActivityAt: number
  version?: number
}

export interface CrmActivity {
  id: string
  ref: string
  kind: CrmActivityKind
  ts: number
  by: string
  byName?: string
  text?: string
  field?: string
  value?: unknown
  rel?: string
  to?: string
  op?: CrmActivityOp
}

export interface CrmCreateOptions {
  slug?: string
  owner?: string
  status?: string
  stage?: string
  tags?: string[]
  attrs?: Record<string, unknown>
  next?: CrmNextAction
}

export interface CrmListFilters {
  type?: string
  owner?: string
  status?: string
  stage?: string
  tags?: string[]
  query?: string
  archived?: "exclude" | "only" | "include"
  dueOnly?: boolean
  limit?: number
}

export interface CrmMutationOutcome {
  record: CrmRecord
  changed: boolean
}

interface CrmRecordSnapshot {
  record: CrmRecord
  raw: string
  filePath: string
}

interface CrmActivityDraft {
  kind: CrmActivityKind
  text?: string
  field?: string
  value?: unknown
  rel?: string
  to?: string
  op?: CrmActivityOp
}

const CRM_OCC_MAX_RETRIES = 6

function defaultActor(): CrmActor {
  return {
    by: "human:default",
    byName: "Owner",
  }
}

function crmRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "crm")
}

function crmRecordsRoot(root = process.cwd()): string {
  return join(crmRoot(root), "records")
}

function crmActivityRoot(root = process.cwd()): string {
  return join(crmRoot(root), "activity")
}

function recordTypeDir(type: string, root = process.cwd()): string {
  return join(crmRecordsRoot(root), type)
}

function activityTypeDir(type: string, root = process.cwd()): string {
  return join(crmActivityRoot(root), type)
}

function recordFilePath(type: string, slug: string, root = process.cwd()): string {
  return join(recordTypeDir(type, root), `${slug}.json`)
}

function activityFilePath(type: string, slug: string, root = process.cwd()): string {
  return join(activityTypeDir(type, root), `${slug}.jsonl`)
}

function ensureCrmDirs(root = process.cwd()): void {
  mkdirSync(crmRecordsRoot(root), { recursive: true })
  mkdirSync(crmActivityRoot(root), { recursive: true })
}

function ensureRecordDirs(type: string, root = process.cwd()): void {
  ensureCrmDirs(root)
  mkdirSync(recordTypeDir(type, root), { recursive: true })
  mkdirSync(activityTypeDir(type, root), { recursive: true })
}

function slugifySegment(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

function normalizeType(input: string): string {
  const value = slugifySegment(input)
  if (value.length > 0) return value.slice(0, 80)
  throw new Error("CRM record type is required")
}

function normalizeSlug(input: string): string {
  const value = slugifySegment(input)
  if (value.length > 0) return value.slice(0, 120)
  throw new Error("CRM record slug is required")
}

function cleanString(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined
  const value = input.trim()
  return value.length > 0 ? value : undefined
}

function ensurePlainObject(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return input as Record<string, unknown>
}

function cloneJson<T>(value: T): T {
  if (typeof value === "undefined") return value
  return JSON.parse(JSON.stringify(value)) as T
}

function comparable(value: unknown): string {
  return typeof value === "undefined" ? "undefined" : JSON.stringify(value)
}

function uniqueStrings(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of input) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function sanitizeTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return uniqueStrings(input.map((value) => cleanString(value) || "").filter(Boolean))
  }

  if (typeof input === "string") {
    return uniqueStrings(
      input
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  }

  return []
}

function cleanupObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "undefined") continue
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = cleanupObject(value as Record<string, unknown>)
      if (Object.keys(nested).length > 0) {
        output[key] = nested
      }
      continue
    }
    output[key] = cloneJson(value)
  }
  return output
}

function sanitizeNextAction(input: unknown): CrmNextAction | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined
  const value = input as Record<string, unknown>
  const at = typeof value.at === "number" && Number.isFinite(value.at) ? value.at : undefined
  const text = cleanString(value.text)
  const owner = cleanString(value.owner)
  if (typeof at === "undefined" && !text && !owner) return undefined
  return {
    at,
    text,
    owner,
  }
}

function sanitizeLinks(input: unknown): CrmLink[] {
  if (!Array.isArray(input)) return []
  const out: CrmLink[] = []
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const value = item as Record<string, unknown>
    const rel = cleanString(value.rel)
    const to = cleanString(value.to)
    if (!rel || !to) continue
    out.push({
      rel,
      to,
      createdAt: typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : 0,
      createdBy: cleanString(value.createdBy),
      createdByName: cleanString(value.createdByName),
    })
  }
  return out
}

function sanitizeRecord(
  raw: unknown,
  fallback: { type: string; slug: string; ref: string },
): CrmRecord {
  const input = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const createdAt = typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
    ? input.createdAt
    : 0
  const updatedAt = typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt)
    ? input.updatedAt
    : createdAt
  const lastActivityAt = typeof input.lastActivityAt === "number" && Number.isFinite(input.lastActivityAt)
    ? input.lastActivityAt
    : updatedAt
  const type = cleanString(input.type) || fallback.type
  const slug = cleanString(input.slug) || fallback.slug
  const ref = cleanString(input.ref) || `${type}/${slug}`
  const attrsInput = input.attrs && typeof input.attrs === "object" && !Array.isArray(input.attrs)
    ? input.attrs as Record<string, unknown>
    : {}

  return {
    ref,
    type,
    slug,
    name: cleanString(input.name) || slug,
    owner: cleanString(input.owner),
    status: cleanString(input.status),
    stage: cleanString(input.stage),
    tags: sanitizeTags(input.tags),
    attrs: cleanupObject(attrsInput),
    links: sanitizeLinks(input.links),
    next: sanitizeNextAction(input.next),
    archivedAt: typeof input.archivedAt === "number" && Number.isFinite(input.archivedAt) ? input.archivedAt : undefined,
    createdAt,
    createdBy: cleanString(input.createdBy) || "human:default",
    createdByName: cleanString(input.createdByName),
    updatedAt,
    lastActivityAt,
    version: typeof input.version === "number" && Number.isFinite(input.version) ? input.version : 1,
  }
}

function sanitizeActivity(raw: unknown, fallback: { ref: string }): CrmActivity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>
  const kind = input.kind
  if (
    kind !== "create" &&
    kind !== "note" &&
    kind !== "field" &&
    kind !== "link" &&
    kind !== "followup" &&
    kind !== "archive" &&
    kind !== "restore"
  ) {
    return null
  }

  return {
    id: cleanString(input.id) || `activity_${Date.now()}`,
    ref: cleanString(input.ref) || fallback.ref,
    kind,
    ts: typeof input.ts === "number" && Number.isFinite(input.ts) ? input.ts : 0,
    by: cleanString(input.by) || "human:default",
    byName: cleanString(input.byName),
    text: cleanString(input.text),
    field: cleanString(input.field),
    value: cloneJson(input.value),
    rel: cleanString(input.rel),
    to: cleanString(input.to),
    op: input.op === "set" || input.op === "unset" ? input.op : undefined,
  }
}

function cloneRecord(record: CrmRecord): CrmRecord {
  return {
    ...record,
    tags: [...record.tags],
    attrs: cloneJson(record.attrs),
    links: record.links.map((link) => ({ ...link })),
    next: record.next ? { ...record.next } : undefined,
  }
}

function parseRef(input: string): { type: string; slug: string; ref: string } {
  const raw = (input || "").trim()
  const slash = raw.indexOf("/")
  if (slash <= 0 || slash === raw.length - 1) {
    throw new Error(`Invalid CRM ref: ${input}`)
  }
  const type = normalizeType(raw.slice(0, slash))
  const slug = normalizeSlug(raw.slice(slash + 1))
  return { type, slug, ref: `${type}/${slug}` }
}

function readRecordSnapshot(ref: string, root = process.cwd()): CrmRecordSnapshot | null {
  const parsed = parseRef(ref)
  const filePath = recordFilePath(parsed.type, parsed.slug, root)
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, "utf8")
    const parsedJson = raw.trim().length > 0 ? JSON.parse(raw) : {}
    return {
      record: sanitizeRecord(parsedJson, parsed),
      raw,
      filePath,
    }
  } catch (error) {
    console.error(`Error reading CRM record ${parsed.ref}: ${error}`)
    return null
  }
}

function tryWriteRecord(filePath: string, record: CrmRecord, expectedRaw: string): boolean {
  let currentRaw = ""
  if (existsSync(filePath)) {
    try {
      currentRaw = readFileSync(filePath, "utf8")
    } catch {
      return false
    }
  }

  if (currentRaw !== expectedRaw) {
    return false
  }

  writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n")
  return true
}

function makeActivityId(): string {
  return `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function appendActivities(ref: string, drafts: CrmActivityDraft[], actor: CrmActor, ts: number, root = process.cwd()): void {
  if (drafts.length <= 0) return

  const parsed = parseRef(ref)
  ensureRecordDirs(parsed.type, root)
  const path = activityFilePath(parsed.type, parsed.slug, root)
  const payload = drafts.map((draft) => JSON.stringify({
    id: makeActivityId(),
    ref,
    kind: draft.kind,
    ts,
    by: actor.by,
    byName: actor.byName,
    text: draft.text,
    field: draft.field,
    value: draft.value,
    rel: draft.rel,
    to: draft.to,
    op: draft.op,
  })).join("\n")
  appendFileSync(path, `${payload}\n`)
}

function bumpVersion(current?: number): number {
  return typeof current === "number" && Number.isFinite(current) ? current + 1 : 2
}

function mutateRecordWithRetry(
  ref: string,
  actor: CrmActor,
  mutator: (record: CrmRecord) => { changed: boolean; activities?: CrmActivityDraft[] },
  root = process.cwd(),
): CrmMutationOutcome | null {
  const resolvedActor = actor.by ? actor : defaultActor()

  for (let attempt = 0; attempt < CRM_OCC_MAX_RETRIES; attempt += 1) {
    const snapshot = readRecordSnapshot(ref, root)
    if (!snapshot) return null

    const working = cloneRecord(snapshot.record)
    const result = mutator(working)
    if (!result.changed) {
      return {
        record: snapshot.record,
        changed: false,
      }
    }

    const now = Date.now()
    working.updatedAt = now
    working.lastActivityAt = now
    working.version = bumpVersion(working.version)

    if (!tryWriteRecord(snapshot.filePath, working, snapshot.raw)) {
      continue
    }

    appendActivities(ref, result.activities || [], resolvedActor, now, root)
    return {
      record: working,
      changed: true,
    }
  }

  return null
}

function nextAvailableSlug(type: string, desired: string, root = process.cwd()): string {
  let candidate = normalizeSlug(desired)
  let suffix = 2
  while (existsSync(recordFilePath(type, candidate, root))) {
    candidate = `${normalizeSlug(desired)}-${suffix}`
    suffix += 1
  }
  return candidate
}

function collectRecordFiles(root = process.cwd()): string[] {
  const base = crmRecordsRoot(root)
  if (!existsSync(base)) return []

  const files: string[] = []
  const typeEntries = readdirSync(base, { withFileTypes: true })
  for (const typeEntry of typeEntries) {
    if (!typeEntry.isDirectory()) continue
    const typeDir = join(base, typeEntry.name)
    const recordEntries = readdirSync(typeDir, { withFileTypes: true })
    for (const entry of recordEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      files.push(join(typeDir, entry.name))
    }
  }
  return files
}

function readRecordFromFile(filePath: string): CrmRecord | null {
  try {
    const raw = readFileSync(filePath, "utf8")
    const parts = filePath.split("/")
    const type = parts[parts.length - 2] || "record"
    const slug = (parts[parts.length - 1] || "record.json").replace(/\.json$/i, "")
    return sanitizeRecord(raw.trim().length > 0 ? JSON.parse(raw) : {}, {
      type,
      slug,
      ref: `${type}/${slug}`,
    })
  } catch (error) {
    console.error(`Error reading CRM file ${filePath}: ${error}`)
    return null
  }
}

function sortRecords(a: CrmRecord, b: CrmRecord): number {
  const aNext = typeof a.next?.at === "number" ? a.next.at : Infinity
  const bNext = typeof b.next?.at === "number" ? b.next.at : Infinity
  if (aNext !== bNext) return aNext - bNext
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
  return a.ref.localeCompare(b.ref)
}

function deepFindParent(obj: Record<string, unknown>, segments: string[], createMissing: boolean): Record<string, unknown> | null {
  let cursor: Record<string, unknown> = obj
  for (const segment of segments) {
    const current = cursor[segment]
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      if (!createMissing) return null
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
  return cursor
}

function pruneEmptyObjects(root: Record<string, unknown>, segments: string[]): void {
  const chain: Array<{ parent: Record<string, unknown>; key: string }> = []
  let cursor: Record<string, unknown> = root
  for (const segment of segments) {
    const next = cursor[segment]
    if (!next || typeof next !== "object" || Array.isArray(next)) return
    chain.push({ parent: cursor, key: segment })
    cursor = next as Record<string, unknown>
  }

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node = chain[index]!
    const value = node.parent[node.key]
    if (!value || typeof value !== "object" || Array.isArray(value)) return
    if (Object.keys(value as Record<string, unknown>).length > 0) return
    delete node.parent[node.key]
  }
}

function applyFieldChange(record: CrmRecord, path: string, value: unknown, mode: "set" | "unset"): boolean {
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    throw new Error("CRM field path is required")
  }

  if (["ref", "type", "slug", "createdAt", "createdBy", "createdByName", "updatedAt", "lastActivityAt", "version", "links", "archivedAt"].includes(normalizedPath)) {
    throw new Error(`Field is not mutable: ${normalizedPath}`)
  }

  if (normalizedPath === "name") {
    if (mode === "unset") throw new Error("Cannot unset required field: name")
    const nextName = cleanString(value)
    if (!nextName) throw new Error("CRM name must be a non-empty string")
    if (record.name === nextName) return false
    record.name = nextName
    return true
  }

  if (normalizedPath === "owner" || normalizedPath === "status" || normalizedPath === "stage") {
    const key = normalizedPath as "owner" | "status" | "stage"
    if (mode === "unset" || value === null) {
      if (typeof record[key] === "undefined") return false
      delete record[key]
      return true
    }

    const nextValue = cleanString(value)
    if (!nextValue) throw new Error(`${key} must be a non-empty string`)
    if (record[key] === nextValue) return false
    record[key] = nextValue
    return true
  }

  if (normalizedPath === "tags") {
    if (mode === "unset") {
      if (record.tags.length === 0) return false
      record.tags = []
      return true
    }
    const nextTags = sanitizeTags(value)
    if (comparable(record.tags) === comparable(nextTags)) return false
    record.tags = nextTags
    return true
  }

  if (normalizedPath === "attrs") {
    if (mode === "unset") {
      if (Object.keys(record.attrs).length === 0) return false
      record.attrs = {}
      return true
    }
    const nextAttrs = cleanupObject(ensurePlainObject(value, "attrs"))
    if (comparable(record.attrs) === comparable(nextAttrs)) return false
    record.attrs = nextAttrs
    return true
  }

  if (normalizedPath.startsWith("attrs.")) {
    const segments = normalizedPath.split(".").slice(1)
    if (segments.length <= 0 || segments.some((segment) => !cleanString(segment))) {
      throw new Error(`Invalid attrs path: ${normalizedPath}`)
    }

    const parent = deepFindParent(record.attrs, segments.slice(0, -1), mode === "set")
    if (!parent) {
      return false
    }

    const leaf = segments[segments.length - 1]!
    if (mode === "unset") {
      if (!Object.prototype.hasOwnProperty.call(parent, leaf)) return false
      delete parent[leaf]
      pruneEmptyObjects(record.attrs, segments.slice(0, -1))
      return true
    }

    const nextValue = cloneJson(value)
    if (comparable(parent[leaf]) === comparable(nextValue)) return false
    parent[leaf] = nextValue
    return true
  }

  if (normalizedPath === "next") {
    if (mode === "unset") {
      if (!record.next) return false
      delete record.next
      return true
    }
    const next = sanitizeNextAction(value)
    if (!next) throw new Error("next must contain at least one of: at, text, owner")
    if (comparable(record.next) === comparable(next)) return false
    record.next = next
    return true
  }

  if (normalizedPath === "next.at" || normalizedPath === "next.text" || normalizedPath === "next.owner") {
    const field = normalizedPath.split(".")[1] as "at" | "text" | "owner"
    const next = record.next ? { ...record.next } : {}

    if (mode === "unset" || value === null) {
      if (typeof next[field] === "undefined") return false
      delete next[field]
    } else if (field === "at") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("next.at must be a timestamp number")
      }
      if (next.at === value) return false
      next.at = value
    } else {
      const nextValue = cleanString(value)
      if (!nextValue) throw new Error(`${normalizedPath} must be a non-empty string`)
      if (next[field] === nextValue) return false
      next[field] = nextValue
    }

    const sanitized = sanitizeNextAction(next)
    if (!sanitized) {
      if (!record.next) return false
      delete record.next
      return true
    }
    if (comparable(record.next) === comparable(sanitized)) return false
    record.next = sanitized
    return true
  }

  throw new Error(`Unsupported CRM field path: ${normalizedPath}`)
}

function describeTimelineEntry(entry: CrmActivity): string {
  if (entry.kind === "create") return entry.text || "Created record"
  if (entry.kind === "note") return entry.text || ""
  if (entry.kind === "link") return `${entry.rel || "link"} -> ${entry.to || ""}`.trim()
  if (entry.kind === "archive") return entry.text || "Archived record"
  if (entry.kind === "restore") return entry.text || "Restored record"
  if (entry.kind === "followup") return entry.text || "Updated follow-up"
  if (entry.kind === "field") {
    const op = entry.op === "unset" ? "unset" : "set"
    const serialized = typeof entry.value === "undefined" ? "" : ` ${JSON.stringify(entry.value)}`
    return `${op} ${entry.field || "field"}${serialized}`.trim()
  }
  return entry.text || ""
}

function formatTimestamp(ts?: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "-"
  return new Date(ts).toLocaleString()
}

function truncate(input: string, max = 26): string {
  if (input.length <= max) return input
  if (max <= 3) return input.slice(0, max)
  return `${input.slice(0, max - 3)}...`
}

function pad(input: string, width: number): string {
  if (input.length >= width) return input
  return `${input}${" ".repeat(width - input.length)}`
}

export function createCrmRecord(
  typeInput: string,
  nameInput: string,
  options: CrmCreateOptions = {},
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmRecord {
  const type = normalizeType(typeInput)
  const name = cleanString(nameInput)
  if (!name) {
    throw new Error("CRM record name is required")
  }

  ensureRecordDirs(type, root)

  const desiredSlug = cleanString(options.slug) || name
  const slug = nextAvailableSlug(type, desiredSlug, root)
  const ref = `${type}/${slug}`
  const filePath = recordFilePath(type, slug, root)
  const now = Date.now()
  const resolvedActor = actor.by ? actor : defaultActor()
  const attrs = options.attrs ? cleanupObject(ensurePlainObject(options.attrs, "attrs")) : {}
  const next = sanitizeNextAction(options.next)

  const record: CrmRecord = {
    ref,
    type,
    slug,
    name,
    owner: cleanString(options.owner),
    status: cleanString(options.status),
    stage: cleanString(options.stage),
    tags: sanitizeTags(options.tags || []),
    attrs,
    links: [],
    next,
    createdAt: now,
    createdBy: resolvedActor.by,
    createdByName: resolvedActor.byName,
    updatedAt: now,
    lastActivityAt: now,
    version: 1,
  }

  writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n")
  appendActivities(ref, [{
    kind: "create",
    text: `Created ${ref}`,
  }], resolvedActor, now, root)
  return record
}

export function getCrmRecord(ref: string, root = process.cwd()): CrmRecord | null {
  return readRecordSnapshot(ref, root)?.record || null
}

export function getAllCrmRecords(root = process.cwd()): CrmRecord[] {
  const records = collectRecordFiles(root)
    .map((filePath) => readRecordFromFile(filePath))
    .filter((record): record is CrmRecord => Boolean(record))
  return records.sort(sortRecords)
}

export function listCrmRecords(filters: CrmListFilters = {}, root = process.cwd()): CrmRecord[] {
  const archivedMode = filters.archived || "exclude"
  const query = cleanString(filters.query)?.toLowerCase()
  const type = cleanString(filters.type) ? normalizeType(filters.type!) : undefined
  const owner = cleanString(filters.owner)
  const status = cleanString(filters.status)
  const stage = cleanString(filters.stage)
  const tags = sanitizeTags(filters.tags || [])
  const dueOnly = Boolean(filters.dueOnly)
  const limit = typeof filters.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0
    ? Math.floor(filters.limit)
    : undefined
  const now = Date.now()

  let records = getAllCrmRecords(root).filter((record) => {
    const archived = typeof record.archivedAt === "number"
    if (archivedMode === "exclude" && archived) return false
    if (archivedMode === "only" && !archived) return false
    if (type && record.type !== type) return false
    if (owner && record.owner !== owner) return false
    if (status && record.status !== status) return false
    if (stage && record.stage !== stage) return false
    if (tags.length > 0 && !tags.every((tag) => record.tags.includes(tag))) return false
    if (dueOnly) {
      if (typeof record.next?.at !== "number" || !Number.isFinite(record.next.at)) return false
      if (record.next.at > now) return false
    }
    if (!query) return true

    const haystack = [
      record.ref,
      record.name,
      record.owner || "",
      record.status || "",
      record.stage || "",
      record.tags.join(" "),
      JSON.stringify(record.attrs),
      record.next?.text || "",
    ].join(" ").toLowerCase()

    return haystack.includes(query)
  })

  if (typeof limit === "number") {
    records = records.slice(0, limit)
  }

  return records
}

export function setCrmRecordValue(
  ref: string,
  path: string,
  value: unknown,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  return mutateRecordWithRetry(ref, actor, (record) => {
    const changed = applyFieldChange(record, path, value, "set")
    return {
      changed,
      activities: changed
        ? [{
            kind: path.startsWith("next") ? "followup" : "field",
            field: path,
            op: "set",
            value: cloneJson(value),
            text: path.startsWith("next") ? "Updated follow-up" : undefined,
          }]
        : [],
    }
  }, root)
}

export function unsetCrmRecordValue(
  ref: string,
  path: string,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  return mutateRecordWithRetry(ref, actor, (record) => {
    const changed = applyFieldChange(record, path, undefined, "unset")
    return {
      changed,
      activities: changed
        ? [{
            kind: path.startsWith("next") ? "followup" : "field",
            field: path,
            op: "unset",
            text: path.startsWith("next") ? "Cleared follow-up" : undefined,
          }]
        : [],
    }
  }, root)
}

export function addCrmNote(
  ref: string,
  text: string,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  const note = cleanString(text)
  if (!note) throw new Error("CRM note text is required")

  return mutateRecordWithRetry(ref, actor, () => ({
    changed: true,
    activities: [{
      kind: "note",
      text: note,
    }],
  }), root)
}

export function addCrmLink(
  fromRef: string,
  relInput: string,
  toRef: string,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  const relation = normalizeSlug(relInput)
  const target = parseRef(toRef).ref
  if (!getCrmRecord(target, root)) {
    throw new Error(`CRM record not found: ${target}`)
  }

  return mutateRecordWithRetry(fromRef, actor, (record) => {
    const existing = record.links.find((link) => link.rel === relation && link.to === target)
    if (existing) {
      return { changed: false, activities: [] }
    }

    record.links.push({
      rel: relation,
      to: target,
      createdAt: Date.now(),
      createdBy: actor.by || defaultActor().by,
      createdByName: actor.byName || defaultActor().byName,
    })

    return {
      changed: true,
      activities: [{
        kind: "link",
        rel: relation,
        to: target,
      }],
    }
  }, root)
}

export function setCrmFollowup(
  ref: string,
  next: CrmNextAction | undefined,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  const sanitized = sanitizeNextAction(next)
  return mutateRecordWithRetry(ref, actor, (record) => {
    if (comparable(record.next) === comparable(sanitized)) {
      return { changed: false, activities: [] }
    }

    if (sanitized) {
      record.next = sanitized
      return {
        changed: true,
        activities: [{
          kind: "followup",
          text: sanitized.text || "Updated follow-up",
          value: sanitized,
          op: "set",
        }],
      }
    }

    if (!record.next) {
      return { changed: false, activities: [] }
    }

    delete record.next
    return {
      changed: true,
      activities: [{
        kind: "followup",
        text: "Cleared follow-up",
        op: "unset",
      }],
    }
  }, root)
}

export function archiveCrmRecord(
  ref: string,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  return mutateRecordWithRetry(ref, actor, (record) => {
    if (typeof record.archivedAt === "number") {
      return { changed: false, activities: [] }
    }

    record.archivedAt = Date.now()
    return {
      changed: true,
      activities: [{
        kind: "archive",
        text: "Archived record",
      }],
    }
  }, root)
}

export function restoreCrmRecord(
  ref: string,
  actor: CrmActor = defaultActor(),
  root = process.cwd(),
): CrmMutationOutcome | null {
  return mutateRecordWithRetry(ref, actor, (record) => {
    if (typeof record.archivedAt === "undefined") {
      return { changed: false, activities: [] }
    }

    delete record.archivedAt
    return {
      changed: true,
      activities: [{
        kind: "restore",
        text: "Restored record",
      }],
    }
  }, root)
}

export function getCrmTimeline(ref: string, root = process.cwd()): CrmActivity[] {
  const parsed = parseRef(ref)
  const path = activityFilePath(parsed.type, parsed.slug, root)
  if (!existsSync(path)) return []

  try {
    const raw = readFileSync(path, "utf8")
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => sanitizeActivity(JSON.parse(line), { ref: parsed.ref }))
      .filter((entry): entry is CrmActivity => Boolean(entry))
    return entries.sort((a, b) => b.ts - a.ts)
  } catch (error) {
    console.error(`Error reading CRM timeline ${parsed.ref}: ${error}`)
    return []
  }
}

export function formatCrmRecordList(records: CrmRecord[]): string {
  if (records.length <= 0) {
    return "No CRM records found"
  }

  const lines: string[] = []
  lines.push(`${pad("REF", 24)} ${pad("NAME", 26)} ${pad("STAGE", 12)} ${pad("OWNER", 18)} NEXT`)
  for (const record of records) {
    const nextText = record.next?.at
      ? `${new Date(record.next.at).toISOString().slice(0, 10)} ${record.next.text || ""}`.trim()
      : record.next?.text || "-"
    const archived = typeof record.archivedAt === "number" ? " [archived]" : ""
    lines.push(
      `${pad(truncate(record.ref, 24), 24)} ${pad(truncate(record.name, 26), 26)} ${pad(truncate(record.stage || "-", 12), 12)} ${pad(truncate(record.owner || "-", 18), 18)} ${truncate(`${nextText}${archived}`, 40)}`,
    )
  }
  lines.push("")
  lines.push("Use: termlings crm show <ref>      - Record details")
  lines.push("     termlings crm timeline <ref>  - Activity history")
  return lines.join("\n")
}

export function formatCrmRecord(record: CrmRecord): string {
  const lines: string[] = []
  lines.push("CRM Record")
  lines.push("")
  lines.push(`Ref: ${record.ref}`)
  lines.push(`Name: ${record.name}`)
  lines.push(`Type: ${record.type}`)
  lines.push(`Owner: ${record.owner || "-"}`)
  lines.push(`Status: ${record.status || "-"}`)
  lines.push(`Stage: ${record.stage || "-"}`)
  lines.push(`Tags: ${record.tags.length > 0 ? record.tags.join(", ") : "-"}`)
  lines.push(`Archived: ${typeof record.archivedAt === "number" ? formatTimestamp(record.archivedAt) : "no"}`)
  if (record.next) {
    lines.push(`Next: ${record.next.at ? formatTimestamp(record.next.at) : "-"}${record.next.owner ? ` (${record.next.owner})` : ""}${record.next.text ? ` — ${record.next.text}` : ""}`)
  } else {
    lines.push("Next: -")
  }
  lines.push(`Created: ${formatTimestamp(record.createdAt)} by ${record.createdByName || record.createdBy}`)
  lines.push(`Updated: ${formatTimestamp(record.updatedAt)}`)
  lines.push(`Last activity: ${formatTimestamp(record.lastActivityAt)}`)

  lines.push("")
  lines.push("Attributes:")
  lines.push(Object.keys(record.attrs).length > 0 ? JSON.stringify(record.attrs, null, 2) : "{}")

  lines.push("")
  lines.push("Links:")
  if (record.links.length <= 0) {
    lines.push("-")
  } else {
    for (const link of record.links) {
      lines.push(`${link.rel} -> ${link.to}`)
    }
  }

  return lines.join("\n")
}

export function formatCrmTimeline(entries: CrmActivity[]): string {
  if (entries.length <= 0) {
    return "No CRM activity recorded"
  }

  const lines: string[] = []
  lines.push("CRM Timeline")
  lines.push("")
  for (const entry of entries) {
    lines.push(`${formatTimestamp(entry.ts)}  ${pad(entry.kind, 9)} ${(entry.byName || entry.by)}  ${describeTimelineEntry(entry)}`)
  }
  return lines.join("\n")
}
