import { readdir, readFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"

export type SkillScope = "project" | "personal"
export type SkillSource = "agents" | "claude"

export interface SkillInfo {
  id: string
  slug: string
  name: string
  description: string
  scope: SkillScope
  source: SkillSource
  skillPath: string
}

/**
 * Parse YAML frontmatter (between --- markers) from SKILL.md.
 * Extracts simple `name` and `description` fields.
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const yaml = match[1]
  const meta: { name?: string; description?: string } = {}
  for (const line of yaml.split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/)
    if (!kv) continue
    const key = kv[1]
    const value = kv[2]?.trim().replace(/^["']|["']$/g, "")
    if (!value) continue
    if (key === "name") meta.name = value
    if (key === "description") meta.description = value
  }
  return meta
}

async function scanSkillsDir(baseDir: string, scope: SkillScope, source: SkillSource): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = []
  try {
    const entries = await readdir(baseDir, { withFileTypes: true })
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))

    for (const slug of dirs) {
      const skillPath = join(baseDir, slug, "SKILL.md")
      try {
        const content = await readFile(skillPath, "utf-8")
        const meta = parseFrontmatter(content)
        skills.push({
          id: `${scope}:${slug}`,
          slug,
          name: meta.name || slug,
          description: meta.description || "",
          scope,
          source,
          skillPath,
        })
      } catch {
        // SKILL.md missing or unreadable; skip.
      }
    }
  } catch {
    // Directory does not exist or cannot be read; skip.
  }
  return skills
}

/**
 * Discover SKILL.md files from:
 * 1. <cwd>/.agents/skills
 * 2. <cwd>/.claude/skills
 * 3. ~/.claude/skills
 *
 * If duplicate skill slugs are found, project scope takes precedence.
 */
export async function listSkills(cwd = process.cwd()): Promise<SkillInfo[]> {
  const discovered = await Promise.all([
    scanSkillsDir(join(cwd, ".agents", "skills"), "project", "agents"),
    scanSkillsDir(join(cwd, ".claude", "skills"), "project", "claude"),
    scanSkillsDir(join(homedir(), ".claude", "skills"), "personal", "claude"),
  ])

  const seen = new Set<string>()
  const out: SkillInfo[] = []
  for (const list of discovered) {
    for (const skill of list) {
      if (seen.has(skill.slug)) continue
      seen.add(skill.slug)
      out.push(skill)
    }
  }
  return out
}
