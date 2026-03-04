# Personal Assistant Template

Single-agent setup focused on founder support, coordination, and agent operations.

## Contents

- **Agent**: 1 personal assistant (`agent:personal-assistant`)
- **Human owner**: Owner profile (`human:default`)
- **VISION.md**: Assistant operating direction
- **spawn.json**: Runtime defaults for the assistant

## Usage

```bash
termlings init --template personal-assistant
```

## Highlights

The personal assistant is explicitly instructed to create, configure, and manage agents as needed for your goals.
`agent:personal-assistant` has `manage_agents: true` by default.
