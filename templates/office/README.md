# Office Template

A complete team workspace for a 5-person SaaS company.

## Contents

- **Map**: Cozy office (54×44 tiles)
- **Objects**: Desk object definition
- **Agents**: 5 pre-configured team members
  - Alice (CEO/Founder) - Direction
  - Bob (CTO/Builder) - Product
  - Carol (CMO/Grower) - Users
  - David (CRO/Monetizer) - Revenue
  - Emma (COO/Operator) - Scale
- **Store**: Empty directories for email, crons, and tasks

## Usage

```bash
# Create a new project with this template
termlings init --template office

# Or copy manually
cp -r templates/office/.termlings ~/my-project/.termlings
cd ~/my-project
termlings
```

## Customization

Edit agent SOUL.md files to customize their roles and personalities:
- `.termlings/agents/alice/SOUL.md`
- `.termlings/agents/bob/SOUL.md`
- etc.

Add objects to `.termlings/objects/` as JSON files.

Add or modify map chunks in `.termlings/map/chunk_*.json`.

## Future Enhancements

This template is editable and can be enhanced with:
- More complex map chunks
- Additional object definitions
- Pre-filled store data (emails, cron jobs, tasks)
- Agent history and relationships
