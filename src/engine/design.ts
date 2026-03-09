import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs"
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "path"
import { createRequire } from "module"
import { fileURLToPath, pathToFileURL } from "url"

import { Resvg } from "@resvg/resvg-js"
import React from "react"
import satori from "satori"

import {
  Fragment,
  Frame,
  Image,
  Instance,
  Screen,
  Text,
  isDesignElement,
  type DesignElementShape,
  type DesignNodeType,
  type DesignPropsDefinition,
  type FitTextDefinition,
} from "../design/index.js"
import { appendAppActivity, resolveAgentActivityThreadId } from "./activity.js"
import { createBrandTemplate, readBrand, type BrandData } from "./brand.js"
import { showMediaJob } from "./media.js"
import { ensureWorkspaceDirs } from "../workspace/state.js"

const DESIGN_SOURCE_EXT = ".design.tsx"
const require = createRequire(import.meta.url)

interface LoadedDesignModule {
  id: string
  title: string
  intent?: string
  audience?: string
  width: number
  height: number
  sourcePath: string
  relativeSourcePath: string
  propsDefinition: DesignPropsDefinition
  render: (props: Record<string, unknown>) => unknown
}

export interface DesignListEntry {
  id: string
  title: string
  intent?: string
  path: string
  width: number
  height: number
}

export interface DesignValidationIssue {
  level: "error" | "warning"
  path: string
  message: string
}

export interface DesignTreeNode {
  id: string
  type: DesignNodeType
  className: string
  bind?: string
  fitText?: FitTextDefinition
  text?: string
  src?: string
  children: DesignTreeNode[]
}

export interface DesignDocumentSummary {
  id: string
  title: string
  intent?: string
  audience?: string
  path: string
  size: {
    width: number
    height: number
  }
  props: DesignPropsDefinition
  tree: DesignTreeNode
  warnings: DesignValidationIssue[]
  errors: DesignValidationIssue[]
}

export interface DesignRenderResult {
  id: string
  format: "svg" | "png"
  path: string
  width: number
  height: number
  warnings: DesignValidationIssue[]
}

export interface DesignTemplateEntry {
  id: string
  title: string
  summary: string
  intent: string
  width: number
  height: number
}

interface NormalizedDesignNode {
  id: string
  type: DesignNodeType
  className: string
  bind?: string
  fitText?: FitTextDefinition
  text?: string
  src?: string
  children: NormalizedDesignNode[]
}

interface DesignHistoryEntry {
  ts: number
  kind: "init" | "render"
  designId: string
  path?: string
  format?: "svg" | "png"
  output?: string
}

type TokenMap = Record<string, string>

interface BuiltinDesignTemplate extends DesignTemplateEntry {
  source: (id: string, title: string) => string
}

function designSourceDir(root = process.cwd()): string {
  return join(root, ".termlings", "design")
}

function designStoreDir(root = process.cwd()): string {
  return join(root, ".termlings", "store", "design")
}

function designRendersDir(root = process.cwd()): string {
  return join(designStoreDir(root), "renders")
}

function designHistoryPath(root = process.cwd()): string {
  return join(designStoreDir(root), "history.jsonl")
}

function designCacheDir(root = process.cwd()): string {
  return join(designStoreDir(root), "cache")
}

