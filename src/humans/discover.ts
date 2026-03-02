import { join } from "path"
import { readdirSync, existsSync, readFileSync } from "fs"

export interface LocalHuman {
  name: string
  path: string
  soul?: {
    name: string
    title?: string
    role?: string
    team?: string
    reports_to?: string
    purpose?: string
    description?: string
  }
}

/**
 * Discover humans in .termlings/humans/ directory
 */
export function discoverLocalHumans(): LocalHuman[] {
  const humans: LocalHuman[] = []
  const humansDir = join(process.cwd(), ".termlings", "humans")

  if (!existsSync(humansDir)) return humans

  try {
    const entries = readdirSync(humansDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // Skip hidden directories
      if (entry.name.startsWith(".")) continue

      const humanPath = join(humansDir, entry.name)
      const soulPath = join(humanPath, "SOUL.md")

      // Only consider it a human if SOUL.md exists
      if (!existsSync(soulPath)) continue

      let soul: LocalHuman["soul"] | undefined
      try {
        const content = readFileSync(soulPath, "utf-8")

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
        if (!frontmatterMatch) continue
        const yaml = frontmatterMatch[1]
        const name = yaml.match(/^name:\s*(.+)$/m)?.[1]
        const title = yaml.match(/^title:\s*(.+)$/m)?.[1]
        const role = yaml.match(/^role:\s*(.+)$/m)?.[1]
        const team = yaml.match(/^team:\s*(.+)$/m)?.[1]
        const reports_to = yaml.match(/^reports_to:\s*(.+)$/m)?.[1]
        const description = (frontmatterMatch[2] || "").trim()

        if (name) {
          soul = {
            name,
            title,
            role,
            team,
            reports_to,
            description,
          }

          humans.push({
            name: entry.name,
            path: humanPath,
            soul,
          })
        }
      } catch {}
    }
  } catch {}

  return humans
}

/**
 * Get the default human (operator/owner)
 */
export function getDefaultHuman(): LocalHuman | null {
  const humans = discoverLocalHumans()
  // Look for "default" human first, otherwise return first human
  const defaultHuman = humans.find((h) => h.name === "default")
  return defaultHuman || humans[0] || null
}

/**
 * Get human identity for environment variables
 */
export function getHumanIdentity(): { name: string; title: string } {
  const human = getDefaultHuman()
  if (!human?.soul) {
    return { name: "Operator", title: "Founder" }
  }
  return {
    name: human.soul.name || "Operator",
    title: human.soul.title || "Founder",
  }
}
