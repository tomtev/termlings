import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { getTermlingsDir } from "./ipc.js"

export type DraftStatus = "draft" | "sent"

export interface EmailDraftData {
  id: string
  title: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  account?: string
  from?: string
  status: DraftStatus
  template?: string
  sendAt?: string
  sentAt?: string
  variables: Record<string, string>
  createdAt: string
  updatedAt: string
  body: string
  path: string
}

export interface EmailTemplateData {
  name: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject?: string
  account?: string
  from?: string
  variables: Record<string, string>
  body: string
  path: string
}

interface ParsedFrontmatterDoc {
  meta: Record<string, string>
  body: string
}

function emailRootDir(): string {
  return join(getTermlingsDir(), "email")
}

function draftsDir(): string {
  return join(emailRootDir(), "drafts")
}

function templatesDir(): string {
  return join(emailRootDir(), "templates")
}

function ensureEmailDirs(): void {
  mkdirSync(draftsDir(), { recursive: true })
  mkdirSync(templatesDir(), { recursive: true })
}

function sanitizeSingleLine(value: string): string {
  return value.replace(/\r?\n/g, " ").trim()
}

function parseList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function parseVarsMap(value: string | undefined): Record<string, string> {
  if (!value) return {}
  const map: Record<string, string> = {}
  for (const pair of value.split(/[;,]/)) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const rawValue = trimmed.slice(eqIndex + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue
    map[key] = rawValue
  }
  return map
}

function varsMapToString(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ")
}

function listToString(list: string[]): string {
  return list.join(", ")
}

function parseFrontmatterDocument(content: string): ParsedFrontmatterDoc {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { meta: {}, body: content }
  }

  const yaml = match[1] || ""
  const body = match[2] || ""
  const meta: Record<string, string> = {}
  for (const line of yaml.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!kv) continue
    const key = kv[1] || ""
    const value = (kv[2] || "").trim().replace(/^["']|["']$/g, "")
    if (!key) continue
    meta[key] = value
  }
  return { meta, body }
}

function serializeFrontmatterDocument(meta: Record<string, string>, body: string): string {
  const lines = Object.entries(meta).map(([key, value]) => `${key}: ${value}`)
  return `---\n${lines.join("\n")}\n---\n\n${body.trimEnd()}\n`
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "draft"
}

function draftId(): string {
  const now = new Date()
  const stamp = [
    now.getUTCFullYear().toString().padStart(4, "0"),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
    now.getUTCHours().toString().padStart(2, "0"),
    now.getUTCMinutes().toString().padStart(2, "0"),
    now.getUTCSeconds().toString().padStart(2, "0"),
  ].join("")
  const random = Math.random().toString(36).slice(2, 8)
  return `draft-${stamp}-${random}`
}

function draftPathFromId(id: string): string {
  return join(draftsDir(), `${id}.md`)
}

function parseDraftFromFile(path: string): EmailDraftData {
  const raw = readFileSync(path, "utf8")
  const { meta, body } = parseFrontmatterDocument(raw)
  const filename = path.split("/").pop() || ""
  const id = (meta.id || filename.replace(/\.md$/, "")).trim()
  const nowIso = new Date().toISOString()
  const createdAt = (meta.created_at || nowIso).trim()
  const updatedAt = (meta.updated_at || createdAt).trim()
  const status = meta.status === "sent" ? "sent" : "draft"

  return {
    id,
    title: (meta.title || id).trim(),
    to: parseList(meta.to),
    cc: parseList(meta.cc),
    bcc: parseList(meta.bcc),
    subject: (meta.subject || "").trim(),
    account: meta.account ? meta.account.trim() : undefined,
    from: meta.from ? meta.from.trim() : undefined,
    status,
    template: meta.template ? meta.template.trim() : undefined,
    sendAt: meta.send_at ? meta.send_at.trim() : undefined,
    sentAt: meta.sent_at ? meta.sent_at.trim() : undefined,
    variables: parseVarsMap(meta.vars),
    createdAt,
    updatedAt,
    body: body.trim(),
    path,
  }
}

function writeDraftFile(draft: EmailDraftData): void {
  const meta: Record<string, string> = {
    id: draft.id,
    title: sanitizeSingleLine(draft.title),
    to: listToString(draft.to),
    cc: listToString(draft.cc),
    bcc: listToString(draft.bcc),
    subject: sanitizeSingleLine(draft.subject),
    account: draft.account ? sanitizeSingleLine(draft.account) : "",
    from: draft.from ? sanitizeSingleLine(draft.from) : "",
    status: draft.status,
    template: draft.template ? sanitizeSingleLine(draft.template) : "",
    send_at: draft.sendAt ? sanitizeSingleLine(draft.sendAt) : "",
    sent_at: draft.sentAt ? sanitizeSingleLine(draft.sentAt) : "",
    vars: varsMapToString(draft.variables),
    created_at: draft.createdAt,
    updated_at: draft.updatedAt,
  }

  const content = serializeFrontmatterDocument(meta, draft.body)
  writeFileSync(draft.path, content)
}

