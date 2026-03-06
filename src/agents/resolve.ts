export interface ResolvableAgent {
  slug: string
  name?: string
  title?: string
  titleShort?: string
  dna?: string
}

export interface ResolvedAgent {
  agent: ResolvableAgent
  matchedBy: "slug" | "dna" | "name" | "title" | "titleShort"
}

function normalizeToken(value: string | undefined): string {
  return (value || "").trim().replace(/^['"]|['"]$/g, "").toLowerCase()
}

export function resolveAgentToken(
  token: string,
  agents: ResolvableAgent[],
): ResolvedAgent | { error: "ambiguous" | "not_found" } {
  const normalized = normalizeToken(token)
  if (!normalized) return { error: "not_found" }

  const slugMatch = agents.find((agent) => normalizeToken(agent.slug) === normalized)
  if (slugMatch) return { agent: slugMatch, matchedBy: "slug" }

  const dnaMatch = agents.find((agent) => normalizeToken(agent.dna) === normalized)
  if (dnaMatch) return { agent: dnaMatch, matchedBy: "dna" }

  const candidateMatches = new Map<string, ResolvedAgent>()
  for (const agent of agents) {
    const keys: Array<[ResolvedAgent["matchedBy"], string | undefined]> = [
      ["name", agent.name],
      ["title", agent.title],
      ["titleShort", agent.titleShort],
    ]
    for (const [matchedBy, value] of keys) {
      if (!value || normalizeToken(value) !== normalized) continue
      candidateMatches.set(agent.slug, { agent, matchedBy })
    }
  }

  if (candidateMatches.size === 1) {
    return Array.from(candidateMatches.values())[0]
  }

  return { error: candidateMatches.size > 1 ? "ambiguous" : "not_found" }
}
