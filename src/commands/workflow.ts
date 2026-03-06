/**
 * Workflow management commands
 */

import type { WorkflowCreateStep } from "../engine/workflows.js"

interface WorkflowJsonPayload {
  title: string
  scope?: string
  owner?: string
  steps: WorkflowCreateStep[]
}

function actorFromEnvironment(): { by: string; byName: string } {
  const slug = process.env.TERMLINGS_AGENT_SLUG?.trim()
  const agentName = process.env.TERMLINGS_AGENT_NAME?.trim()
  if (slug) {
    return {
      by: `agent:${slug}`,
      byName: agentName || slug,
    }
  }

  return {
    by: "human:default",
    byName: "Owner",
  }
}

function parseScope(input: string | undefined, fallback: "agent" | "org"): "agent" | "org" | null {
  if (!input || input.trim().length === 0) return fallback
  if (input === "agent" || input === "org") return input
  return null
}

function requireTargetAgent(agentSlug: string | undefined, message: string): string {
  const target = (agentSlug || "").trim()
  if (target) return target
  console.error(message)
  process.exit(1)
}

function parseWorkflowJson(raw: string): WorkflowJsonPayload {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object")
  }

  if (typeof parsed.title !== "string" || parsed.title.trim().length === 0) {
    throw new Error("`title` is required")
  }

  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("`steps` must be a non-empty array")
  }

  const steps = parsed.steps.map((step, index) => {
    if (typeof step === "string" && step.trim().length > 0) {
      return { text: step }
    }

    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new Error(`Step ${index + 1} must be a string or object`)
    }

    const input = step as Record<string, unknown>
    if (typeof input.text !== "string" || input.text.trim().length === 0) {
      throw new Error(`Step ${index + 1} is missing text`)
    }

    return { text: input.text }
  })

  return {
    title: parsed.title,
    scope: typeof parsed.scope === "string" ? parsed.scope : undefined,
    owner: typeof parsed.owner === "string" ? parsed.owner : undefined,
    steps,
  }
}

