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
import { spawnSync, type SpawnSyncReturns } from "child_process"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type MemoryCollectionScope = "project" | "shared" | "agent" | "custom"

export interface MemoryCollection {
  id: string
  title: string
  scope: MemoryCollectionScope
  target?: string
  source: "implicit" | "custom"
}

export interface MemoryRecord {
  id: string
  collection: string
  slug: string
  title?: string
  text: string
  tags: string[]
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface MemoryHistoryEntry {
  ts: number
  memoryId: string
  collection: string
  slug: string
  status: "created" | "updated" | "qmd-sync"
  detail?: string
}

export interface CreateMemoryInput {
  collection: string
  text: string
  title?: string
  tags?: string[]
  createdBy?: string
}

export interface MemorySearchResult {
  id: string
  collection: string
  slug: string
  title?: string
  score: number
  snippet: string
  tags: string[]
}

export interface QmdStatus {
  available: boolean
  command: string
  exportRoot: string
  details?: string
}

export interface QmdSyncResult {
  available: boolean
  exportRoot: string
  exportedFiles: string[]
  registeredCollections: string[]
  errors: string[]
}

type SpawnFn = (command: string, args: string[], options?: { cwd?: string; encoding?: BufferEncoding }) => SpawnSyncReturns<string>

function memoryRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "memory")
}

function memoryRecordsDir(root = process.cwd()): string {
  return join(memoryRoot(root), "records")
}

function memoryCollectionDir(collection: string, root = process.cwd()): string {
  return join(memoryRecordsDir(root), collection)
}

function memoryHistoryPath(root = process.cwd()): string {
  return join(memoryRoot(root), "history.jsonl")
}

function memoryCollectionsPath(root = process.cwd()): string {
  return join(memoryRoot(root), "collections.json")
}

function memoryRecordPath(collection: string, id: string, root = process.cwd()): string {
  return join(memoryCollectionDir(collection, root), `${id}.json`)
}

function memoryQmdRoot(root = process.cwd()): string {
  return join(memoryRoot(root), "qmd")
}

function memoryQmdCollectionDir(collection: string, root = process.cwd()): string {
  return join(memoryQmdRoot(root), collection)
}

function memoryQmdMarkdownPath(collection: string, slug: string, root = process.cwd()): string {
  return join(memoryQmdCollectionDir(collection, root), `${slug}.md`)
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
    throw new Error("Memory collection is required.")
  }
  return value
}