function normalizeId(input: string, label = "id"): string {
  const value = String(input || "").trim()
  if (!value) throw new Error(`Missing required ${label}.`)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label} "${value}". Use letters, numbers, underscores, or dashes.`)
  }
  return value
}

function titleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function toRelative(root: string, absolutePath: string): string {
  const rel = relative(root, absolutePath).replace(/\\/g, "/")
  return rel.startsWith("./") ? rel.slice(2) : rel
}

function normalizeSize(raw: unknown): { width: number; height: number } {
  const fallback = { width: 1200, height: 630 }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback
  const input = raw as Record<string, unknown>
  const width = typeof input.width === "number" && Number.isFinite(input.width) && input.width > 0
    ? Math.round(input.width)
    : fallback.width
  const height = typeof input.height === "number" && Number.isFinite(input.height) && input.height > 0
    ? Math.round(input.height)
    : fallback.height
  return { width, height }
}

function normalizePropsDefinition(raw: unknown): DesignPropsDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: DesignPropsDefinition = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const input = value as Record<string, unknown>
    const type = typeof input.type === "string" ? input.type.trim() : ""
    if (type !== "string" && type !== "image" && type !== "boolean" && type !== "enum" && type !== "color") continue
    out[key] = {
      type,
      ...(input.default !== undefined ? { default: input.default } : {}),
      ...(Array.isArray(input.options) ? { options: input.options.filter((entry) => typeof entry === "string") as string[] } : {}),
    }
  }
  return out
}

function defaultProps(definition: DesignPropsDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(definition)) {
    if (value.default !== undefined) out[key] = value.default
  }
  return out
}

function listAllDesignFiles(root = process.cwd()): string[] {
  ensureWorkspaceDirs(root)
  const sourceRoot = designSourceDir(root)
  mkdirSync(sourceRoot, { recursive: true })
  const out: string[] = []
  const stack = [sourceRoot]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolute)
        continue
      }
      if (entry.isFile() && absolute.endsWith(DESIGN_SOURCE_EXT)) {
        out.push(absolute)
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function listAssetDesignFiles(root = process.cwd()): string[] {
  return listAllDesignFiles(root).filter((file) => !toRelative(designSourceDir(root), file).includes("/components/"))
}

function runtimeSourcePath(fileName: "index.ts" | "jsx-runtime.ts" | "jsx-dev-runtime.ts"): string {
  return fileURLToPath(new URL(`../design/${fileName}`, import.meta.url))
}

function toImportSpecifier(fromDir: string, absolutePath: string): string {
  const rel = relative(fromDir, absolutePath).replace(/\\/g, "/")
  return rel.startsWith(".") ? rel : `./${rel}`
}

function stageDesignModule(sourcePath: string, root = process.cwd()): string {
  const source = readFileSync(sourcePath, "utf8")
  if (/\bfrom\s+["']\.[^"']+["']/.test(source)) {
    throw new Error("Relative component imports are not implemented yet in the first design slice.")
  }

  ensureWorkspaceDirs(root)
  mkdirSync(designCacheDir(root), { recursive: true })

  const stat = statSync(sourcePath)
  const cacheKey = `${sourcePath.replace(/[^a-zA-Z0-9_-]+/g, "_")}_${Math.round(stat.mtimeMs)}`
  const stageRoot = join(designCacheDir(root), cacheKey)
  const runtimeRoot = join(stageRoot, "runtime")
  mkdirSync(runtimeRoot, { recursive: true })

  const indexRel = toImportSpecifier(runtimeRoot, runtimeSourcePath("index.ts"))
  const jsxRel = toImportSpecifier(runtimeRoot, runtimeSourcePath("jsx-runtime.ts"))
  const jsxDevRel = toImportSpecifier(runtimeRoot, runtimeSourcePath("jsx-dev-runtime.ts"))

  writeFileSync(join(runtimeRoot, "index.ts"), `export * from ${JSON.stringify(indexRel)}\n`, "utf8")
  writeFileSync(join(runtimeRoot, "jsx-runtime.ts"), `export * from ${JSON.stringify(jsxRel)}\n`, "utf8")
  writeFileSync(join(runtimeRoot, "jsx-dev-runtime.ts"), `export * from ${JSON.stringify(jsxDevRel)}\n`, "utf8")

  let rewritten = source
    .replace(/@jsxImportSource\s+termlings\/design/g, "@jsxImportSource ./runtime")
    .replace(/from\s+["']termlings\/design["']/g, 'from "./runtime"')

  if (!/@jsxImportSource\s+/.test(rewritten)) {
    rewritten = `/** @jsxImportSource ./runtime */\n${rewritten}`
  }

  const stagedPath = join(stageRoot, basename(sourcePath))
  writeFileSync(stagedPath, rewritten, "utf8")
  return stagedPath
}

async function importDesignModule(sourcePath: string, root = process.cwd()): Promise<LoadedDesignModule> {
  const stagedPath = stageDesignModule(sourcePath, root)
  const url = `${pathToFileURL(stagedPath).href}?t=${Date.now()}`
  const imported = await import(url) as Record<string, unknown>
  if (typeof imported.default !== "function") {
    throw new Error(`Design module ${toRelative(root, sourcePath)} must export a default function.`)
  }

  const rawMeta = imported.meta && typeof imported.meta === "object" && !Array.isArray(imported.meta)
    ? imported.meta as Record<string, unknown>
    : {}
  const id = normalizeId(typeof rawMeta.id === "string" ? rawMeta.id : basename(sourcePath).replace(DESIGN_SOURCE_EXT, ""), "meta.id")
  const title = typeof rawMeta.title === "string" && rawMeta.title.trim()
    ? rawMeta.title.trim()
    : titleCase(id)
  const size = normalizeSize(rawMeta.size)
  const propsDefinition = normalizePropsDefinition(imported.props)

  return {
    id,
    title,
    intent: typeof rawMeta.intent === "string" && rawMeta.intent.trim() ? rawMeta.intent.trim() : undefined,
    audience: typeof rawMeta.audience === "string" && rawMeta.audience.trim() ? rawMeta.audience.trim() : undefined,
    width: size.width,
    height: size.height,
    sourcePath,
    relativeSourcePath: toRelative(root, sourcePath),
    propsDefinition,
    render: imported.default as (props: Record<string, unknown>) => unknown,
  }
}

function flattenChildren(input: unknown): unknown[] {
  if (input === null || input === undefined || input === false || input === true) return []
  if (Array.isArray(input)) return input.flatMap((entry) => flattenChildren(entry))
  return [input]
}

function expandElement(input: unknown): unknown[] {
  if (input === null || input === undefined || input === false || input === true) return []
  if (Array.isArray(input)) return input.flatMap((entry) => expandElement(entry))
  if (typeof input === "string" || typeof input === "number") return [String(input)]
  if (!isDesignElement(input)) {
    throw new Error(`Unsupported design node: ${typeof input}`)
  }

  const element = input as DesignElementShape
  if (element.type === Fragment) {
    return flattenChildren(element.props.children).flatMap((entry) => expandElement(entry))
  }
  if (typeof element.type === "function") {
    return expandElement(element.type(element.props as Record<string, unknown>))
  }
  return [element]
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeFitText(value: unknown): FitTextDefinition | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const mode = typeof input.mode === "string" ? input.mode.trim() : ""
  if (mode !== "none" && mode !== "height" && mode !== "truncate" && mode !== "shrink") return undefined
  return {
    mode,
    ...(typeof input.min === "number" ? { min: input.min } : {}),
    ...(typeof input.max === "number" ? { max: input.max } : {}),
    ...(typeof input.maxLines === "number" ? { maxLines: input.maxLines } : {}),
    ...(typeof input.step === "number" ? { step: input.step } : {}),
    ...(input.fallback === "truncate" || input.fallback === "clip" ? { fallback: input.fallback } : {}),
    ...(typeof input.ellipsis === "boolean" ? { ellipsis: input.ellipsis } : {}),
  }
}

function detectImageMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  if (ext === ".svg") return "image/svg+xml"
  throw new Error(`Unsupported image file type: ${path}`)
}

function detectRemoteImageMimeType(url: string, headerValue: string | null): string {
  const header = String(headerValue || "").trim().toLowerCase()
  if (header.startsWith("image/")) {
    return header.split(";")[0]!
  }

  const pathname = new URL(url).pathname
  const ext = extname(pathname).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  if (ext === ".svg") return "image/svg+xml"
  throw new Error(`Unsupported remote image type: ${url}`)
}

function normalizeMaybeAbsolutePath(input: string, root: string): string {
  return isAbsolute(input) ? input : join(root, input)
}

function resolveDesignImageSource(src: string, baseDir: string, root: string): string {
  const value = src.trim()
  if (!value) {
    throw new Error("Image nodes require a src prop.")
  }
  if (/^(data:|https?:\/\/)/i.test(value)) {
    return value
  }

  const fileCandidates = [
    resolve(baseDir, value),
    join(root, value),
  ]
  if (value.startsWith(".termlings/")) {
    fileCandidates.unshift(join(root, value))
  }

  for (const candidate of fileCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  try {
    const mediaJob = showMediaJob(value, "image", root)
    if (mediaJob.status !== "completed" || !mediaJob.output?.path) {
      throw new Error(`Image job is not ready yet: ${value}`)
    }
    const outputPath = normalizeMaybeAbsolutePath(mediaJob.output.path, root)
    if (!existsSync(outputPath)) {
      throw new Error(`Missing media output file for ${value}`)
    }
    return outputPath
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("Unknown image job:")) {
      throw new Error(`Unknown image source "${value}". Use a local file path, .termlings/store/media/outputs path, or completed image job id.`)
    }
    throw error instanceof Error ? error : new Error(message)
  }
}

function normalizeTreeNode(input: DesignElementShape, issues: DesignValidationIssue[], path: string, baseDir: string, root: string): NormalizedDesignNode {
  const type = input.type
  if (type !== Screen && type !== Frame && type !== Text && type !== Image) {
    if (type === Instance) {
      issues.push({ level: "warning", path, message: "Instance nodes are not implemented yet." })
    }
    throw new Error(`Unsupported design node type at ${path}.`)
  }

  const id = asString(input.props.id)
  if (!id) {
    issues.push({ level: "error", path, message: "Every design node must declare an id." })
  }

  const className = asString(input.props.className) || ""
  const bind = asString(input.props.bind)
  const fitText = normalizeFitText(input.props.fitText)
  const nextPath = id ? `${path}.${id}` : path

  if (type === Text) {
    const content = expandElement(input.props.children).filter((entry) => typeof entry === "string") as string[]
    if (fitText) {
      issues.push({ level: "warning", path: nextPath, message: "fitText is not implemented in the first design slice yet." })
    }
    return {
      id: id || `${path}.missing-id`,
      type: "text",
      className,
      bind,
      fitText,
      text: content.join(""),
      children: [],
    }
  }

  if (type === Image) {
    const src = asString(input.props.src)
    if (!src) {
      issues.push({ level: "error", path: nextPath, message: "Image nodes require a src prop." })
    }
    let resolvedSrc: string | undefined
    if (src) {
      try {
        resolvedSrc = resolveDesignImageSource(src, baseDir, root)
      } catch (error) {
        issues.push({
          level: "error",
          path: nextPath,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return {
      id: id || `${path}.missing-id`,
      type: "image",
      className,
      bind,
      src: resolvedSrc,
      children: [],
    }
  }

  const childValues = flattenChildren(input.props.children).flatMap((entry) => expandElement(entry))
  const children = childValues
    .filter((entry): entry is DesignElementShape => isDesignElement(entry))
    .map((entry, index) => normalizeTreeNode(entry, issues, `${nextPath}[${index}]`, baseDir, root))

  for (const child of childValues) {
    if (typeof child === "string") {
      issues.push({ level: "warning", path: nextPath, message: "Frame and Screen nodes ignore raw text children. Wrap text in <Text>." })
      break
    }
  }

  return {
    id: id || `${path}.missing-id`,
    type: type === Screen ? "screen" : "frame",
    className,
    bind,
    children,
  }
}

function renderTree(module: LoadedDesignModule, propOverrides: Record<string, unknown>, root = process.cwd()): DesignDocumentSummary {
  const props = { ...defaultProps(module.propsDefinition), ...propOverrides }
  const issues: DesignValidationIssue[] = []
  const rendered = module.render(props)
  const expanded = expandElement(rendered)
  if (expanded.length !== 1 || !isDesignElement(expanded[0])) {
    throw new Error(`${module.id} must render exactly one root design node.`)
  }
  const tree = normalizeTreeNode(expanded[0], issues, module.id, dirname(module.sourcePath), root)
  if (tree.type !== "screen") {
    issues.push({ level: "error", path: module.id, message: "The root design node must be <Screen>." })
  }

  const brand = readBrand(root) || createBrandTemplate(root)
  const tokenIssues = validateCompiledClasses(tree, deriveDesignTokens(brand), module.id)
  issues.push(...tokenIssues)

  return {
    id: module.id,
    title: module.title,
    intent: module.intent,
    audience: module.audience,
    path: module.relativeSourcePath,
    size: { width: module.width, height: module.height },
    props: module.propsDefinition,
    tree,
    warnings: issues.filter((issue) => issue.level === "warning"),
    errors: issues.filter((issue) => issue.level === "error"),
  }
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const value = input.trim().replace("#", "")
  if (value.length !== 6) return null
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  if (![r, g, b].every((channel) => Number.isFinite(channel))) return null
  return { r, g, b }
}

function colorBrightness(input: string): number {
  const color = parseHexColor(input)
  if (!color) return 0
  return (color.r * 299 + color.g * 587 + color.b * 114) / 1000
}

function mixColors(a: string, b: string, ratio: number): string {
  const left = parseHexColor(a)
  const right = parseHexColor(b)
  if (!left || !right) return a
  const r = clampChannel(left.r * (1 - ratio) + right.r * ratio)
  const g = clampChannel(left.g * (1 - ratio) + right.g * ratio)
  const bOut = clampChannel(left.b * (1 - ratio) + right.b * ratio)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bOut.toString(16).padStart(2, "0")}`.toUpperCase()
}

