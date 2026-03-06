# Executive Team Template

C-suite executive team for an autonomous owner-led company.

## Agents

- **CEO** — Company strategy and executive execution
- **CTO** — Technology and engineering
- **CPO** — Product strategy and roadmap
- **CMO** — Go-to-market and growth
- **CFO** — Finance and planning

## Usage

```bash
termlings init --template executive-team
```

## Notes

- CEO coordinates cross-functional execution and final internal decisions.
- Each executive agent reports to `agent:ceo`.
- Team operates autonomously by default and only contacts `human:default` for credentials/env keys or key owner decisions.