function normalizeTags(input: string[] | undefined): string[] {
  return Array.from(new Set((input || [])
    .map((entry) => slugifySegment(entry))
    .filter(Boolean)))
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

function appendMemoryActivity(
  kind: string,
  text: string,
  result: AppActivityEntry["result"],
  meta: Record<string, unknown> | undefined,
  root: string,
): void {
  appendAppActivity({
    ts: Date.now(),
    app: "memory",
    kind,
    text,
    result,
    level: "summary",
    surface: "both",
    meta,
    ...currentActivityMeta(),
  }, root)
}

function appendMemoryHistory(entry: MemoryHistoryEntry, root = process.cwd()): void {
  ensureMemoryDirs(root)
  appendFileSync(memoryHistoryPath(root), JSON.stringify(entry) + "\n", "utf8")
}

function readMemoryHistoryLines(root = process.cwd()): MemoryHistoryEntry[] {
  if (!existsSync(memoryHistoryPath(root))) return []
  try {
    return readFileSync(memoryHistoryPath(root), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MemoryHistoryEntry)
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

function createMemoryId(): string {
  return `mem_${randomBytes(6).toString("hex")}`
}

function ensureMemoryBaseDirs(root = process.cwd()): void {
  mkdirSync(memoryRoot(root), { recursive: true })
  mkdirSync(memoryRecordsDir(root), { recursive: true })
  mkdirSync(memoryQmdRoot(root), { recursive: true })
}

function implicitCollections(root = process.cwd()): MemoryCollection[] {
  const collections: MemoryCollection[] = [
    { id: "project", title: "Project Memory", scope: "project", source: "implicit" },
    { id: "shared", title: "Shared Memory", scope: "shared", source: "implicit" },
  ]
  const agentsDir = join(root, ".termlings", "agents")
  if (existsSync(agentsDir)) {
    for (const slug of readdirSync(agentsDir)) {
      collections.push({
        id: `agent-${slug}`,
        title: `${slug} Memory`,
        scope: "agent",
        target: slug,
        source: "implicit",
      })
    }
  }
  return collections
}

function readCustomCollections(root = process.cwd()): MemoryCollection[] {
  ensureMemoryBaseDirs(root)
  return readJsonFile<MemoryCollection[]>(memoryCollectionsPath(root), [])
}

function writeCustomCollections(collections: MemoryCollection[], root = process.cwd()): void {
  ensureMemoryBaseDirs(root)
  writeJsonFile(memoryCollectionsPath(root), collections)
}

export function ensureMemoryDirs(root = process.cwd()): void {
  ensureMemoryBaseDirs(root)
}

export function listMemoryCollections(root = process.cwd()): MemoryCollection[] {
  const merged = [...implicitCollections(root), ...readCustomCollections(root)]
  const byId = new Map<string, MemoryCollection>()
  for (const collection of merged) {
    byId.set(collection.id, collection)
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
}

export function createMemoryCollection(id: string, title: string, root = process.cwd()): MemoryCollection {
  const normalizedId = normalizeCollectionId(id)
  const normalizedTitle = String(title || "").trim()
  if (!normalizedTitle) {
    throw new Error("Memory collection title is required.")
  }
  const existing = listMemoryCollections(root)
  if (existing.some((entry) => entry.id === normalizedId)) {
    throw new Error(`Memory collection already exists: ${normalizedId}`)
  }
  const collection: MemoryCollection = {
    id: normalizedId,
    title: normalizedTitle,
    scope: "custom",
    source: "custom",
  }
  writeCustomCollections([...readCustomCollections(root), collection], root)
  return collection
}

function ensureCollectionExists(collection: string, root = process.cwd()): MemoryCollection {
  const normalized = normalizeCollectionId(collection)
  const found = listMemoryCollections(root).find((entry) => entry.id === normalized)
  if (!found) {
    throw new Error(`Unknown memory collection: ${normalized}. Run: termlings memory collections`)
  }
  return found
}

function writeMemoryRecord(record: MemoryRecord, root = process.cwd()): void {
  ensureMemoryDirs(root)
  writeJsonFile(memoryRecordPath(record.collection, record.id, root), record)
}

export function createMemoryRecord(input: CreateMemoryInput, root = process.cwd()): MemoryRecord {
  const collection = ensureCollectionExists(input.collection, root).id
  const text = String(input.text || "").trim()
  if (!text) {
    throw new Error("Memory text is required.")
  }
  const title = String(input.title || "").trim() || undefined
  const now = Date.now()
  const record: MemoryRecord = {
    id: createMemoryId(),
    collection,
    slug: slugifySegment(title || text.slice(0, 48)) || createMemoryId(),
    title,
    text,
    tags: normalizeTags(input.tags),
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy || currentActorId(),
  }
  writeMemoryRecord(record, root)
  appendMemoryHistory({
    ts: now,
    memoryId: record.id,
    collection: record.collection,
    slug: record.slug,
    status: "created",
  }, root)
  appendMemoryActivity(
    "record.created",
    `added memory to ${record.collection}`,
    "success",
    { memoryId: record.id, collection: record.collection, slug: record.slug, tags: record.tags },
    root,
  )
  return record
}

export function listMemoryRecords(
  options: { collection?: string; limit?: number } = {},
  root = process.cwd(),
): MemoryRecord[] {
  ensureMemoryDirs(root)
  const records: MemoryRecord[] = []
  for (const collectionDir of readdirSync(memoryRecordsDir(root))) {
    const dir = memoryCollectionDir(collectionDir, root)
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue
      const record = readJsonFile<MemoryRecord | null>(join(dir, file), null)
      if (!record) continue
      records.push(record)
    }
  }
  let filtered = records.sort((a, b) => b.updatedAt - a.updatedAt || a.slug.localeCompare(b.slug))
  if (options.collection) {
    const collection = normalizeCollectionId(options.collection)
    filtered = filtered.filter((record) => record.collection === collection)
  }
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit)
  }
  return filtered
}

export function getMemoryRecord(id: string, root = process.cwd()): MemoryRecord | null {
  const normalized = String(id || "").trim()
  if (!normalized) return null
  for (const record of listMemoryRecords({}, root)) {
    if (record.id === normalized) return record
  }
  return null
}

function scoreMemoryRecord(record: MemoryRecord, terms: string[]): { score: number; snippet: string } {
  const haystack = [record.title || "", record.text, record.tags.join(" ")].join("\n").toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    if (record.title?.toLowerCase().includes(term)) score += 5
    if (record.tags.some((tag) => tag.includes(term))) score += 4
    if (haystack.includes(term)) score += 2
  }
  const snippet = record.text.length > 160 ? `${record.text.slice(0, 157)}...` : record.text
  return { score, snippet }
}