function contrastColor(input: string): string {
  return colorBrightness(input) >= 160 ? "#09090B" : "#FFFFFF"
}

function deriveDesignTokens(brand: BrandData): TokenMap {
  const background = brand.colors.background || "#FFFFFF"
  const foreground = brand.colors.foreground || "#09090B"
  const secondary = brand.colors.secondary || mixColors(background, foreground, 0.08)
  const accent = brand.colors.accent || secondary
  const card = mixColors(background, "#FFFFFF", colorBrightness(background) > 240 ? 0 : 0.35)
  const muted = mixColors(background, foreground, 0.06)
  return {
    primary: brand.colors.primary || "#574747",
    secondary,
    accent,
    background,
    foreground,
    "primary-foreground": contrastColor(brand.colors.primary || "#574747"),
    "secondary-foreground": contrastColor(secondary),
    "accent-foreground": contrastColor(accent),
    card,
    "card-foreground": foreground,
    muted,
    "muted-foreground": mixColors(foreground, background, 0.42),
    border: mixColors(foreground, background, 0.82),
  }
}

const SPACE_SCALE: Record<string, number> = {
  "0": 0,
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "3.5": 14,
  "4": 16,
  "5": 20,
  "6": 24,
  "8": 32,
  "10": 40,
  "12": 48,
  "16": 64,
}

const FONT_SIZE_SCALE: Record<string, { size: number; lineHeight?: number }> = {
  xs: { size: 12, lineHeight: 16 },
  sm: { size: 14, lineHeight: 20 },
  base: { size: 16, lineHeight: 24 },
  lg: { size: 18, lineHeight: 28 },
  xl: { size: 20, lineHeight: 28 },
  "2xl": { size: 24, lineHeight: 32 },
  "3xl": { size: 30, lineHeight: 36 },
  "4xl": { size: 36, lineHeight: 40 },
  "5xl": { size: 48, lineHeight: 52 },
  "6xl": { size: 60, lineHeight: 64 },
}

const RADIUS_SCALE: Record<string, number> = {
  DEFAULT: 4,
  lg: 8,
  xl: 12,
  "2xl": 16,
  "3xl": 24,
  full: 9999,
}

function parseSpaceValue(raw: string): number | undefined {
  return SPACE_SCALE[raw]
}

