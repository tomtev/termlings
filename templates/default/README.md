# Default Template

A complete starter workspace for a 5-person SaaS team.

## Contents

- **Agents**: 5 pre-configured team members
  - PM (Vision & Prioritization, day-to-day lead)
  - Designer (UX & Visual Design)
  - Developer (Build & Ship)
  - Growth (Customer & Adoption)
  - Support (Operations)
- **Human owner**: Owner profile (`human:default`) for strategy, approvals, and credentials
- **VISION.md**: Small project vision document injected into all agent contexts
- **.termlings/brand/brand.json**: Basic brand profile for voice/colors/logos/domain/email
- **Store**: Empty directories for tasks, calendar, and messages
- **Browser runtime**: `.termlings/browser/` is created for browser process state and logs

## Usage

```bash
# Create a new project with this template
termlings init --template default

# Or copy manually
cp -r templates/default/* ~/my-project/.termlings/
cd ~/my-project
termlings
```

## Customization

Edit agent SOUL.md files to customize their roles and personalities:
- `.termlings/agents/pm/SOUL.md`
- `.termlings/agents/designer/SOUL.md`
- `.termlings/agents/developer/SOUL.md`
- `.termlings/agents/growth/SOUL.md`
- `.termlings/agents/support/SOUL.md`

Optional frontmatter helper:
- `sort_order: <int>` controls TUI/team ordering (lower values appear first, default `0`).
- `manage_agents: true` grants authority for agent lifecycle commands (`create`, `spawn`, `respawn`).

Default authority policy:
- PM has `manage_agents: true`.
- Designer, Developer, Growth, and Support do not.

Update `.termlings/VISION.md` with your current product direction.

## Future Enhancements

This template is editable and can be enhanced with:
- Pre-filled store data (tasks, message seeds, calendar events)
- Agent history and relationships
