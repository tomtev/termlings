# Default Template

A complete starter workspace for a 5-person SaaS team.

## Contents

- **Agents**: 5 pre-configured team members
  - Operator (Founder)
  - PM (Vision & Prioritization)
  - Developer (Build & Ship)
  - Designer (UX & Visual Design)
  - Growth (Customer & Adoption)
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
- `.termlings/agents/alice/SOUL.md`
- `.termlings/agents/bob/SOUL.md`
- etc.

Update `.termlings/VISION.md` with your current product direction.

## Future Enhancements

This template is editable and can be enhanced with:
- Pre-filled store data (tasks, message seeds, calendar events)
- Agent history and relationships