export function searchMemoryRecords(
  query: string,
  options: { collection?: string; limit?: number } = {},
  root = process.cwd(),
): MemorySearchResult[] {
  const terms = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length <= 0) {
    throw new Error("Memory query is required.")
  }
  const limit = options.limit && options.limit > 0 ? options.limit : 10
  return listMemoryRecords({ collection: options.collection }, root)
    .map((record) => {
      const scored = scoreMemoryRecord(record, terms)
      return {
        id: record.id,
        collection: record.collection,
        slug: record.slug,
        title: record.title,
        score: scored.score,
        snippet: scored.snippet,
        tags: record.tags,
      }
    })
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, limit)
}

export function readMemoryHistory(limit = 25, root = process.cwd()): MemoryHistoryEntry[] {
  return readMemoryHistoryLines(root).slice(0, Math.max(1, limit))
}

function renderQmdMarkdown(record: MemoryRecord): string {
  const lines = [
    "---",
    `id: ${JSON.stringify(record.id)}`,
    `collection: ${JSON.stringify(record.collection)}`,
    `slug: ${JSON.stringify(record.slug)}`,
    `createdBy: ${JSON.stringify(record.createdBy)}`,
  ]
  if (record.title) {
    lines.push(`title: ${JSON.stringify(record.title)}`)
  }
  if (record.tags.length > 0) {
    lines.push(`tags: ${JSON.stringify(record.tags.join(", "))}`)
  }
  lines.push("---", "", record.text)
  return lines.join("\n") + "\n"
}

export function exportMemoryForQmd(root = process.cwd()): string[] {
  const exported: string[] = []
  for (const record of listMemoryRecords({}, root)) {
    const path = memoryQmdMarkdownPath(record.collection, record.slug, root)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, renderQmdMarkdown(record), "utf8")
    exported.push(path)
  }
  return exported
}

function defaultSpawn(command: string, args: string[], options?: { cwd?: string; encoding?: BufferEncoding }): SpawnSyncReturns<string> {
  return spawnSync(command, args, { encoding: "utf8", ...options })
}

