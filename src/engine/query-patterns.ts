/**
 * Query pattern management for common browser automation tasks
 * Reduces token usage by providing reusable patterns for common sites
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { getTermlingsDir } from "./ipc.js"

export interface JqFilter {
  name: string
  jq: string
}

export interface QueryPattern {
  id: string
  name: string
  sites: string[]
  description: string
  pattern: {
    navigate: string
    wait_ms: number
    snapshot_options?: Record<string, unknown>
    filters: JqFilter[]
    example_output?: string
    tokens_saved?: number
  }
  usage?: string
  added_by?: string
  created_at?: string
}

/**
 * Get the query patterns directory
 */
export function getQueryPatternsDir(): string {
  return join(getTermlingsDir(), "browser", "query-patterns")
}

/**
 * Initialize query patterns directory with README
 */
export function initializeQueryPatterns(): void {
  const dir = getQueryPatternsDir()
  mkdirSync(dir, { recursive: true })

  const readmePath = join(dir, "README.md")
  if (!existsSync(readmePath)) {
    writeFileSync(
      readmePath,
      `# Query Patterns

Reusable patterns for common browser automation tasks.

## What are Query Patterns?

Query patterns capture proven, optimized automation workflows for specific sites or tasks. Instead of having agents explore and discover how to extract data, they can use pre-built patterns that:

- ✅ Reduce token usage by 90%+
- ✅ Improve reliability with battle-tested navigation/wait/filter sequences
- ✅ Speed up agent workflows (no exploration needed)
- ✅ Create institutional knowledge of common tasks

## Pattern Format

Each pattern is a JSON file defining:
- **navigate**: URL pattern with variables like {query}, {owner}, etc.
- **wait_ms**: Milliseconds to wait for content to load (usually 3000+)
- **filters**: jq expressions to extract relevant data
- **example_output**: Sample output for documentation

## Using Patterns

\`\`\`bash
# List available patterns
termlings browser patterns list

# View pattern details
termlings browser patterns view github-issues

# Execute pattern with parameters
termlings browser patterns execute github-issues --owner=anthropics --repo=claude-code
\`\`\`

## Creating Patterns

When an agent discovers a successful automation workflow, save it:

\`\`\`bash
termlings browser patterns save my-pattern \\
  --name="My Custom Pattern" \\
  --sites="example.com" \\
  --navigate="https://example.com/search?q={query}" \\
  --filters='[{"name":"results","jq":"..."}]'
\`\`\`

## Built-in Patterns

See individual .json files in this directory for available patterns.

## Performance Tips

- Use \`wait_ms: 3000\` or higher for sites with slow rendering
- Use \`snapshot_options: { "compact": true }\` to reduce snapshot size
- Use \`filters\` to extract only needed data (reduce token usage)
- Test patterns with different inputs before saving

## Contributing

When you discover a pattern that works well:
1. Document it thoroughly
2. Test with multiple variations
3. Save with \`termlings browser patterns save\`
4. Share with team
`
    )
  }
}

/**
 * List all available patterns
 */
export function listPatterns(): QueryPattern[] {
  const dir = getQueryPatternsDir()
  if (!existsSync(dir)) {
    return []
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "README.md")
  return files
    .map((file) => {
      try {
        const content = readFileSync(join(dir, file), "utf8")
        return JSON.parse(content) as QueryPattern
      } catch {
        return null
      }
    })
    .filter((p): p is QueryPattern => p !== null)
}

/**
 * Get a specific pattern by ID
 */
export function getPattern(id: string): QueryPattern | null {
  const dir = getQueryPatternsDir()
  const filePath = join(dir, `${id}.json`)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf8")
    return JSON.parse(content) as QueryPattern
  } catch {
    return null
  }
}

/**
 * Save a new pattern
 */
export function savePattern(pattern: QueryPattern): void {
  const dir = getQueryPatternsDir()
  mkdirSync(dir, { recursive: true })

  const filePath = join(dir, `${pattern.id}.json`)
  writeFileSync(filePath, JSON.stringify(pattern, null, 2) + "\n")
}

/**
 * Resolve pattern variables in a string
 * Replaces {var} with values from params object
 */
export function resolvePattern(template: string, params: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value)
  }
  return result
}

/**
 * Generate jq command with filter
 */
export function generateJqCommand(filter: JqFilter): string {
  // Escape single quotes in jq filter
  const escaped = filter.jq.replace(/'/g, "'\\''")
  return `| jq '${escaped}'`
}
