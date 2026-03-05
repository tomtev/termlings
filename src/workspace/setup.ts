import { spawnSync } from "child_process"
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { ensureWorkspaceDirs } from "./state.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const TEMPLATE_COPY_ALLOWLIST = ["agents", "humans", "store", "brand", "VISION.md", "README.md", "spawn.json", "emails.json"] as const

function templatesRoot(): string {
  return join(__dirname, "..", "..", "templates")
}

function isGitTemplateReference(templateRef: string): boolean {
  const value = templateRef.trim()
  return (
    value.startsWith("git+")
    || value.startsWith("https://")
    || value.startsWith("ssh://")
    || value.startsWith("git@")
    || value.startsWith("file://")
  )
}

function parseGitTemplateReference(templateRef: string): { remoteUrl: string; branchOrTag?: string } {
  const trimmed = templateRef.trim()
  const withoutPrefix = trimmed.startsWith("git+") ? trimmed.slice(4) : trimmed
  const hashIndex = withoutPrefix.lastIndexOf("#")
  if (hashIndex === -1) {
    return { remoteUrl: withoutPrefix }
  }

  const remoteUrl = withoutPrefix.slice(0, hashIndex).trim()
  const branchOrTag = withoutPrefix.slice(hashIndex + 1).trim()
  if (!remoteUrl) {
    throw new Error(`Invalid template reference "${templateRef}".`)
  }

  return {
    remoteUrl,
    branchOrTag: branchOrTag || undefined,
  }
}

function resolveTemplateSource(templateRef: string): { sourceRoot: string; displayName: string; cleanup: () => void } {
  const trimmed = templateRef.trim()
  if (!trimmed) {
    throw new Error("Template name is required.")
  }

  if (isGitTemplateReference(trimmed)) {
    const { remoteUrl, branchOrTag } = parseGitTemplateReference(trimmed)
    const tempRoot = mkdtempSync(join(tmpdir(), "termlings-template-"))
    const cloneRoot = join(tempRoot, "template")

    const cloneArgs = ["clone", "--depth", "1"]
    if (branchOrTag) {
      cloneArgs.push("--branch", branchOrTag)
    }
    cloneArgs.push(remoteUrl, cloneRoot)

    const result = spawnSync("git", cloneArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    if (result.status !== 0) {
      rmSync(tempRoot, { recursive: true, force: true })
      const details = (result.stderr || result.stdout || "unknown git error").trim()
      throw new Error(`Failed to clone template "${trimmed}": ${details}`)
    }

    return {
      sourceRoot: cloneRoot,
      displayName: trimmed,
      cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
    }
  }

  const sourceRoot = join(templatesRoot(), trimmed)
  if (!existsSync(sourceRoot)) {
    const available = listWorkspaceTemplates()
    const availableText = available.length > 0 ? available.join(", ") : "(none)"
    throw new Error(`Unknown template "${trimmed}". Available local templates: ${availableText}`)
  }

  return {
    sourceRoot,
    displayName: trimmed,
    cleanup: () => {},
  }
}

export function listWorkspaceTemplates(): string[] {
  const root = templatesRoot()
  if (!existsSync(root)) return []
  const entries = readdirSync(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b))
}

export function initializeWorkspaceFromTemplate(
  templateName: string,
  projectRoot = process.cwd(),
): { templateName: string; initialized: boolean; copiedEntries: string[] } {
  ensureWorkspaceDirs(projectRoot)

  const targetRoot = join(projectRoot, ".termlings")
  const copiedEntries: string[] = []

  const resolved = resolveTemplateSource(templateName)
  try {
    for (const entry of TEMPLATE_COPY_ALLOWLIST) {
      const sourcePath = join(resolved.sourceRoot, entry)
      if (!existsSync(sourcePath)) continue
      const targetPath = join(targetRoot, entry)
      cpSync(sourcePath, targetPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      })
      copiedEntries.push(entry)
    }
  } finally {
    resolved.cleanup()
  }

  if (copiedEntries.length === 0) {
    throw new Error(
      `Template "${resolved.displayName}" contains none of: ${TEMPLATE_COPY_ALLOWLIST.join(", ")}`,
    )
  }

  return { templateName: resolved.displayName, initialized: true, copiedEntries }
}
