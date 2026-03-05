/**
 * Each supported coding agent provides an adapter
 * that tells the launcher how to spawn it and inject the termling context.
 *
 * All CLI flags after the agent name are passed through directly to the
 * agent binary — the adapter only handles context injection.
 */
export interface AgentAdapter {
  /** Binary / command name to spawn (for example "claude", "codex") */
  bin: string

  /** Fallback display name when no explicit name or SOUL.md name is found */
  defaultName: string

  /**
   * Return extra args to prepend for injecting the termling context.
   * Everything the user typed after `termlings <agent>` is appended after these.
   */
  contextArgs(context: string): string[]
}
