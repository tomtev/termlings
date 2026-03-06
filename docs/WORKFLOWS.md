# Workflows

`termlings workflow` manages reusable workflow definitions and per-agent running copies.

The model is split in two:

- `.termlings/workflows/` stores the reusable workflow definition
- `.termlings/store/workflows/` stores the running copy with checked-off step state

That means the same workflow can be started, completed, reset, and started again without mutating the template.

## Storage Layout

```text
.termlings/
  workflows/
    org/
      release-deploy.json
    agents/
      developer/
        ship-feature.json
  store/
    workflows/
      developer/
        org__release-deploy.json
        agent__developer__ship-feature.json
```

## Commands

```bash
termlings workflow list
termlings workflow list --org
termlings workflow list --active
termlings workflow list --agent developer

termlings workflow show org/release-deploy
termlings workflow show agent:developer/ship-feature --agent developer

termlings workflow create '{"title":"Release deploy","scope":"org","steps":["Run tests","Deploy"]}'

termlings workflow start org/release-deploy
termlings workflow step done org/release-deploy step_1
termlings workflow step undo org/release-deploy step_1
termlings workflow reset org/release-deploy
termlings workflow stop org/release-deploy
```

## Reference Format

Workflow definitions use canonical references:

```text
org/<workflow-id>
agent:<agent-slug>/<workflow-id>
```

Examples:

```text
org/release-deploy
agent:developer/ship-feature
```

Inside an agent session, bare workflow IDs resolve against that agent first and then org workflows.

## Create Payload

Workflow creation is JSON-only. A workflow definition includes its full step list up front.

Minimal example:

```json
{
  "title": "Release deploy",
  "steps": ["Run tests", "Deploy"]
}
```

Full example:

```json
{
  "title": "Release deploy",
  "scope": "org",
  "steps": [
    { "text": "Run tests" },
    { "text": "Deploy" },
    { "text": "Post release update" }
  ]
}
```

Supported keys:

- `title`
- `scope`
- `owner`
- `steps`

## Running A Workflow

`start` creates a running copy for an agent under `.termlings/store/workflows/<agent>/`.

Step completion is written only to that running copy:

```bash
$ termlings workflow start org/release-deploy
✓ Workflow started: org/release-deploy

$ termlings workflow step done org/release-deploy step_1
✓ Step marked done: step_1
```

When the last step is marked done, the running copy is automatically marked `completed`. It remains visible until you stop it.

Useful lifecycle commands:

- `start` creates the running copy if it does not exist
- finishing the last step auto-marks the running copy as completed
- `reset` clears progress on the running copy
- `stop` removes the running copy

## Brief Integration

`termlings brief` shows:

- total workflow definitions
- org workflow definition count
- total active workflow runs
- the current agent's running workflows with progress

## When To Use Workflows

Use workflows when:

- the team needs a reusable checklist or SOP
- an agent should be able to start the same process multiple times
- step-level progress matters

Use tasks when:

- work needs ownership, status, dependencies, and notes
- the team is tracking outcomes, not just checklist execution