export async function handleWorkflow(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const {
    createWorkflow,
    formatWorkflow,
    formatWorkflowList,
    formatWorkflowRef,
    formatWorkflowRunList,
    getAgentWorkflows,
    getAgentWorkflowRuns,
    getAllWorkflowRuns,
    getAllWorkflows,
    getOrgWorkflows,
    getWorkflow,
    getWorkflowRun,
    resetWorkflowRun,
    setWorkflowRunStepDone,
    startWorkflow,
    stopWorkflowRun,
    workflowRunCompleted,
  } = await import("../engine/workflows.js")

  const subcommand = positional[1]
  const currentAgentSlug = process.env.TERMLINGS_AGENT_SLUG || ""

  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    console.log(`
🧭 Workflow - Reusable workflow templates with per-agent running state

Create a workflow definition once, then start it whenever an agent needs to follow it.
Step completion is written to the running copy under .termlings/store/workflows/.
When the last step is marked done, the running copy is automatically marked completed and stays visible until stopped.

COMMANDS:
  termlings workflow list                          List workflow definitions
  termlings workflow list --active                List active workflow runs
  termlings workflow show <ref>                   Show a workflow and current run state
  termlings workflow create <json-payload>        Create a workflow definition from JSON
  termlings workflow start <ref>                  Start a workflow for the current agent
  termlings workflow reset <ref>                  Reset the current agent's running copy
  termlings workflow stop <ref>                   Stop and clear the running copy
  termlings workflow step done <ref> <step-id>    Mark a step done on the running copy
  termlings workflow step undo <ref> <step-id>    Mark a step not done on the running copy

REFERENCE SYNTAX:
  org/<id>
  agent:<slug>/<id>

OPTIONS:
  --org               List only org workflow definitions
  --agent <slug>      Target a specific agent for list/show/start/reset/stop/step
  --scope org|agent   Override scope when creating from JSON

EXAMPLES:
  $ termlings workflow create '{"title":"Release deploy","scope":"org","steps":["Run tests","Deploy"]}'
  ✓ Workflow created: org/release-deploy

  $ termlings workflow start org/release-deploy
  ✓ Workflow started: org/release-deploy

  $ termlings workflow step done org/release-deploy step_1
  ✓ Step marked done: step_1

  $ termlings workflow reset org/release-deploy
  ✓ Workflow reset: org/release-deploy
`)
    return
  }

  if (subcommand === "list") {
    if (flags.has("active")) {
      if (opts.agent) {
        console.log(formatWorkflowRunList(getAgentWorkflowRuns(opts.agent).filter((run) => !workflowRunCompleted(run))))
        return
      }
      if (currentAgentSlug) {
        console.log(formatWorkflowRunList(getAgentWorkflowRuns(currentAgentSlug).filter((run) => !workflowRunCompleted(run))))
        return
      }
      console.log(formatWorkflowRunList(getAllWorkflowRuns().filter((run) => !workflowRunCompleted(run))))
      return
    }

    const currentRuns = currentAgentSlug ? getAgentWorkflowRuns(currentAgentSlug) : []
    const scopeOpt = opts.scope?.trim()
    if (flags.has("org") || scopeOpt === "org") {
      console.log(formatWorkflowList(getOrgWorkflows(), currentRuns))
      return
    }

    if (opts.agent) {
      console.log(formatWorkflowList(getAgentWorkflows(opts.agent), getAgentWorkflowRuns(opts.agent)))
      return
    }

    if (scopeOpt === "agent") {
      const targetAgent = requireTargetAgent(currentAgentSlug, "Usage: termlings workflow list --scope agent --agent <slug>")
      console.log(formatWorkflowList(getAgentWorkflows(targetAgent), getAgentWorkflowRuns(targetAgent)))
      return
    }

    if (currentAgentSlug) {
      console.log(formatWorkflowList([
        ...getOrgWorkflows(),
        ...getAgentWorkflows(currentAgentSlug),
      ], currentRuns))
      return
    }

    console.log(formatWorkflowList(getAllWorkflows()))
    return
  }

  if (subcommand === "show") {
    const workflowRef = positional[2]
    if (!workflowRef) {
      console.error("Usage: termlings workflow show <ref>")
      process.exit(1)
    }

    const targetAgent = (opts.agent || currentAgentSlug || "").trim()
    const workflow = getWorkflow(workflowRef, targetAgent || currentAgentSlug)
    if (!workflow) {
      console.error(`Workflow not found: ${workflowRef}`)
      process.exit(1)
    }

    const run = targetAgent ? getWorkflowRun(workflowRef, targetAgent) : null
    console.log(formatWorkflow(workflow, run))
    return
  }

  if (subcommand === "create") {
    let payload: WorkflowJsonPayload
    const rawJson = positional[2]
    if (!rawJson || !rawJson.trim().startsWith("{")) {
      console.error("Usage: termlings workflow create '{\"title\":\"...\",\"steps\":[...]}'")
      process.exit(1)
    }

    try {
      payload = parseWorkflowJson(rawJson)
    } catch (error) {
      console.error(`Invalid workflow JSON: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }

    const defaultScope = currentAgentSlug ? "agent" : "org"
    const scope = parseScope(opts.scope || payload.scope, defaultScope)
    if (!scope) {
      console.error(`Invalid scope: ${opts.scope || payload.scope}`)
      console.error("Expected one of: agent, org")
      process.exit(1)
    }

    const owner = scope === "agent" ? (opts.agent || payload.owner || currentAgentSlug) : undefined
    if (scope === "agent" && !owner) {
      console.error("Agent workflow definitions require an owner slug. Use --agent <slug> or set `owner` in the JSON payload.")
      process.exit(1)
    }

    const actor = actorFromEnvironment()
    const workflow = createWorkflow(payload.title, {
      scope,
      owner,
      creator: {
        createdBy: actor.by,
        createdByName: actor.byName,
      },
      steps: payload.steps,
    })

    if (!workflow) {
      console.error("Failed to create workflow")
      process.exit(1)
    }

    console.log(`✓ Workflow created: ${formatWorkflowRef(workflow)}`)
    return
  }

  if (subcommand === "start") {
    const workflowRef = positional[2]
    if (!workflowRef) {
      console.error("Usage: termlings workflow start <ref> [--agent <slug>]")
      process.exit(1)
    }

    const targetAgent = requireTargetAgent(opts.agent || currentAgentSlug, "Workflow start requires an agent context. Use --agent <slug> outside an agent session.")
    const existing = getWorkflowRun(workflowRef, targetAgent)
    if (existing) {
      console.log(`✓ Workflow already running: ${existing.workflowRef}`)
      return
    }

    const run = startWorkflow(workflowRef, targetAgent)
    if (!run) {
      console.error(`Workflow not found: ${workflowRef}`)
      process.exit(1)
    }

    console.log(`✓ Workflow started: ${run.workflowRef}`)
    return
  }

  if (subcommand === "reset") {
    const workflowRef = positional[2]
    if (!workflowRef) {
      console.error("Usage: termlings workflow reset <ref> [--agent <slug>]")
      process.exit(1)
    }

    const targetAgent = requireTargetAgent(opts.agent || currentAgentSlug, "Workflow reset requires an agent context. Use --agent <slug> outside an agent session.")
    const run = resetWorkflowRun(workflowRef, targetAgent)
    if (!run) {
      console.error(`No running workflow found for ${targetAgent}: ${workflowRef}`)
      process.exit(1)
    }

    console.log(`✓ Workflow reset: ${run.workflowRef}`)
    return
  }

  if (subcommand === "stop") {
    const workflowRef = positional[2]
    if (!workflowRef) {
      console.error("Usage: termlings workflow stop <ref> [--agent <slug>]")
      process.exit(1)
    }

    const targetAgent = requireTargetAgent(opts.agent || currentAgentSlug, "Workflow stop requires an agent context. Use --agent <slug> outside an agent session.")
    if (!stopWorkflowRun(workflowRef, targetAgent)) {
      console.error(`No running workflow found for ${targetAgent}: ${workflowRef}`)
      process.exit(1)
    }

    console.log(`✓ Workflow stopped: ${workflowRef}`)
    return
  }

  if (subcommand === "step") {
    const action = positional[2]
    const workflowRef = positional[3]
    const stepId = positional[4]
    if (!workflowRef || !stepId || (action !== "done" && action !== "undo")) {
      console.error("Usage: termlings workflow step <done|undo> <ref> <step-id> [--agent <slug>]")
      process.exit(1)
    }

    const targetAgent = requireTargetAgent(opts.agent || currentAgentSlug, "Workflow step updates require an agent context. Use --agent <slug> outside an agent session.")
    const actor = actorFromEnvironment()
    const run = setWorkflowRunStepDone(workflowRef, stepId, action === "done", actor, targetAgent)
    if (!run) {
      console.error(`Running workflow or step not found for ${targetAgent}: ${workflowRef} ${stepId}`)
      process.exit(1)
    }

    console.log(`✓ Step marked ${action === "done" ? "done" : "not done"}: ${stepId}`)
    return
  }

  console.error("Usage: termlings workflow <list|show|create|start|reset|stop|step>")
  process.exit(1)
}
