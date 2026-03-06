import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createWorkflow,
  formatWorkflowRef,
  getAgentWorkflows,
  getAgentWorkflowRuns,
  getAllWorkflows,
  getOrgWorkflows,
  getWorkflow,
  getWorkflowRun,
  resetWorkflowRun,
  setWorkflowRunStepDone,
  startWorkflow,
  stopWorkflowRun,
  workflowRunProgress,
} from "../workflows.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("workflow storage", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-workflow-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("creates canonical workflow directories during workspace setup", () => {
    ensureWorkspaceDirs(root)
    expect(existsSync(join(root, ".termlings", "workflows", "org"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "workflows", "agents"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "workflows"))).toBe(true)
  })

  it("creates org and agent workflows as separate files", () => {
    const orgWorkflow = createWorkflow("Release deploy", {
      scope: "org",
      creator: { createdBy: "human:default", createdByName: "Owner" },
      steps: [{ text: "Run tests" }, { text: "Deploy" }],
    }, root)
    const agentWorkflow = createWorkflow("Ship feature 123", {
      scope: "agent",
      owner: "developer",
      creator: { createdBy: "agent:developer", createdByName: "Developer" },
      steps: [{ text: "Write tests" }, { text: "Implement feature" }],
    }, root)

    expect(orgWorkflow).not.toBeNull()
    expect(agentWorkflow).not.toBeNull()
    expect(formatWorkflowRef(orgWorkflow!)).toBe("org/release-deploy")
    expect(formatWorkflowRef(agentWorkflow!)).toBe("agent:developer/ship-feature-123")
    expect(getOrgWorkflows(root).map((workflow) => workflow.id)).toEqual(["release-deploy"])
    expect(getAgentWorkflows("developer", root).map((workflow) => workflow.id)).toEqual(["ship-feature-123"])
    expect(getAllWorkflows(root).map((workflow) => formatWorkflowRef(workflow))).toEqual([
      "org/release-deploy",
      "agent:developer/ship-feature-123",
    ])
  })

  it("starts, updates, resets, and stops a running workflow copy", () => {
    const created = createWorkflow("Ship feature 123", {
      scope: "agent",
      owner: "developer",
      creator: { createdBy: "agent:developer", createdByName: "Developer" },
      steps: [{ text: "Write tests" }, { text: "Implement feature" }],
    }, root)
    expect(created).not.toBeNull()

    const ref = "agent:developer/ship-feature-123"
    const started = startWorkflow(ref, "developer", root)
    expect(started?.steps.map((step) => step.id)).toEqual(["step_1", "step_2"])

    const done = setWorkflowRunStepDone(ref, "step_1", true, {
      by: "agent:developer",
      byName: "Developer",
    }, "developer", root)
    expect(done?.steps[0]).toMatchObject({
      id: "step_1",
      text: "Write tests",
      done: true,
      doneBy: "agent:developer",
      doneByName: "Developer",
    })
    expect(workflowRunProgress(done!)).toEqual({ done: 1, total: 2 })
    expect(getAgentWorkflowRuns("developer", root)).toHaveLength(1)
    expect(getWorkflowRun(ref, "developer", root)?.steps[0]?.done).toBe(true)

    const completed = setWorkflowRunStepDone(ref, "step_2", true, {
      by: "agent:developer",
      byName: "Developer",
    }, "developer", root)
    expect(completed?.status).toBe("completed")
    expect(completed?.completedBy).toBe("agent:developer")
    expect(getWorkflowRun(ref, "developer", root)?.status).toBe("completed")

    const reset = resetWorkflowRun(ref, "developer", root)
    expect(reset?.steps[0]).toMatchObject({
      id: "step_1",
      done: false,
    })
    expect(reset?.status).toBe("active")
    expect(stopWorkflowRun(ref, "developer", root)).toBe(true)
    expect(getWorkflowRun(ref, "developer", root)).toBeNull()
  })

  it("creates a workflow with initial JSON-style steps", () => {
    const workflow = createWorkflow("Release deploy", {
      scope: "org",
      creator: { createdBy: "human:default", createdByName: "Owner" },
      steps: [
        { text: "Run tests" },
        { text: "Deploy" },
      ],
    }, root)

    expect(workflow).not.toBeNull()
    expect(workflow?.steps).toHaveLength(2)
    expect(workflow?.steps[0]).toMatchObject({ id: "step_1", text: "Run tests" })
    expect(workflow?.steps[1]).toMatchObject({ id: "step_2", text: "Deploy" })
    expect(getWorkflow("org/release-deploy", "", root)?.steps[0]).toMatchObject({ id: "step_1", text: "Run tests" })
  })
})
