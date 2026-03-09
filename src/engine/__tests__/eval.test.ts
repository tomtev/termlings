import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import {
  buildEvalReport,
  compareEvalStrategies,
  ensureEvalDirs,
  getEvalTask,
  listEvalStrategies,
  listEvalTasks,
  runEvalTask,
  saveEvalTask,
} from "../eval.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "termlings-eval-test-"))
}

describe("eval app", () => {
  it("creates seeded eval tasks and strategies", () => {
    const root = makeRoot()
    try {
      ensureWorkspaceDirs(root)
      ensureEvalDirs(root)

      const tasks = listEvalTasks(root)
      const strategies = listEvalStrategies(root)

      expect(tasks.length).toBeGreaterThan(0)
      expect(tasks.some((task) => task.id === "brief-json-smoke")).toBe(true)
      expect(strategies.some((strategy) => strategy.id === "concise-app-scoped")).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("runs a custom eval task, verifies output, and reports comparisons", async () => {
    const root = makeRoot()
    try {
      ensureWorkspaceDirs(root)
      ensureEvalDirs(root)

      const task = saveEvalTask({
        id: "custom-json-smoke",
        title: "Custom JSON smoke",
        kind: "smoke",
        description: "Write a brief-shaped JSON artifact and metrics file.",
        runnable: true,
        entry: {
          type: "command",
          agent: "pm",
          command: `node -e 'const fs=require("fs");const artifact=process.env.TERMLINGS_EVAL_ARTIFACTS_DIR+"/brief.json";const metrics=process.env.TERMLINGS_EVAL_METRICS_PATH;fs.writeFileSync(artifact, JSON.stringify({generatedAt:1,workspace:{root:"/tmp/demo",project:"demo"},session:{agentSlug:null},apps:{messaging:true}}));fs.writeFileSync(metrics, JSON.stringify({inputTokens:10,outputTokens:5,commands:1,filesWritten:1}));'`,
        },
        apps: ["brief", "messaging"],
        verification: {
          type: "json",
          path: "artifacts/brief.json",
          requiredPaths: ["generatedAt", "workspace.root", "workspace.project", "apps.messaging"],
        },
        tags: ["smoke"],
      }, root)

      const runA = await runEvalTask(task.id, { strategyId: "concise-app-scoped", root })
      const runB = await runEvalTask(task.id, { strategyId: "full-brief", root })

      expect(runA.status).toBe("completed")
      expect(runA.result.verified).toBe(true)
      expect(runA.metrics.totalTokens).toBe(15)

      expect(runB.status).toBe("completed")
      expect(runB.result.verified).toBe(true)

      const comparison = compareEvalStrategies("concise-app-scoped", "full-brief", {
        taskId: task.id,
        root,
      })
      expect(comparison.strategyA.runs).toBe(1)
      expect(comparison.strategyB.runs).toBe(1)

      const report = buildEvalReport({ last: 10, root })
      expect(report.totalRuns).toBeGreaterThanOrEqual(2)
      expect(report.verifiedRuns).toBeGreaterThanOrEqual(2)
      expect(report.byTask.some((entry) => entry.taskId === task.id)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("seeds a runnable smoke task that uses the current Termlings binary env", () => {
    const root = makeRoot()
    try {
      ensureWorkspaceDirs(root)
      ensureEvalDirs(root)
      const task = getEvalTask("brief-json-smoke", root)
      expect(task?.runnable).toBe(true)
      expect(task?.entry.command?.includes("TERMLINGS_EVAL_NODE_BIN")).toBe(true)
      expect(task?.entry.command?.includes("TERMLINGS_EVAL_TERMLINGS_SCRIPT")).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
