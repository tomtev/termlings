import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs"
import { dirname, join } from "path"
import { randomBytes } from "crypto"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type CmsEntryStatus = "draft" | "scheduled" | "published" | "archived" | "failed"

export interface CmsCollection {
  id: string
  title: string
  description?: string
  format: "markdown"
  createdAt: number
  updatedAt: number
}

export interface CmsEntry {
  id: string
  collection: string
  title: string
  slug: string
  status: CmsEntryStatus
  body: string
  fields: Record<string, string>
  createdAt: number
  createdBy: string
  updatedAt: number
  scheduledAt?: number
  publishedAt?: number
  lastError?: string
  outputPath?: string
}

export interface CmsHistoryEntry {
  ts: number
  entryId: string
  collection: string
  slug: string
  status: "created" | "updated" | "scheduled" | "unscheduled" | "published" | "archived" | "failed"
  detail?: string
}

export interface CreateCmsCollectionInput {
  id: string
  title: string
  description?: string
}

export interface CreateCmsEntryInput {
  collection: string
  title: string
  slug?: string
  body?: string
  fields?: Record<string, string>
  createdBy?: string
}

const DEFAULT_COLLECTIONS: CmsCollection[] = [
  { id: "blog", title: "Blog", format: "markdown", createdAt: 0, updatedAt: 0 },
  { id: "pages", title: "Pages", format: "markdown", createdAt: 0, updatedAt: 0 },
  { id: "docs", title: "Docs", format: "markdown", createdAt: 0, updatedAt: 0 },
  { id: "changelog", title: "Changelog", format: "markdown", createdAt: 0, updatedAt: 0 },
]

function cmsRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "cms")
}

function cmsEntriesDir(root = process.cwd()): string {
  return join(cmsRoot(root), "entries")
}

function cmsEntryCollectionDir(collection: string, root = process.cwd()): string {
  return join(cmsEntriesDir(root), collection)
}

function cmsPublishedDir(root = process.cwd()): string {
  return join(cmsRoot(root), "publish")
}

function cmsHistoryPath(root = process.cwd()): string {
  return join(cmsRoot(root), "history.jsonl")
}

function cmsCollectionsPath(root = process.cwd()): string {
  return join(cmsRoot(root), "collections.json")
}

function cmsEntryPath(collection: string, id: string, root = process.cwd()): string {
  return join(cmsEntryCollectionDir(collection, root), `${id}.json`)
}

function cmsPublishedMarkdownPath(collection: string, slug: string, root = process.cwd()): string {
  return join(cmsPublishedDir(root), collection, `${slug}.md`)
}

function cmsPublishedJsonPath(collection: string, slug: string, root = process.cwd()): string {
  return join(cmsPublishedDir(root), collection, `${slug}.json`)
}

