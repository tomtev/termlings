# Creating Agents

Create new termling agents with custom names and visual identities.

## Quick Start

```bash
termlings create                  # Interactive mode
termlings create alice            # Create with folder name
termlings create --name "Alice"   # Custom display name
termlings create --dna 2c5f423    # Custom DNA (visual identity)
```

## Interactive Mode (Default)

```bash
termlings create

# Prompts:
# Enter agent name: alice
# Enter display name (optional): [just press enter for default]
# Enter DNA (optional): [just press enter for random]

# Creates: .termlings/agents/alice/
```

## Named Creation

Create with a specific folder name:

```bash
termlings create my-agent

# Creates: .termlings/agents/my-agent/
```

## Custom Identity

Specify display name and/or DNA:

```bash
# Custom name
termlings create alice --name "Alice The Great"

# Custom DNA (visual identity)
termlings create bob --dna 1b4e312

# Both
termlings create charlie --name "Charlie" --dna 0a3f201
```

## What Gets Created

```
.termlings/agents/<name>/
├── SOUL.md       # Agent personality and purpose
└── avatar.svg    # Visual identity (rendered from DNA)
```

### SOUL.md

The agent's personality file with YAML front-matter:

```yaml
---
name: Alice
title: Data Engineer
dna: 0a3f201
---

## Purpose

I help with data validation and analysis tasks.

## Background

I'm experienced with SQL, Python, and data visualization.

## How to work with me

- I work best on structured data analysis tasks
- I prefer clear requirements and deadlines
- I communicate progress every 30 minutes
```

Edit SOUL.md to customize the agent's personality, role, and preferences.

## DNA (Avatar Identity)

DNA is a 7-character hex string that determines avatar appearance.

If not provided, a random DNA is generated:

```bash
termlings create alice
# Gets random DNA like: 2c5f423, 1b4e312, etc.
```

To use a specific DNA:

```bash
termlings create alice --dna 2c5f423
```

View your avatar:

```bash
termlings avatar alice
# or
termlings avatar 2c5f423
```

## Launching Your Agent

After creation, launch the agent:

```bash
termlings claude          # Launch Claude Code
termlings alice           # Launch saved agent
```

Set environment for the agent:

```bash
TERMLINGS_AGENT_NAME="Alice" termlings list-agents
```

Or it's set automatically when launching with Claude Code.

## Example Workflow

```bash
# 1. Create agent
termlings create alice --name "Alice" --dna 2c5f423

# 2. Edit personality
# Edit .termlings/agents/alice/SOUL.md

# 3. View avatar
termlings avatar alice

# 4. Launch
termlings claude
  # In Claude session:
  termlings list-agents  # You're now Alice

# 5. Start working
termlings task claim task-123
termlings task status task-123 in-progress
```

## Best Practices

✅ **DO:**
- Use meaningful names (`alice`, `data-bot`, `reviewer`)
- Edit SOUL.md to describe your agent
- Pick a custom DNA if you want a specific look
- Create agents before launching them

❌ **DON'T:**
- Use spaces in folder names
- Reuse agent IDs (each needs unique folder)
- Forget to edit SOUL.md (it helps teammates understand the agent)

## Agent Directory

List all agents:

```bash
ls .termlings/agents/
# alice/
# bob/
# charlie/
```

Each agent folder is independent and can be:
- Shared via git
- Backed up separately
- Deleted to remove the agent

## Related

- [AVATARS.md](AVATARS.md) - Avatar visualization options
- [../AGENTS.md](../AGENTS.md) - Agent system overview
- [CLAUDE.md](CLAUDE.md) - Using agents with Claude Code
