# Executeive Team Template

Executive leadership team for an autonomous owner-led company.

## Contents

- **Agents**: 5 executive roles
  - CEO (autonomous company lead)
  - CTO (technology and engineering)
  - CPO (product strategy)
  - CMO (go-to-market and growth)
  - CFO (finance and planning)
- **Human owner**: Owner profile (`human:default`)
- **VISION.md**: Company-level operating direction
- **spawn.json**: Runtime defaults for all executive agents

## Usage

```bash
termlings init --template executeive-team
```

## Notes

- CEO coordinates cross-functional execution and final internal decisions.
- Each executive agent reports to `agent:ceo`.
- Team operates autonomously by default and only contacts `human:default` for credentials/env keys or key owner decisions.
- All executive agents have `manage_agents: true` and can run agent lifecycle commands.