export function getQmdStatus(root = process.cwd(), spawnFn: SpawnFn = defaultSpawn): QmdStatus {
  const result = spawnFn("qmd", ["status"], { cwd: root, encoding: "utf8" })
  if (result.error) {
    return {
      available: false,
      command: "qmd",
      exportRoot: memoryQmdRoot(root),
      details: result.error.message,
    }
  }
  return {
    available: result.status === 0,
    command: "qmd",
    exportRoot: memoryQmdRoot(root),
    details: [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || undefined,
  }
}

export function syncMemoryQmd(
  options: { embed?: boolean } = {},
  root = process.cwd(),
  spawnFn: SpawnFn = defaultSpawn,
): QmdSyncResult {
  ensureMemoryDirs(root)
  const exportedFiles = exportMemoryForQmd(root)
  const status = getQmdStatus(root, spawnFn)
  if (!status.available) {
    return {
      available: false,
      exportRoot: status.exportRoot,
      exportedFiles,
      registeredCollections: [],
      errors: status.details ? [status.details] : [],
    }
  }

  const errors: string[] = []
  const registeredCollections: string[] = []
  for (const collection of listMemoryCollections(root)) {
    const dir = memoryQmdCollectionDir(collection.id, root)
    mkdirSync(dir, { recursive: true })
    const result = spawnFn("qmd", ["collection", "add", dir, "--name", collection.id], {
      cwd: root,
      encoding: "utf8",
    })
    if (result.error) {
      errors.push(result.error.message)
      continue
    }
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
    if (result.status === 0 || output.toLowerCase().includes("already exists")) {
      registeredCollections.push(collection.id)
    } else if (output) {
      errors.push(output)
    }
  }
  if (options.embed) {
    const result = spawnFn("qmd", ["embed"], { cwd: root, encoding: "utf8" })
    if (result.error) errors.push(result.error.message)
    else if (result.status !== 0) errors.push([result.stdout, result.stderr].filter(Boolean).join("\n").trim())
  }

  appendMemoryActivity(
    "qmd.sync",
    `synced memory exports to qmd`,
    errors.length > 0 ? "error" : "success",
    { registeredCollections, exportedFiles: exportedFiles.length, embed: Boolean(options.embed) },
    root,
  )

  appendMemoryHistory({
    ts: Date.now(),
    memoryId: "qmd",
    collection: "qmd",
    slug: "qmd-sync",
    status: "qmd-sync",
    detail: `${registeredCollections.length} collections`,
  }, root)

  return {
    available: true,
    exportRoot: status.exportRoot,
    exportedFiles,
    registeredCollections,
    errors: errors.filter(Boolean),
  }
}

export function runQmdQuery(
  query: string,
  options: { collection?: string; limit?: number } = {},
  root = process.cwd(),
  spawnFn: SpawnFn = defaultSpawn,
): { ok: boolean; stdout: string; stderr: string } {
  const status = getQmdStatus(root, spawnFn)
  if (!status.available) {
    throw new Error(`qmd is not installed or not available.\nInstall with: bun install -g @tobilu/qmd`)
  }
  const args = ["query", query, "--json", "-n", String(options.limit && options.limit > 0 ? options.limit : 10)]
  if (options.collection) {
    args.push("-c", normalizeCollectionId(options.collection))
  }
  const result = spawnFn("qmd", args, { cwd: root, encoding: "utf8" })
  if (result.error) {
    throw new Error(result.error.message)
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  }
}

export function formatMemoryCollections(collections: MemoryCollection[]): string {
  if (collections.length <= 0) return "No memory collections"
  return collections.map((entry) => `${entry.id.padEnd(18)} ${entry.title}`).join("\n")
}

export function formatMemoryRecords(records: MemoryRecord[]): string {
  if (records.length <= 0) return "No memory records"
  return records
    .map((record) => {
      const title = record.title ? ` ${record.title}` : ""
      const tags = record.tags.length > 0 ? ` tags:${record.tags.join(",")}` : ""
      return `${record.id} ${record.collection}/${record.slug}${title}${tags}`
    })
    .join("\n")
}

export function formatMemoryRecord(record: MemoryRecord): string {
  const lines = [
    `${record.id} ${record.collection}/${record.slug}`,
    `  title: ${record.title || "(untitled)"}`,
    `  createdBy: ${record.createdBy}`,
    `  createdAt: ${new Date(record.createdAt).toISOString()}`,
    `  updatedAt: ${new Date(record.updatedAt).toISOString()}`,
  ]
  if (record.tags.length > 0) {
    lines.push(`  tags: ${record.tags.join(", ")}`)
  }
  lines.push("", record.text)
  return lines.join("\n")
}

export function formatMemorySearchResults(results: MemorySearchResult[]): string {
  if (results.length <= 0) return "No matching memories"
  return results
    .map((result) => `${result.collection}/${result.slug} [score ${result.score}]${result.tags.length > 0 ? ` tags:${result.tags.join(",")}` : ""}\n  ${result.snippet}`)
    .join("\n\n")
}

export function formatMemoryHistory(entries: MemoryHistoryEntry[]): string {
  if (entries.length <= 0) return "No memory history"
  return entries
    .map((entry) => `${new Date(entry.ts).toISOString()} ${entry.collection}/${entry.slug} ${entry.status}${entry.detail ? ` - ${entry.detail}` : ""}`)
    .join("\n")
}