function compileClassName(className: string, tokens: TokenMap): { style: Record<string, unknown>; issues: string[] } {
  const style: Record<string, unknown> = {}
  const issues: string[] = []

  for (const token of className.split(/\s+/).filter(Boolean)) {
    if (token === "flex") {
      style.display = "flex"
      continue
    }
    if (token === "inline-flex") {
      style.display = "flex"
      continue
    }
    if (token === "flex-row") {
      style.flexDirection = "row"
      continue
    }
    if (token === "flex-col") {
      style.flexDirection = "column"
      continue
    }
    if (token === "items-start") {
      style.alignItems = "flex-start"
      continue
    }
    if (token === "items-center") {
      style.alignItems = "center"
      continue
    }
    if (token === "items-end") {
      style.alignItems = "flex-end"
      continue
    }
    if (token === "justify-start") {
      style.justifyContent = "flex-start"
      continue
    }
    if (token === "justify-center") {
      style.justifyContent = "center"
      continue
    }
    if (token === "justify-end") {
      style.justifyContent = "flex-end"
      continue
    }
    if (token === "justify-between") {
      style.justifyContent = "space-between"
      continue
    }
    if (token === "self-start") {
      style.alignSelf = "flex-start"
      continue
    }
    if (token === "self-center") {
      style.alignSelf = "center"
      continue
    }
    if (token === "self-end") {
      style.alignSelf = "flex-end"
      continue
    }
    if (token === "uppercase") {
      style.textTransform = "uppercase"
      continue
    }
    if (token === "text-left") {
      style.textAlign = "left"
      continue
    }
    if (token === "text-center") {
      style.textAlign = "center"
      continue
    }
    if (token === "text-right") {
      style.textAlign = "right"
      continue
    }
    if (token === "w-full") {
      style.width = "100%"
      continue
    }
    if (token === "h-full") {
      style.height = "100%"
      continue
    }
    if (token === "border") {
      style.borderWidth = 1
      style.borderStyle = "solid"
      continue
    }
    if (token === "object-contain") {
      style.objectFit = "contain"
      continue
    }
    if (token === "object-cover") {
      style.objectFit = "cover"
      continue
    }
    if (token === "overflow-hidden") {
      style.overflow = "hidden"
      continue
    }
    if (token === "tracking-widest") {
      style.letterSpacing = "0.12em"
      continue
    }
    if (token === "tracking-wide") {
      style.letterSpacing = "0.04em"
      continue
    }
    if (token === "leading-tight") {
      style.lineHeight = 1.1
      continue
    }
    if (token === "leading-snug") {
      style.lineHeight = 1.35
      continue
    }
    if (token === "font-normal") {
      style.fontWeight = 400
      continue
    }
    if (token === "font-medium") {
      style.fontWeight = 500
      continue
    }
    if (token === "font-semibold") {
      style.fontWeight = 600
      continue
    }
    if (token === "font-bold") {
      style.fontWeight = 700
      continue
    }
    if (token === "shadow-sm") {
      style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.10)"
      continue
    }
    if (token === "shadow") {
      style.boxShadow = "0 12px 32px rgba(15, 23, 42, 0.16)"
      continue
    }
    if (token === "flex-1") {
      style.flex = 1
      continue
    }
    if (token === "shrink-0") {
      style.flexShrink = 0
      continue
    }

    if (token.startsWith("gap-")) {
      const value = parseSpaceValue(token.slice(4))
      if (value !== undefined) {
        style.gap = value
        continue
      }
    }

    let handledSpacing = false
    for (const [prefix, property] of [
      ["p-", "padding"],
      ["px-", ["paddingLeft", "paddingRight"]],
      ["py-", ["paddingTop", "paddingBottom"]],
      ["pt-", "paddingTop"],
      ["pb-", "paddingBottom"],
      ["pl-", "paddingLeft"],
      ["pr-", "paddingRight"],
      ["m-", "margin"],
      ["mt-", "marginTop"],
      ["mb-", "marginBottom"],
      ["ml-", "marginLeft"],
      ["mr-", "marginRight"],
      ["w-", "width"],
      ["h-", "height"],
    ] as const) {
      if (!token.startsWith(prefix)) continue
      const value = parseSpaceValue(token.slice(prefix.length))
      if (value === undefined) break
      if (Array.isArray(property)) {
        for (const name of property) style[name] = value
      } else {
        style[property] = value
      }
      handledSpacing = true
      break
    }
    if (handledSpacing) {
      continue
    }

    if (token === "rounded") {
      style.borderRadius = RADIUS_SCALE.DEFAULT
      continue
    }
    if (token.startsWith("rounded-")) {
      const value = RADIUS_SCALE[token.slice(8)]
      if (value !== undefined) {
        style.borderRadius = value
        continue
      }
    }

    if (token.startsWith("bg-")) {
      const value = tokens[token.slice(3)]
      if (value) {
        style.backgroundColor = value
        continue
      }
    }

    if (token.startsWith("text-")) {
      const suffix = token.slice(5)
      const semantic = tokens[suffix]
      if (semantic) {
        style.color = semantic
        continue
      }
      const size = FONT_SIZE_SCALE[suffix]
      if (size) {
        style.fontSize = size.size
        if (size.lineHeight) style.lineHeight = `${size.lineHeight}px`
        continue
      }
    }

    if (token.startsWith("border-")) {
      const suffix = token.slice(7)
      if (/^\d+$/.test(suffix)) {
        style.borderWidth = Number.parseInt(suffix, 10)
        style.borderStyle = "solid"
        continue
      }
      const color = tokens[suffix]
      if (color) {
        style.borderColor = color
        style.borderStyle = "solid"
        if (!style.borderWidth) style.borderWidth = 1
        continue
      }
    }

    issues.push(`Unsupported class "${token}"`)
  }

  return { style, issues }
}

function validateCompiledClasses(node: NormalizedDesignNode, tokens: TokenMap, path: string): DesignValidationIssue[] {
  const issues: DesignValidationIssue[] = []
  const compiled = compileClassName(node.className, tokens)
  for (const issue of compiled.issues) {
    issues.push({ level: "error", path: `${path}.${node.id}`, message: issue })
  }
  for (const child of node.children) {
    issues.push(...validateCompiledClasses(child, tokens, `${path}.${node.id}`))
  }
  return issues
}

