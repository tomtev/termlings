function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (!input) return fallback
  const value = Number.parseInt(input, 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid number: ${input}`)
  }
  return value
}

export async function handleEval(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    buildEvalReport,
    compareEvalStrategies,
    formatEvalCompare,
    formatEvalReport,
    formatEvalRun,
    formatEvalStrategies,
    formatEvalTask,
    formatEvalTasks,
    getEvalTask,
    listEvalStrategies,
    listEvalTasks,
    runEvalTask,
  } = await import("../engine/eval.js")

  const subcommand = positional[1] || "list"

  if (flags.has("help") || subcommand === "help") {
    console.log(`
Eval - Verified outcome-per-token benchmark runs

Operator-facing eval harness for comparing Termlings strategies with real tasks,
explicit verification, and file-backed run reports.

USAGE:
  termlings eval list
  termlings eval show <task-id> [--json]
  termlings eval strategies [--json]
  termlings eval run <task-id> [--strategy <id>] [--json]
  termlings eval compare <strategy-a> <strategy-b> [--task <task-id>] [--json]
  termlings eval report [--last 20] [--json]

EXAMPLES:
  termlings eval list
  termlings eval show brief-json-smoke
  termlings eval strategies
  termlings eval run brief-json-smoke --strategy concise-app-scoped
  termlings eval compare concise-app-scoped full-brief --task brief-json-smoke
  termlings eval report --last 20

NOTES:
  - Eval is operator-facing and hidden from normal agent sessions.
  - Seeded tasks live under .termlings/store/evals/tasks.
  - Runnable tasks can execute real commands and verify artifacts locally.
  - Benchmark templates can be edited into runnable tasks as needed.
`)
    return
  }

  try {
    if (subcommand === "list") {
      const tasks = listEvalTasks()
      if (flags.has("json")) printJson(tasks)
      else console.log(formatEvalTasks(tasks))
      return
    }

    if (subcommand === "show") {
      const taskId = (positional[2] || "").trim()
      if (!taskId) throw new Error("Usage: termlings eval show <task-id>")
      const task = getEvalTask(taskId)
      if (!task) throw new Error(`Eval task not found: ${taskId}`)
      if (flags.has("json")) printJson(task)
      else console.log(formatEvalTask(task))
      return
    }

    if (subcommand === "strategies") {
      const strategies = listEvalStrategies()
      if (flags.has("json")) printJson(strategies)
      else console.log(formatEvalStrategies(strategies))
      return
    }

    if (subcommand === "run") {
      const taskId = (positional[2] || "").trim()
      if (!taskId) throw new Error("Usage: termlings eval run <task-id> [--strategy <id>]")
      const run = await runEvalTask(taskId, { strategyId: opts.strategy })
      if (flags.has("json")) printJson(run)
      else console.log(formatEvalRun(run))
      return
    }

    if (subcommand === "compare") {
      const strategyA = (positional[2] || "").trim()
      const strategyB = (positional[3] || "").trim()
      if (!strategyA || !strategyB) {
        throw new Error("Usage: termlings eval compare <strategy-a> <strategy-b> [--task <task-id>]")
      }
      const result = compareEvalStrategies(strategyA, strategyB, { taskId: opts.task })
      if (flags.has("json")) printJson(result)
      else console.log(formatEvalCompare(result))
      return
    }

    if (subcommand === "report") {
      const report = buildEvalReport({ last: parsePositiveInt(opts.last, 20) })
      if (flags.has("json")) printJson(report)
      else console.log(formatEvalReport(report))
      return
    }

    console.error(`Unknown eval command: ${subcommand}`)
    console.error("Run: termlings eval --help")
    process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
