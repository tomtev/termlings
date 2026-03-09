# Media Workflows PRD

Status: planned

`media workflows` should be a workflow layer inside the future `media` app.

The goal is to let agents chain image and video generation steps into reusable local workflows without exposing raw provider-specific graph formats.

This should take inspiration from systems like fal workflows:

- explicit step graphs
- intermediate outputs
- references between steps
- async run events

But the actual workflow format should be Termlings-owned and file-based.

## Goal

Termlings should let agents and operators:

1. define reusable media generation workflows in local files
2. chain image and video steps together
3. pass outputs from one step into later steps
4. inspect workflow runs and step events from local files
5. surface workflow progress in the shared activity feed

## Why Not Raw Provider Workflows

Provider-native workflow JSON is the wrong source of truth for Termlings.

Reasons:

- it couples local product behavior to a single provider
- it is often too low-level for agents
- it makes local storage and future provider swaps harder
- it does not fit the existing file-based Termlings app model

So the workflow should be:

- Termlings-owned
- provider-agnostic at the top level
- adapter-driven underneath

## Relationship To Other Apps

`media workflows` belongs inside `media`, not as a separate app.

The split should be:

- `media`
  image generation, video generation, media jobs, workflow runs
- `ads`
  campaign operations and creative deployment

`ads` can consume workflow outputs, but should not own generation graphs.

## Storage Layout

```text
.termlings/
  store/
    media/
      workflows/
        launch-teaser.json
        ad-creative-batch.json
      runs/
        run_abc123.json
        run_abc123.events.jsonl
      outputs/
        img_abc123.png
        vid_abc123.mp4
```

## Workflow Shape

Example:

```json
{
  "id": "launch-teaser",
  "type": "media-workflow",
  "inputs": {
    "prompt": { "type": "string" },
    "brand": { "type": "string", "default": "default" }
  },
  "steps": [
    {
      "id": "hero",
      "kind": "image.generate",
      "provider": "google",
      "model": "nano-banana-2",
      "input": {
        "prompt": "$input.prompt",
        "brand": "$input.brand"
      }
    },
    {
      "id": "teaser",
      "kind": "video.generate",
      "provider": "google",
      "model": "veo-3",
      "dependsOn": ["hero"],
      "input": {
        "prompt": "8 second teaser based on $input.prompt",
        "image": "$hero.output.path",
        "brand": "$input.brand"
      }
    }
  ],
  "output": {
    "video": "$teaser.output.path"
  }
}
```

## Core Concepts

### Inputs

Workflow inputs are declared up front and passed at run time.

Examples:

- `prompt`
- `brand`
- `aspect`
- `duration`
- `referenceImage`

### Steps

Each step should have:

- `id`
- `kind`
- `provider`
- `model`
- `input`
- optional `dependsOn`

### References

Later steps should be able to reference:

- workflow inputs
- outputs from earlier steps

Reference examples:

- `$input.prompt`
- `$hero.output.path`
- `$hero.output.id`

### Output Mapping

The workflow should explicitly declare the final public outputs so downstream tools know what to use.

## Run Model

Every workflow execution should create a run record.

Example run envelope:

```json
{
  "id": "run_abc123",
  "workflowId": "launch-teaser",
  "status": "running",
  "inputs": {
    "prompt": "AI startup teaser",
    "brand": "default"
  },
  "steps": {
    "hero": {
      "status": "completed",
      "jobId": "img_abc123",
      "output": {
        "path": ".termlings/store/media/outputs/img_abc123.png"
      }
    },
    "teaser": {
      "status": "running",
      "jobId": "vid_abc123"
    }
  },
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000
}
```

## Run Events

Each run should also keep an append-only JSONL event file.

Example events:

- `run.started`
- `step.started`
- `step.completed`
- `step.failed`
- `run.completed`
- `run.failed`

Example event:

```json
{
  "ts": 1770000000000,
  "runId": "run_abc123",
  "stepId": "hero",
  "kind": "step.completed",
  "text": "hero completed",
  "meta": {
    "jobId": "img_abc123",
    "path": ".termlings/store/media/outputs/img_abc123.png"
  }
}
```

## CLI Shape

```bash
termlings media workflow list
termlings media workflow show <id>
termlings media workflow run <id>
termlings media workflow runs
termlings media workflow logs <run-id>
termlings media workflow cancel <run-id>
```

Useful flags:

```bash
--input key=value
--json
--wait
```

## Examples

```bash
termlings media workflow list
termlings media workflow show launch-teaser
termlings media workflow run launch-teaser --input prompt="AI startup teaser" --input brand=default
termlings media workflow logs run_abc123
```

## Activity Feed

Media workflow runs should emit shared app activity like:

- `media.workflow.run.started`
- `media.workflow.step.started`
- `media.workflow.step.completed`
- `media.workflow.step.failed`
- `media.workflow.run.completed`
- `media.workflow.run.failed`

This should use the existing shared activity system instead of custom TUI logic.

## Provider Boundary

Workflows should orchestrate media providers, not replace them.

That means:

- `image.generate` steps delegate to the `media` provider adapter
- `video.generate` steps delegate to the `media` provider adapter
- workflow logic should be local orchestration only

## V1 Boundary

Keep v1 narrow:

- stored JSON workflows
- DAG-like step ordering with `dependsOn`
- input references
- output references
- image + video generation steps only
- run records and JSONL event logs
- shared app activity events

Do not add in v1:

- branching conditions
- loops
- human approval nodes
- arbitrary script nodes
- provider-native graph passthrough

## Success Criteria

V1 is successful if:

- a workflow can generate an image, then a video from that image
- runs are inspectable from local files
- agents can reuse workflows without rewriting prompts every time
- the model stays provider-agnostic at the workflow level
- later apps like `ads` can consume workflow outputs cleanly