function ensureCmsBaseDirs(root = process.cwd()): void {
  mkdirSync(cmsRoot(root), { recursive: true })
  mkdirSync(cmsEntriesDir(root), { recursive: true })
  mkdirSync(cmsPublishedDir(root), { recursive: true })
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function currentActorId(): string {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
  if (agentSlug) return `agent:${agentSlug}`
  return "human:default"
}

function currentActivityMeta(): Partial<AppActivityEntry> {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined
  const agentDna = (process.env.TERMLINGS_AGENT_DNA || "").trim() || undefined
  const sessionId = (process.env.TERMLINGS_SESSION_ID || "").trim() || undefined
  const agentName = (process.env.TERMLINGS_AGENT_NAME || "").trim() || undefined
  return {
    actorSessionId: sessionId,
    actorName: agentName,
    actorSlug: agentSlug,
    actorDna: agentDna,
    threadId: resolveAgentActivityThreadId({ agentSlug, agentDna }),
  }
}

function appendCmsActivity(
  kind: string,
  text: string,
  result: AppActivityEntry["result"],
  meta: Record<string, unknown> | undefined,
  root: string,
): void {
  appendAppActivity({
    ts: Date.now(),
    app: "cms",
    kind,
    text,
    result,
    surface: "both",
    level: "summary",
    meta,
    ...currentActivityMeta(),
  }, root)
}

function appendCmsHistory(entry: CmsHistoryEntry, root = process.cwd()): void {
  ensureCmsDirs(root)
  appendFileSync(cmsHistoryPath(root), JSON.stringify(entry) + "\n", "utf8")
}

function readCmsHistoryLines(root = process.cwd()): CmsHistoryEntry[] {
  if (!existsSync(cmsHistoryPath(root))) return []
  try {
    return readFileSync(cmsHistoryPath(root), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CmsHistoryEntry)
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

function slugifySegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeCollectionId(input: string): string {
  const value = slugifySegment(input)
  if (!value) {
    throw new Error("Collection id is required.")
  }
  return value
}

function normalizeSlug(input: string): string {
  const value = slugifySegment(input)
  if (!value) {
    throw new Error("Slug is required.")
  }
  return value
}

function normalizeFieldKey(input: string): string {
  const value = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!value) {
    throw new Error("Field key is required.")
  }
  return value
}

function createEntryId(): string {
  return `entry_${randomBytes(6).toString("hex")}`
}

function readCollections(root = process.cwd()): CmsCollection[] {
  ensureCmsBaseDirs(root)
  return readJsonFile<CmsCollection[]>(cmsCollectionsPath(root), [])
}

function writeCollections(collections: CmsCollection[], root = process.cwd()): void {
  ensureCmsBaseDirs(root)
  writeJsonFile(cmsCollectionsPath(root), collections)
}

function ensureDefaultCollections(root = process.cwd()): CmsCollection[] {
  const existing = readJsonFile<CmsCollection[]>(cmsCollectionsPath(root), [])
  if (existing.length > 0) return existing
  const now = Date.now()
  const defaults = DEFAULT_COLLECTIONS.map((entry) => ({ ...entry, createdAt: now, updatedAt: now }))
  writeCollections(defaults, root)
  return defaults
}

function ensureCollectionExists(collection: string, root = process.cwd()): CmsCollection {
  const normalized = normalizeCollectionId(collection)
  const found = listCmsCollections(root).find((entry) => entry.id === normalized)
  if (!found) {
    throw new Error(`Unknown CMS collection: ${normalized}. Run: termlings cms collections`)
  }
  return found
}

function writeCmsEntry(entry: CmsEntry, root = process.cwd()): void {
  ensureCmsDirs(root)
  writeJsonFile(cmsEntryPath(entry.collection, entry.id, root), entry)
}

function readCmsEntryFile(path: string): CmsEntry | null {
  return readJsonFile<CmsEntry | null>(path, null)
}

function entryOutputRelativePath(collection: string, slug: string): string {
  return `.termlings/store/cms/publish/${collection}/${slug}.md`
}

function toIso(ts: number | undefined): string | undefined {
  return typeof ts === "number" && Number.isFinite(ts) ? new Date(ts).toISOString() : undefined
}

function escapeFrontmatterValue(value: string): string {
  return JSON.stringify(value)
}

function renderPublishedMarkdown(entry: CmsEntry): string {
  const frontmatterLines = [
    `title: ${escapeFrontmatterValue(entry.title)}`,
    `slug: ${escapeFrontmatterValue(entry.slug)}`,
    `collection: ${escapeFrontmatterValue(entry.collection)}`,
    `status: ${escapeFrontmatterValue(entry.status)}`,
  ]
  if (entry.publishedAt) {
    frontmatterLines.push(`publishedAt: ${escapeFrontmatterValue(new Date(entry.publishedAt).toISOString())}`)
  }
  for (const [key, value] of Object.entries(entry.fields).sort(([a], [b]) => a.localeCompare(b))) {
    frontmatterLines.push(`${key}: ${escapeFrontmatterValue(value)}`)
  }
  return ["---", ...frontmatterLines, "---", "", entry.body || ""].join("\n") + "\n"
}

export function ensureCmsDirs(root = process.cwd()): void {
  ensureCmsBaseDirs(root)
  ensureDefaultCollections(root)
}

export function listCmsCollections(root = process.cwd()): CmsCollection[] {
  return ensureDefaultCollections(root)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function createCmsCollection(input: CreateCmsCollectionInput, root = process.cwd()): CmsCollection {
  const id = normalizeCollectionId(input.id)
  const title = String(input.title || "").trim()
  if (!title) {
    throw new Error("Collection title is required.")
  }
  const existing = listCmsCollections(root)
  if (existing.some((entry) => entry.id === id)) {
    throw new Error(`CMS collection already exists: ${id}`)
  }
  const now = Date.now()
  const collection: CmsCollection = {
    id,
    title,
    description: String(input.description || "").trim() || undefined,
    format: "markdown",
    createdAt: now,
    updatedAt: now,
  }
  writeCollections([...existing, collection], root)
  appendCmsHistory({
    ts: now,
    entryId: `collection:${id}`,
    collection: id,
    slug: id,
    status: "created",
    detail: "collection",
  }, root)
  appendCmsActivity(
    "collection.created",
    `created CMS collection ${id}`,
    "success",
    { collection: id },
    root,
  )
  return collection
}

export function createCmsEntry(input: CreateCmsEntryInput, root = process.cwd()): CmsEntry {
  const collection = ensureCollectionExists(input.collection, root).id
  const title = String(input.title || "").trim()
  if (!title) {
    throw new Error("Entry title is required.")
  }
  const now = Date.now()
  const entry: CmsEntry = {
    id: createEntryId(),
    collection,
    title,
    slug: normalizeSlug(input.slug || title),
    status: "draft",
    body: String(input.body || ""),
    fields: input.fields ? { ...input.fields } : {},
    createdAt: now,
    createdBy: input.createdBy || currentActorId(),
    updatedAt: now,
  }
  writeCmsEntry(entry, root)
  appendCmsHistory({
    ts: now,
    entryId: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    status: "created",
  }, root)
  appendCmsActivity(
    "entry.created",
    `created ${entry.collection}/${entry.slug}`,
    "success",
    { entryId: entry.id, collection: entry.collection, slug: entry.slug },
    root,
  )
  return entry
}

export function listCmsEntries(
  options: {
    collection?: string
    status?: CmsEntryStatus | "all"
    limit?: number
  } = {},
  root = process.cwd(),
): CmsEntry[] {
  ensureCmsDirs(root)
  const entries: CmsEntry[] = []
  for (const collectionDir of readdirSync(cmsEntriesDir(root))) {
    const fullDir = cmsEntryCollectionDir(collectionDir, root)
    for (const file of readdirSync(fullDir)) {
      if (!file.endsWith(".json")) continue
      const entry = readCmsEntryFile(join(fullDir, file))
      if (!entry) continue
      entries.push(entry)
    }
  }
  let filtered = entries.sort((a, b) => b.updatedAt - a.updatedAt || a.slug.localeCompare(b.slug))
  if (options.collection) {
    const collection = normalizeCollectionId(options.collection)
    filtered = filtered.filter((entry) => entry.collection === collection)
  }
  if (options.status && options.status !== "all") {
    filtered = filtered.filter((entry) => entry.status === options.status)
  }
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit)
  }
  return filtered
}

export function getCmsEntry(id: string, root = process.cwd()): CmsEntry | null {
  const normalized = String(id || "").trim()
  if (!normalized) return null
  for (const entry of listCmsEntries({}, root)) {
    if (entry.id === normalized) return entry
  }
  return null
}

function requireCmsEntry(id: string, root = process.cwd()): CmsEntry {
  const entry = getCmsEntry(id, root)
  if (!entry) {
    throw new Error(`CMS entry not found: ${id}`)
  }
  return entry
}

export function updateCmsBody(id: string, body: string, root = process.cwd()): CmsEntry {
  const entry = requireCmsEntry(id, root)
  entry.body = String(body || "")
  entry.updatedAt = Date.now()
  entry.lastError = undefined
  writeCmsEntry(entry, root)
  appendCmsHistory({
    ts: entry.updatedAt,
    entryId: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    status: "updated",
    detail: "body",
  }, root)
  appendCmsActivity(
    "entry.updated",
    `updated body for ${entry.collection}/${entry.slug}`,
    "success",
    { entryId: entry.id, collection: entry.collection, slug: entry.slug, field: "body" },
    root,
  )
  return entry
}

export function setCmsField(id: string, key: string, value: string, root = process.cwd()): CmsEntry {
  const entry = requireCmsEntry(id, root)
  const normalizedKey = normalizeFieldKey(key)
  entry.fields[normalizedKey] = String(value || "").trim()
  entry.updatedAt = Date.now()
  entry.lastError = undefined
  writeCmsEntry(entry, root)
  appendCmsHistory({
    ts: entry.updatedAt,
    entryId: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    status: "updated",
    detail: normalizedKey,
  }, root)
  appendCmsActivity(
    "entry.updated",
    `updated ${normalizedKey} for ${entry.collection}/${entry.slug}`,
    "success",
    { entryId: entry.id, collection: entry.collection, slug: entry.slug, field: normalizedKey },
    root,
  )
  return entry
}

export function scheduleCmsEntry(id: string, atIso: string, root = process.cwd()): CmsEntry {
  const entry = requireCmsEntry(id, root)
  const scheduledAt = new Date(atIso).getTime()
  if (!Number.isFinite(scheduledAt)) {
    throw new Error(`Invalid schedule time: ${atIso}`)
  }
  entry.status = "scheduled"
  entry.scheduledAt = scheduledAt
  entry.updatedAt = Date.now()
  entry.lastError = undefined
  writeCmsEntry(entry, root)
  appendCmsHistory({
    ts: entry.updatedAt,
    entryId: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    status: "scheduled",
    detail: new Date(scheduledAt).toISOString(),
  }, root)
  appendCmsActivity(
    "entry.scheduled",
    `scheduled ${entry.collection}/${entry.slug}`,
    "success",
    { entryId: entry.id, collection: entry.collection, slug: entry.slug, scheduledAt },
    root,
  )
  return entry
}

export function unscheduleCmsEntry(id: string, root = process.cwd()): CmsEntry {
  const entry = requireCmsEntry(id, root)
  entry.status = entry.publishedAt ? "published" : "draft"
  entry.scheduledAt = undefined
  entry.updatedAt = Date.now()
  entry.lastError = undefined
  writeCmsEntry(entry, root)
  appendCmsHistory({
    ts: entry.updatedAt,
    entryId: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    status: "unscheduled",
  }, root)
  appendCmsActivity(
    "entry.unscheduled",
    `unscheduled ${entry.collection}/${entry.slug}`,
    "success",
    { entryId: entry.id, collection: entry.collection, slug: entry.slug },
    root,
  )
  return entry
}

export function archiveCmsEntry(id: string, root = process.cwd()): CmsEntry {
  const entry = requireCmsEntry(id, root)
  entry.status = "archived"
  entry.scheduledAt = undefined
  entry.updatedAt = Date.now()
  writeCmsEntry(entry, root)
  appendCmsHistory({
    ts: entry.updatedAt,
    entryId: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    status: "archived",
  }, root)
  appendCmsActivity(
    "entry.archived",
    `archived ${entry.collection}/${entry.slug}`,
    "success",
    { entryId: entry.id, collection: entry.collection, slug: entry.slug },
    root,
  )
  return entry
}

export function publishCmsEntry(id: string, root = process.cwd()): CmsEntry {
  const entry = requireCmsEntry(id, root)
  const now = Date.now()
  const markdownPath = cmsPublishedMarkdownPath(entry.collection, entry.slug, root)
  const metadataPath = cmsPublishedJsonPath(entry.collection, entry.slug, root)

  const publishedEntry: CmsEntry = {
    ...entry,
    status: "published",
    publishedAt: now,
    scheduledAt: undefined,
    updatedAt: now,
    lastError: undefined,
    outputPath: entryOutputRelativePath(entry.collection, entry.slug),
  }

  mkdirSync(dirname(markdownPath), { recursive: true })
  writeFileSync(markdownPath, renderPublishedMarkdown(publishedEntry), "utf8")
  writeJsonFile(metadataPath, publishedEntry)
  writeCmsEntry(publishedEntry, root)

  appendCmsHistory({
    ts: now,
    entryId: publishedEntry.id,
    collection: publishedEntry.collection,
    slug: publishedEntry.slug,
    status: "published",
    detail: publishedEntry.outputPath,
  }, root)
  appendCmsActivity(
    "entry.published",
    `published ${publishedEntry.collection}/${publishedEntry.slug}`,
    "success",
    {
      entryId: publishedEntry.id,
      collection: publishedEntry.collection,
      slug: publishedEntry.slug,
      outputPath: publishedEntry.outputPath,
    },
    root,
  )
  return publishedEntry
}

export function executeScheduledCmsPublishes(
  now = Date.now(),
  root = process.cwd(),
): Array<{ entryId: string; collection: string; slug: string; success: boolean; error?: string }> {
  const dueEntries = listCmsEntries({ status: "scheduled" }, root)
    .filter((entry) => typeof entry.scheduledAt === "number" && entry.scheduledAt <= now)

  const results: Array<{ entryId: string; collection: string; slug: string; success: boolean; error?: string }> = []
  for (const entry of dueEntries) {
    try {
      const published = publishCmsEntry(entry.id, root)
      results.push({
        entryId: published.id,
        collection: published.collection,
        slug: published.slug,
        success: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const current = requireCmsEntry(entry.id, root)
      current.status = "failed"
      current.lastError = message
      current.updatedAt = Date.now()
      writeCmsEntry(current, root)
      appendCmsHistory({
        ts: current.updatedAt,
        entryId: current.id,
        collection: current.collection,
        slug: current.slug,
        status: "failed",
        detail: message,
      }, root)
      appendCmsActivity(
        "entry.failed",
        `failed to publish ${current.collection}/${current.slug}`,
        "error",
        { entryId: current.id, collection: current.collection, slug: current.slug, error: message },
        root,
      )
      results.push({
        entryId: current.id,
        collection: current.collection,
        slug: current.slug,
        success: false,
        error: message,
      })
    }
  }
  return results
}

export function readCmsHistory(limit = 25, root = process.cwd()): CmsHistoryEntry[] {
  return readCmsHistoryLines(root).slice(0, Math.max(1, limit))
}

export function formatCmsCollections(collections: CmsCollection[]): string {
  if (collections.length <= 0) return "No CMS collections"
  return collections
    .map((entry) => `${entry.id.padEnd(12)} ${entry.title}${entry.description ? ` - ${entry.description}` : ""}`)
    .join("\n")
}

export function formatCmsEntries(entries: CmsEntry[]): string {
  if (entries.length <= 0) return "No CMS entries"
  return entries
    .map((entry) => {
      const schedule = entry.scheduledAt ? ` scheduled ${new Date(entry.scheduledAt).toISOString()}` : ""
      const published = entry.publishedAt ? ` published ${new Date(entry.publishedAt).toISOString()}` : ""
      return `${entry.id} ${entry.collection}/${entry.slug} [${entry.status}]${schedule}${published}`
    })
    .join("\n")
}

export function formatCmsEntry(entry: CmsEntry): string {
  const lines = [
    `${entry.id} ${entry.collection}/${entry.slug}`,
    `  title: ${entry.title}`,
    `  status: ${entry.status}`,
    `  createdBy: ${entry.createdBy}`,
    `  createdAt: ${new Date(entry.createdAt).toISOString()}`,
    `  updatedAt: ${new Date(entry.updatedAt).toISOString()}`,
  ]
  if (entry.scheduledAt) lines.push(`  scheduledAt: ${new Date(entry.scheduledAt).toISOString()}`)
  if (entry.publishedAt) lines.push(`  publishedAt: ${new Date(entry.publishedAt).toISOString()}`)
  if (entry.outputPath) lines.push(`  outputPath: ${entry.outputPath}`)
  if (entry.lastError) lines.push(`  lastError: ${entry.lastError}`)
  if (Object.keys(entry.fields).length > 0) {
    lines.push("  fields:")
    for (const [key, value] of Object.entries(entry.fields).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`    ${key}: ${value}`)
    }
  }
  lines.push("")
  lines.push(entry.body || "(empty body)")
  return lines.join("\n")
}

export function formatCmsHistory(entries: CmsHistoryEntry[]): string {
  if (entries.length <= 0) return "No CMS history"
  return entries
    .map((entry) => `${new Date(entry.ts).toISOString()} ${entry.collection}/${entry.slug} ${entry.status}${entry.detail ? ` - ${entry.detail}` : ""}`)
    .join("\n")
}

export function cmsCollectionsHelpText(): string {
  return [
    "Built-in collections:",
    "  blog, pages, docs, changelog",
    "",
    "Create a custom collection with:",
    '  termlings cms collection-create resources "Resources"',
  ].join("\n")
}

export function cmsPublishedSnapshot(entry: CmsEntry): Record<string, unknown> {
  return {
    id: entry.id,
    collection: entry.collection,
    slug: entry.slug,
    title: entry.title,
    status: entry.status,
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt),
    publishedAt: toIso(entry.publishedAt),
    outputPath: entry.outputPath,
    fields: entry.fields,
    body: entry.body,
  }
}