function parseTemplateFromFile(path: string): EmailTemplateData {
  const raw = readFileSync(path, "utf8")
  const { meta, body } = parseFrontmatterDocument(raw)
  const filename = path.split("/").pop() || ""
  const name = (meta.name || filename.replace(/\.md$/, "")).trim()

  return {
    name,
    to: parseList(meta.to),
    cc: parseList(meta.cc),
    bcc: parseList(meta.bcc),
    subject: meta.subject ? meta.subject.trim() : undefined,
    account: meta.account ? meta.account.trim() : undefined,
    from: meta.from ? meta.from.trim() : undefined,
    variables: parseVarsMap(meta.vars),
    body: body.trim(),
    path,
  }
}

function writeTemplateFile(template: EmailTemplateData): void {
  const meta: Record<string, string> = {
    name: sanitizeSingleLine(template.name),
    to: listToString(template.to),
    cc: listToString(template.cc),
    bcc: listToString(template.bcc),
    subject: template.subject ? sanitizeSingleLine(template.subject) : "",
    account: template.account ? sanitizeSingleLine(template.account) : "",
    from: template.from ? sanitizeSingleLine(template.from) : "",
    vars: varsMapToString(template.variables),
  }

  const content = serializeFrontmatterDocument(meta, template.body)
  writeFileSync(template.path, content)
}

export function createDraft(input: {
  title: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  body?: string
  account?: string
  from?: string
  template?: string
  sendAt?: string
  variables?: Record<string, string>
}): EmailDraftData {
  ensureEmailDirs()
  const id = draftId()
  const nowIso = new Date().toISOString()
  const path = draftPathFromId(id)

  const draft: EmailDraftData = {
    id,
    title: input.title.trim(),
    to: input.to || [],
    cc: input.cc || [],
    bcc: input.bcc || [],
    subject: (input.subject || input.title || "").trim(),
    account: input.account?.trim() || undefined,
    from: input.from?.trim() || undefined,
    status: "draft",
    template: input.template?.trim() || undefined,
    sendAt: input.sendAt?.trim() || undefined,
    sentAt: undefined,
    variables: input.variables ? { ...input.variables } : {},
    createdAt: nowIso,
    updatedAt: nowIso,
    body: (input.body || "").trim(),
    path,
  }

  writeDraftFile(draft)
  return draft
}

export function listDrafts(): EmailDraftData[] {
  ensureEmailDirs()
  const dir = draftsDir()
  const entries = readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .sort((a, b) => b.localeCompare(a))

  const drafts: EmailDraftData[] = []
  for (const entry of entries) {
    const path = join(dir, entry)
    try {
      drafts.push(parseDraftFromFile(path))
    } catch {
      // skip invalid files
    }
  }
  return drafts
}

export function getDraft(idOrFilename: string): EmailDraftData | null {
  ensureEmailDirs()
  const trimmed = idOrFilename.trim()
  if (!trimmed) return null

  const filename = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`
  const direct = join(draftsDir(), filename)
  if (existsSync(direct)) {
    try {
      return parseDraftFromFile(direct)
    } catch {
      return null
    }
  }

  for (const draft of listDrafts()) {
    if (draft.id === trimmed) return draft
  }
  return null
}

export function markDraftSent(idOrFilename: string): EmailDraftData | null {
  const draft = getDraft(idOrFilename)
  if (!draft) return null

  draft.status = "sent"
  draft.sentAt = new Date().toISOString()
  draft.updatedAt = new Date().toISOString()
  writeDraftFile(draft)
  return draft
}

export function listDueScheduledDrafts(now = Date.now()): EmailDraftData[] {
  return listDrafts().filter((draft) => {
    if (draft.status !== "draft") return false
    if (!draft.sendAt || draft.sendAt.trim().length === 0) return false
    const parsed = Date.parse(draft.sendAt)
    if (!Number.isFinite(parsed)) return false
    return parsed <= now
  })
}

export function createTemplate(input: {
  name: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  account?: string
  from?: string
  body?: string
  variables?: Record<string, string>
}, force = false): EmailTemplateData {
  ensureEmailDirs()
  const safeName = slugify(input.name)
  const path = join(templatesDir(), `${safeName}.md`)
  if (existsSync(path) && !force) {
    throw new Error(`Template already exists: ${safeName}`)
  }

  const template: EmailTemplateData = {
    name: safeName,
    to: input.to || [],
    cc: input.cc || [],
    bcc: input.bcc || [],
    subject: input.subject?.trim() || undefined,
    account: input.account?.trim() || undefined,
    from: input.from?.trim() || undefined,
    variables: input.variables ? { ...input.variables } : {},
    body: (input.body || "Write your email template body here.").trim(),
    path,
  }

  writeTemplateFile(template)
  return template
}

export function listTemplates(): EmailTemplateData[] {
  ensureEmailDirs()
  const dir = templatesDir()
  const entries = readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b))

  const templates: EmailTemplateData[] = []
  for (const entry of entries) {
    const path = join(dir, entry)
    try {
      templates.push(parseTemplateFromFile(path))
    } catch {
      // skip invalid files
    }
  }
  return templates
}

export function getTemplate(name: string): EmailTemplateData | null {
  ensureEmailDirs()
  const safe = slugify(name)
  const path = join(templatesDir(), `${safe}.md`)
  if (!existsSync(path)) return null
  try {
    return parseTemplateFromFile(path)
  } catch {
    return null
  }
}

export function draftTemplatePaths(): { drafts: string; templates: string } {
  ensureEmailDirs()
  return {
    drafts: draftsDir(),
    templates: templatesDir(),
  }
}
