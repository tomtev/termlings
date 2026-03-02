import { cpSync, existsSync, readdirSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { ensureWorkspaceDirs } from "./state.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const TEMPLATE_COPY_ALLOWLIST = ["agents", "humans", "store", "objects", "OBJECTIVES.md", "README.md", "spawn.json"] as const

function templatesRoot(): string {
  return join(__dirname, "..", "..", "templates")
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

  const sourceRoot = join(templatesRoot(), templateName)
  const targetRoot = join(projectRoot, ".termlings")
  const copiedEntries: string[] = []

  if (!existsSync(sourceRoot)) {
    return { templateName, initialized: true, copiedEntries }
  }

  for (const entry of TEMPLATE_COPY_ALLOWLIST) {
    const sourcePath = join(sourceRoot, entry)
    if (!existsSync(sourcePath)) continue
    const targetPath = join(targetRoot, entry)
    cpSync(sourcePath, targetPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    })
    copiedEntries.push(entry)
  }

  return { templateName, initialized: true, copiedEntries }
}