async function renderableImageSource(src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined
  if (/^data:/i.test(src)) return src
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src)
    if (!response.ok) {
      throw new Error(`Failed to fetch remote image: ${src} (${response.status})`)
    }
    const mimeType = detectRemoteImageMimeType(src, response.headers.get("content-type"))
    const bytes = Buffer.from(await response.arrayBuffer())
    return `data:${mimeType};base64,${bytes.toString("base64")}`
  }
  const mimeType = detectImageMimeType(src)
  const data = readFileSync(src).toString("base64")
  return `data:${mimeType};base64,${data}`
}

async function toReactNode(node: NormalizedDesignNode, tokens: TokenMap): Promise<React.ReactNode> {
  const compiled = compileClassName(node.className, tokens)
  const baseStyle: Record<string, unknown> = node.type === "screen"
    ? { display: "flex", flexDirection: "column", boxSizing: "border-box", width: "100%", height: "100%" }
    : node.type === "frame"
      ? { display: "flex", flexDirection: "column", boxSizing: "border-box" }
    : node.type === "text"
      ? { display: "block", boxSizing: "border-box", whiteSpace: "pre-wrap" }
      : { display: "block", boxSizing: "border-box" }
  const style = { ...baseStyle, ...compiled.style }

  if (node.type === "text") {
    return React.createElement("div", { key: node.id, style }, node.text || "")
  }
  if (node.type === "image") {
    return React.createElement("img", { key: node.id, style, src: await renderableImageSource(node.src) })
  }
  const children = await Promise.all(node.children.map((child) => toReactNode(child, tokens)))
  return React.createElement("div", { key: node.id, style }, ...children)
}

let cachedFonts: Array<{ name: string; data: Buffer; weight: number; style: "normal" }> | null = null

function loadFonts(): Array<{ name: string; data: Buffer; weight: number; style: "normal" }> {
  if (cachedFonts) return cachedFonts
  const regular = require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff")
  const semibold = require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff")
  const bold = require.resolve("@fontsource/inter/files/inter-latin-700-normal.woff")
  cachedFonts = [
    { name: "Inter", data: readFileSync(regular), weight: 400, style: "normal" },
    { name: "Inter", data: readFileSync(semibold), weight: 600, style: "normal" },
    { name: "Inter", data: readFileSync(bold), weight: 700, style: "normal" },
  ]
  return cachedFonts
}

function appendDesignHistory(entry: DesignHistoryEntry, root = process.cwd()): void {
  ensureWorkspaceDirs(root)
  mkdirSync(designStoreDir(root), { recursive: true })
  appendFileSync(designHistoryPath(root), `${JSON.stringify(entry)}\n`, "utf8")
}

function appendDesignActivity(kind: string, text: string, result: "success" | "error", meta: Record<string, unknown>, root = process.cwd()): void {
  appendAppActivity({
    ts: Date.now(),
    app: "design",
    kind,
    text,
    result,
    actorSessionId: process.env.TERMLINGS_SESSION_ID || undefined,
    actorSlug: process.env.TERMLINGS_AGENT_SLUG || undefined,
    actorName: process.env.TERMLINGS_AGENT_NAME || undefined,
    actorDna: process.env.TERMLINGS_AGENT_DNA || undefined,
    threadId: resolveAgentActivityThreadId({
      agentSlug: process.env.TERMLINGS_AGENT_SLUG || undefined,
      agentDna: process.env.TERMLINGS_AGENT_DNA || undefined,
    }),
    meta,
  }, root)
}

function starterDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Launch card",
  size: { width: 1200, height: 630 }
}

export const props = {
  eyebrow: { type: "string", default: "TERMLINGS" },
  title: { type: "string", default: "Build autonomous teams in the terminal" },
  subtitle: { type: "string", default: "Messaging, tasks, browser workflows, and shared state." },
  ctaLabel: { type: "string", default: "Get Started" }
}

