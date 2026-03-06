# Features

Termlings feature flags control which capability areas appear in agent system context and which agent-facing commands are allowed at runtime.

This is not markdown-tag parsing. The feature model is structured and code-driven.

## Mental Model

There are three layers:

1. Built-in feature defaults in code.
2. Workspace overrides in `.termlings/workspace.json`.
3. Agent-specific overrides in `.termlings/workspace.json.features.agents.<slug>`.

The launcher resolves the final feature set for the current agent before building the injected system context.

If `.termlings/workspace.json` has no `features` key, every feature defaults to `true`.

## Feature Keys

Current togglable feature keys:

- `messaging`
- `requests`
- `org-chart`
- `brief`
- `task`
- `workflows`
- `calendar`
- `browser`
- `skills`
- `brand`
- `crm`

These are capability areas, not arbitrary markdown sections.

## Workspace Config

Feature flags live in `.termlings/workspace.json`:

```json
{
  "version": 1,
  "projectName": "my-project",
  "createdAt": 1772790000000,
  "updatedAt": 1772790000000,
  "settings": {
    "avatarSize": "large"
  },
  "features": {
    "defaults": {
      "crm": false,
      "browser": true
    },
    "agents": {
      "growth": {
        "crm": true
      },
      "developer": {
        "browser": false
      }
    }
  }
}
```

Resolution order:

1. Built-in defaults
2. `features.defaults`
3. `features.agents.<slug>`

Example behavior:

- no `features` object: all features enabled
- `features.defaults.crm = false`: CRM disabled for everyone
- `features.agents.growth.crm = true`: CRM re-enabled for `growth`

## Injection Path

Feature-aware context injection works like this:

1. `termlings spawn` resolves the target agent and runtime.
2. The launcher reads identity from `.termlings/agents/<slug>/SOUL.md`.
3. The launcher resolves workspace features for that agent.
4. The launcher renders the system context from structured code sections.
5. Disabled features are omitted from the rendered prompt.
6. The final prompt is injected into the runtime:
   - Claude: `--append-system-prompt "<context>"`
   - Codex: trailing injected prompt argument
7. `.termlings/VISION.md` is appended after the generated system context if present.

Current implementation points:

- feature resolution: `src/engine/features.ts`
- workspace feature storage: `src/workspace/state.ts`
- system context rendering: `src/system-context.ts`
- runtime injection: `src/agents/launcher.ts`

## What Gets Hidden

When a feature is disabled for an agent:

- the corresponding capability guidance is omitted from injected system context
- related command examples are omitted from quick reference sections
- the command can also be guarded at runtime

Current enforced example:

- `crm` is hidden from context when disabled
- `termlings crm ...` exits with a disabled-by-feature-flags error for that agent

## Why This Design

This design avoids:

- parsing markdown for feature sections
- custom `<tags>` inside docs
- prompt-only hiding without runtime enforcement

It keeps feature gating:

- structured
- testable
- workspace-configurable
- agent-specific

## Related Files

- [SPAWN.md](SPAWN.md)
- [MESSAGING.md](MESSAGING.md)
- [REQUESTS.md](REQUESTS.md)
- [LIFECYCLE.md](LIFECYCLE.md)