export default function Design({ eyebrow, title, subtitle, ctaLabel }) {
  return (
    <Screen id="hero" className="flex flex-col bg-background text-foreground p-16">
      <Frame id="panel" className="flex flex-col gap-6 bg-card border border-border rounded-3xl p-12">
        <Text id="eyebrow" bind="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </Text>
        <Text id="headline" bind="title" className="text-6xl font-bold text-foreground">
          {title}
        </Text>
        <Text id="subhead" bind="subtitle" className="text-2xl text-muted-foreground">
          {subtitle}
        </Text>
        <Frame id="actions" className="flex flex-row items-center gap-3 mt-2">
          <Frame id="cta" className="bg-primary rounded-2xl px-6 py-4">
            <Text id="cta-label" bind="ctaLabel" className="text-lg font-semibold text-primary-foreground">
              {ctaLabel}
            </Text>
          </Frame>
          <Text id="meta" className="text-sm text-muted-foreground">
            termlings.com
          </Text>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function ogStandardDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Standard open graph image",
  audience: "Website",
  size: { width: 1200, height: 630 }
}

export const props = {
  eyebrow: { type: "string", default: "TERMLINGS" },
  title: { type: "string", default: "Build autonomous teams in the terminal" },
  subtitle: { type: "string", default: "Messaging, tasks, browser workflows, and local-first coordination in one workspace." },
  site: { type: "string", default: "termlings.com" }
}

export default function Design({ eyebrow, title, subtitle, site }) {
  return (
    <Screen id="og-standard" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full justify-between bg-card border border-border rounded-3xl p-12 shadow">
        <Frame id="content" className="flex flex-col gap-6">
          <Text id="eyebrow" bind="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
            {eyebrow}
          </Text>
          <Text id="headline" bind="title" className="text-6xl font-bold leading-tight text-foreground">
            {title}
          </Text>
          <Text id="subhead" bind="subtitle" className="text-2xl text-muted-foreground">
            {subtitle}
          </Text>
        </Frame>
        <Frame id="footer" className="flex flex-row items-center justify-between">
          <Text id="site" bind="site" className="text-lg font-semibold text-foreground">
            {site}
          </Text>
          <Frame id="mark" className="bg-primary rounded-2xl px-5 py-3">
            <Text id="mark-label" className="text-base font-semibold text-primary-foreground">
              ${title.toUpperCase().slice(0, 10)}
            </Text>
          </Frame>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function ogArticleDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Article open graph image",
  audience: "Content",
  size: { width: 1200, height: 630 }
}

export const props = {
  category: { type: "string", default: "GUIDE" },
  title: { type: "string", default: "How autonomous teams coordinate without constant meetings" },
  author: { type: "string", default: "Termlings" },
  site: { type: "string", default: "termlings.com" }
}

export default function Design({ category, title, author, site }) {
  return (
    <Screen id="og-article" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full justify-between bg-card border border-border rounded-3xl p-12">
        <Frame id="header" className="flex flex-col gap-5">
          <Frame id="category-pill" className="self-start bg-primary rounded-2xl px-5 py-3">
            <Text id="category" bind="category" className="text-base font-semibold uppercase tracking-wide text-primary-foreground">
              {category}
            </Text>
          </Frame>
          <Text id="headline" bind="title" className="text-6xl font-bold leading-tight text-foreground">
            {title}
          </Text>
        </Frame>
        <Frame id="footer" className="flex flex-row items-center justify-between">
          <Frame id="byline" className="flex flex-col gap-2">
            <Text id="author-label" className="text-sm uppercase tracking-wide text-muted-foreground">
              By
            </Text>
            <Text id="author" bind="author" className="text-xl font-semibold text-foreground">
              {author}
            </Text>
          </Frame>
          <Text id="site" bind="site" className="text-lg text-muted-foreground">
            {site}
          </Text>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function ogFeatureDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Feature launch open graph image",
  audience: "Product",
  size: { width: 1200, height: 630 }
}

export const props = {
  title: { type: "string", default: "One terminal for every agent workflow" },
  featureOne: { type: "string", default: "Direct messaging" },
  featureTwo: { type: "string", default: "Shared tasks" },
  featureThree: { type: "string", default: "Browser automation" },
  site: { type: "string", default: "termlings.com" }
}

export default function Design({ title, featureOne, featureTwo, featureThree, site }) {
  return (
    <Screen id="og-feature" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full justify-between bg-card border border-border rounded-3xl p-12 shadow">
        <Frame id="header" className="flex flex-col gap-5">
          <Text id="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
            Product
          </Text>
          <Text id="headline" bind="title" className="text-6xl font-bold leading-tight text-foreground">
            {title}
          </Text>
        </Frame>
        <Frame id="features" className="flex flex-row gap-4">
          <Frame id="feature-one-pill" className="bg-background border border-border rounded-2xl px-5 py-4">
            <Text id="feature-one" bind="featureOne" className="text-lg font-semibold text-foreground">
              {featureOne}
            </Text>
          </Frame>
          <Frame id="feature-two-pill" className="bg-background border border-border rounded-2xl px-5 py-4">
            <Text id="feature-two" bind="featureTwo" className="text-lg font-semibold text-foreground">
              {featureTwo}
            </Text>
          </Frame>
          <Frame id="feature-three-pill" className="bg-background border border-border rounded-2xl px-5 py-4">
            <Text id="feature-three" bind="featureThree" className="text-lg font-semibold text-foreground">
              {featureThree}
            </Text>
          </Frame>
        </Frame>
        <Text id="site" bind="site" className="text-lg text-muted-foreground">
          {site}
        </Text>
      </Frame>
    </Screen>
  )
}
`
}

function ogPricingDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Pricing open graph image",
  audience: "Website",
  size: { width: 1200, height: 630 }
}

export const props = {
  headline: { type: "string", default: "Simple pricing for fast-moving teams" },
  starterPrice: { type: "string", default: "$19" },
  growthPrice: { type: "string", default: "$79" },
  scalePrice: { type: "string", default: "Custom" }
}

export default function Design({ headline, starterPrice, growthPrice, scalePrice }) {
  return (
    <Screen id="og-pricing" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full gap-8 bg-card border border-border rounded-3xl p-12">
        <Frame id="header" className="flex flex-col gap-4">
          <Text id="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
            Pricing
          </Text>
          <Text id="headline" bind="headline" className="text-5xl font-bold leading-tight text-foreground">
            {headline}
          </Text>
        </Frame>
        <Frame id="plans" className="flex flex-row gap-4">
          <Frame id="starter-card" className="flex flex-col flex-1 gap-3 bg-background border border-border rounded-2xl p-6">
            <Text id="starter-label" className="text-base font-semibold text-foreground">
              Starter
            </Text>
            <Text id="starter-price" bind="starterPrice" className="text-4xl font-bold text-foreground">
              {starterPrice}
            </Text>
            <Text id="starter-note" className="text-sm text-muted-foreground">
              One active team
            </Text>
          </Frame>
          <Frame id="growth-card" className="flex flex-col flex-1 gap-3 bg-primary rounded-2xl p-6">
            <Text id="growth-label" className="text-base font-semibold text-primary-foreground">
              Growth
            </Text>
            <Text id="growth-price" bind="growthPrice" className="text-4xl font-bold text-primary-foreground">
              {growthPrice}
            </Text>
            <Text id="growth-note" className="text-sm text-primary-foreground">
              Shared browser and workflows
            </Text>
          </Frame>
          <Frame id="scale-card" className="flex flex-col flex-1 gap-3 bg-background border border-border rounded-2xl p-6">
            <Text id="scale-label" className="text-base font-semibold text-foreground">
              Scale
            </Text>
            <Text id="scale-price" bind="scalePrice" className="text-4xl font-bold text-foreground">
              {scalePrice}
            </Text>
            <Text id="scale-note" className="text-sm text-muted-foreground">
              Multi-team rollout
            </Text>
          </Frame>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function ogTestimonialDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Testimonial open graph image",
  audience: "Website",
  size: { width: 1200, height: 630 }
}

export const props = {
  quote: { type: "string", default: "We replaced half our coordination overhead with one shared terminal workspace." },
  author: { type: "string", default: "Alex Rivera" },
  company: { type: "string", default: "Founder, Northstar Labs" }
}

export default function Design({ quote, author, company }) {
  return (
    <Screen id="og-testimonial" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full justify-between bg-card border border-border rounded-3xl p-12 shadow">
        <Frame id="content" className="flex flex-col gap-5">
          <Text id="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
            Testimonial
          </Text>
          <Text id="quote" bind="quote" className="text-5xl font-bold leading-tight text-foreground">
            {quote}
          </Text>
        </Frame>
        <Frame id="footer" className="flex flex-col gap-2">
          <Text id="author" bind="author" className="text-xl font-semibold text-foreground">
            {author}
          </Text>
          <Text id="company" bind="company" className="text-base text-muted-foreground">
            {company}
          </Text>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function linkedInAnnouncementDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "LinkedIn announcement image",
  audience: "LinkedIn",
  size: { width: 1200, height: 627 }
}

export const props = {
  headline: { type: "string", default: "We just shipped shared browser workflows for every agent" },
  subhead: { type: "string", default: "A cleaner way to coordinate launches, support, and growth from one terminal workspace." },
  cta: { type: "string", default: "See the full launch" }
}

export default function Design({ headline, subhead, cta }) {
  return (
    <Screen id="linkedin-announcement" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full justify-between bg-card border border-border rounded-3xl p-12">
        <Frame id="header" className="flex flex-col gap-5">
          <Frame id="pill" className="self-start bg-primary rounded-2xl px-5 py-3">
            <Text id="pill-label" className="text-base font-semibold uppercase tracking-wide text-primary-foreground">
              LinkedIn
            </Text>
          </Frame>
          <Text id="headline" bind="headline" className="text-6xl font-bold leading-tight text-foreground">
            {headline}
          </Text>
          <Text id="subhead" bind="subhead" className="text-2xl text-muted-foreground">
            {subhead}
          </Text>
        </Frame>
        <Frame id="footer" className="flex flex-row items-center justify-between">
          <Text id="brand" className="text-lg font-semibold text-foreground">
            termlings.com
          </Text>
          <Frame id="cta" className="bg-primary rounded-2xl px-5 py-3">
            <Text id="cta-label" bind="cta" className="text-base font-semibold text-primary-foreground">
              {cta}
            </Text>
          </Frame>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function quoteCardDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Square quote card",
  audience: "Social",
  size: { width: 1080, height: 1080 }
}

export const props = {
  quote: { type: "string", default: "The fastest way to align a team is to make the work visible." },
  author: { type: "string", default: "Termlings" },
  role: { type: "string", default: "Autonomous team OS" }
}

export default function Design({ quote, author, role }) {
  return (
    <Screen id="quote-card" className="flex flex-col bg-background p-12">
      <Frame id="card" className="flex flex-col h-full justify-between bg-card border border-border rounded-3xl p-12 shadow">
        <Frame id="header" className="flex flex-col gap-3">
          <Text id="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
            ${title.toUpperCase()}
          </Text>
          <Text id="quote" bind="quote" className="text-5xl font-bold leading-tight text-foreground">
            {quote}
          </Text>
        </Frame>
        <Frame id="footer" className="flex flex-col gap-2">
          <Text id="author" bind="author" className="text-xl font-semibold text-foreground">
            {author}
          </Text>
          <Text id="role" bind="role" className="text-base text-muted-foreground">
            {role}
          </Text>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

function metricsBoardDesignSource(id: string, title: string): string {
  return `/** @jsxImportSource termlings/design */
import { Screen, Frame, Text } from "termlings/design"

export const meta = {
  id: "${id}",
  title: "${title}",
  intent: "Launch metrics board",
  audience: "Marketing",
  size: { width: 1200, height: 630 }
}

export const props = {
  headline: { type: "string", default: "Launch momentum is compounding" },
  statOneValue: { type: "string", default: "+28%" },
  statOneLabel: { type: "string", default: "Weekly active teams" },
  statTwoValue: { type: "string", default: "184" },
  statTwoLabel: { type: "string", default: "Messages sent today" },
  statThreeValue: { type: "string", default: "9m" },
  statThreeLabel: { type: "string", default: "Median handoff time" }
}

export default function Design({
  headline,
  statOneValue,
  statOneLabel,
  statTwoValue,
  statTwoLabel,
  statThreeValue,
  statThreeLabel,
}) {
  return (
    <Screen id="metrics-board" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col h-full gap-8 bg-card border border-border rounded-3xl p-12">
        <Frame id="heading" className="flex flex-col gap-3">
          <Text id="eyebrow" className="text-sm font-semibold uppercase tracking-widest text-primary">
            Metrics
          </Text>
          <Text id="headline" bind="headline" className="text-5xl font-bold leading-tight text-foreground">
            {headline}
          </Text>
        </Frame>
        <Frame id="stats" className="flex flex-row gap-4">
          <Frame id="stat-one" className="flex flex-col flex-1 gap-3 bg-background border border-border rounded-2xl p-6">
            <Text id="stat-one-value" bind="statOneValue" className="text-4xl font-bold text-foreground">
              {statOneValue}
            </Text>
            <Text id="stat-one-label" bind="statOneLabel" className="text-base text-muted-foreground">
              {statOneLabel}
            </Text>
          </Frame>
          <Frame id="stat-two" className="flex flex-col flex-1 gap-3 bg-background border border-border rounded-2xl p-6">
            <Text id="stat-two-value" bind="statTwoValue" className="text-4xl font-bold text-foreground">
              {statTwoValue}
            </Text>
            <Text id="stat-two-label" bind="statTwoLabel" className="text-base text-muted-foreground">
              {statTwoLabel}
            </Text>
          </Frame>
          <Frame id="stat-three" className="flex flex-col flex-1 gap-3 bg-background border border-border rounded-2xl p-6">
            <Text id="stat-three-value" bind="statThreeValue" className="text-4xl font-bold text-foreground">
              {statThreeValue}
            </Text>
            <Text id="stat-three-label" bind="statThreeLabel" className="text-base text-muted-foreground">
              {statThreeLabel}
            </Text>
          </Frame>
        </Frame>
      </Frame>
    </Screen>
  )
}
`
}

const BUILTIN_DESIGN_TEMPLATES: BuiltinDesignTemplate[] = [
  {
    id: "starter",
    title: "Starter",
    summary: "Simple launch card with headline, subhead, and CTA.",
    intent: "General hero",
    width: 1200,
    height: 630,
    source: starterDesignSource,
  },
  {
    id: "og-standard",
    title: "OG Standard",
    summary: "Default wide Open Graph image with eyebrow, title, subtitle, and site footer.",
    intent: "Standard OG",
    width: 1200,
    height: 630,
    source: ogStandardDesignSource,
  },
  {
    id: "og-article",
    title: "OG Article",
    summary: "Article-style Open Graph layout with category, headline, and byline.",
    intent: "Article OG",
    width: 1200,
    height: 630,
    source: ogArticleDesignSource,
  },
  {
    id: "og-feature",
    title: "OG Feature",
    summary: "Feature launch Open Graph layout with headline and three feature pills.",
    intent: "Feature OG",
    width: 1200,
    height: 630,
    source: ogFeatureDesignSource,
  },
  {
    id: "og-pricing",
    title: "OG Pricing",
    summary: "Pricing Open Graph layout with three plan cards.",
    intent: "Pricing OG",
    width: 1200,
    height: 630,
    source: ogPricingDesignSource,
  },
  {
    id: "og-testimonial",
    title: "OG Testimonial",
    summary: "Testimonial Open Graph layout with quote, author, and company.",
    intent: "Testimonial OG",
    width: 1200,
    height: 630,
    source: ogTestimonialDesignSource,
  },
  {
    id: "linkedin-announcement",
    title: "LinkedIn Announcement",
    summary: "LinkedIn-style announcement image for launch posts and updates.",
    intent: "LinkedIn announcement",
    width: 1200,
    height: 627,
    source: linkedInAnnouncementDesignSource,
  },
  {
    id: "quote-card",
    title: "Quote Card",
    summary: "Square quote card for social-style visuals.",
    intent: "Social quote",
    width: 1080,
    height: 1080,
    source: quoteCardDesignSource,
  },
  {
    id: "metrics-board",
    title: "Metrics Board",
    summary: "Wide metrics layout with three stat tiles.",
    intent: "Launch metrics",
    width: 1200,
    height: 630,
    source: metricsBoardDesignSource,
  },
]

function resolveDesignTemplate(templateId?: string): BuiltinDesignTemplate {
  const wanted = normalizeId(templateId || "starter", "template")
  const template = BUILTIN_DESIGN_TEMPLATES.find((entry) => entry.id === wanted)
  if (!template) {
    throw new Error(`Unknown design template "${wanted}".`)
  }
  return template
}

export function listDesignTemplates(): DesignTemplateEntry[] {
  return BUILTIN_DESIGN_TEMPLATES.map(({ id, title, summary, intent, width, height }) => ({
    id,
    title,
    summary,
    intent,
    width,
    height,
  }))
}

export function readDesignTemplate(templateId: string): DesignTemplateEntry {
  const { id, title, summary, intent, width, height } = resolveDesignTemplate(templateId)
  return { id, title, summary, intent, width, height }
}

export function formatDesignTemplateList(items: DesignTemplateEntry[]): string {
  if (items.length === 0) return "No design templates found."
  return items
    .map((item) => `${item.id}  ${item.width}x${item.height}  ${item.summary}`)
    .join("\n")
}

export function initDesign(input: { id: string; template?: string }, root = process.cwd()): { id: string; path: string; template: string } {
  ensureWorkspaceDirs(root)
  mkdirSync(designSourceDir(root), { recursive: true })
  const id = normalizeId(input.id)
  const template = resolveDesignTemplate(input.template)
  const path = join(designSourceDir(root), `${id}${DESIGN_SOURCE_EXT}`)
  if (existsSync(path)) {
    throw new Error(`${toRelative(root, path)} already exists.`)
  }
  const title = titleCase(id)
  writeFileSync(path, template.source(id, title), "utf8")
  appendDesignHistory({ ts: Date.now(), kind: "init", designId: id, path: toRelative(root, path) }, root)
  appendDesignActivity("init", `initialized design ${id} from ${template.id}`, "success", {
    id,
    template: template.id,
    path: toRelative(root, path),
  }, root)
  return { id, path: toRelative(root, path), template: template.id }
}

export async function listDesigns(root = process.cwd()): Promise<DesignListEntry[]> {
  const entries: DesignListEntry[] = []
  for (const file of listAssetDesignFiles(root)) {
    const loaded = await importDesignModule(file, root)
    entries.push({
      id: loaded.id,
      title: loaded.title,
      intent: loaded.intent,
      path: loaded.relativeSourcePath,
      width: loaded.width,
      height: loaded.height,
    })
  }
  return entries
}

async function resolveDesignModule(target: string, root = process.cwd()): Promise<LoadedDesignModule> {
  const value = String(target || "").trim()
  if (!value) throw new Error("Missing required design id.")

  const directCandidate = value.endsWith(DESIGN_SOURCE_EXT)
    ? resolve(root, value)
    : resolve(designSourceDir(root), `${value}${DESIGN_SOURCE_EXT}`)
  if (existsSync(directCandidate)) {
    return importDesignModule(directCandidate, root)
  }

  for (const file of listAssetDesignFiles(root)) {
    const loaded = await importDesignModule(file, root)
    if (loaded.id === value || basename(file).replace(DESIGN_SOURCE_EXT, "") === value) {
      return loaded
    }
  }
  throw new Error(`Unknown design "${value}".`)
}

export async function readDesignSummary(target: string, propOverrides: Record<string, unknown> = {}, root = process.cwd()): Promise<DesignDocumentSummary> {
  const module = await resolveDesignModule(target, root)
  return renderTree(module, propOverrides, root)
}

export async function inspectDesignNode(target: string, nodeId: string, propOverrides: Record<string, unknown> = {}, root = process.cwd()): Promise<DesignTreeNode> {
  const summary = await readDesignSummary(target, propOverrides, root)
  const wanted = normalizeId(nodeId, "node")
  const stack = [summary.tree]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.id === wanted) return current
    stack.push(...current.children)
  }
  throw new Error(`Unknown design node "${wanted}" in ${summary.id}.`)
}

export async function renderDesign(input: {
  id: string
  format?: string
  out?: string
  props?: Record<string, unknown>
}, root = process.cwd()): Promise<DesignRenderResult> {
  const module = await resolveDesignModule(input.id, root)
  const summary = renderTree(module, input.props || {}, root)
  if (summary.errors.length > 0) {
    throw new Error(summary.errors.map((issue) => `${issue.path}: ${issue.message}`).join("\n"))
  }

  const tokens = deriveDesignTokens(readBrand(root) || createBrandTemplate(root))
  const body = await toReactNode(summary.tree as NormalizedDesignNode, tokens)
  const element = React.createElement("div", {
    style: {
      display: "flex",
      width: `${summary.size.width}px`,
      height: `${summary.size.height}px`,
      fontFamily: "Inter",
    },
  }, body)
  const svg = await satori(element, {
    width: summary.size.width,
    height: summary.size.height,
    fonts: loadFonts(),
  })

  mkdirSync(designRendersDir(root), { recursive: true })
  const format = input.format === "svg" ? "svg" : "png"
  const out = input.out
    ? resolve(root, input.out)
    : join(designRendersDir(root), `${summary.id}.${format}`)

  if (format === "svg") {
    writeFileSync(out, svg, "utf8")
  } else {
    const png = new Resvg(svg).render().asPng()
    writeFileSync(out, png)
  }

  const relativeOut = toRelative(root, out)
  appendDesignHistory({ ts: Date.now(), kind: "render", designId: summary.id, format, output: relativeOut }, root)
  appendDesignActivity("render.completed", `rendered ${summary.id} to ${format}`, "success", {
    id: summary.id,
    format,
    output: relativeOut,
  }, root)
  return {
    id: summary.id,
    format,
    path: relativeOut,
    width: summary.size.width,
    height: summary.size.height,
    warnings: summary.warnings,
  }
}

export function formatDesignList(items: DesignListEntry[]): string {
  if (items.length === 0) return "No design assets found."
  return items
    .map((item) => `${item.id}  ${item.width}x${item.height}  ${item.path}${item.intent ? `  ${item.intent}` : ""}`)
    .join("\n")
}
