# Humans - Operators & Owners

Humans are the operators, owners, and decision-makers in a Termlings workspace. Unlike agents who work autonomously on tasks, humans provide strategic direction, manage access and credentials, and handle decisions requiring judgment or authentication.

## What is a Human?

A **human** is:
- An operator or owner of the Termlings workspace
- A persistent identity with a name, title, and role
- Stored in `.termlings/humans/` (similar to agents in `.termlings/agents/`)
- Responsible for environment setup, credentials, and access control
- Reachable by agents via `termlings message human:default "..."`

## Current System (v1)

Currently, Termlings supports **one default human** per workspace. Future versions will support multiple humans with role-based access control.

### Storage Structure

```
.termlings/humans/
└── default/
    └── SOUL.md          # Identity and role definition
```

### SOUL.md Format

The default human's identity is stored in `SOUL.md`:

```yaml
---
name: Tommy
title: Founder & CEO
---

## Purpose

Lead the team, make strategic decisions, and ensure the company succeeds.

## Responsibilities

- Define company vision and strategy
- Make final decisions on priorities and direction
- Unblock the team when they're stuck
- Provide feedback and guidance to team members
- Monitor progress and adjust as needed
- Add and manage environment credentials and secrets
- Grant team members access to resources (databases, APIs, services)
- Handle manual tasks that require human authentication
- Respond to team blockers and requests for help

## Owns

- Company direction and strategy
- Final decision authority
- Team health and morale
- Overall project success
- Environment setup and credentials
- Resource access and permissions
```

## Getting Started

### First-Run Setup

When you initialize a Termlings workspace with `termlings init`, you'll be prompted for your name:

```bash
$ termlings init
🚀 Initializing Termlings workspace
Select template [1]: 1
✓ Initialized .termlings using template: startup-team
What's your name? [tommy]
✓ Your name: Tommy
```

The system auto-detects your name from:
1. **Git config** (`git config user.name`) — if you've configured GitHub
2. **OS username** — your system login name
3. **Fallback** — "User" if neither is available

### Customize Your Human

Edit `.termlings/humans/default/SOUL.md` to describe:
- **Name** — Your preferred name (what agents will see)
- **Title** — Your job title (Founder, CEO, Tech Lead, etc.)
- **Purpose** — Why you exist in this workspace
- **Responsibilities** — What you're accountable for
- **Owns** — What domains/decisions belong to you

Example:

```yaml
---
name: Alice
title: Engineering Lead
---

## Purpose

Lead engineering, make technical decisions, and ensure quality.

## Responsibilities

- Design system architecture
- Approve major technical decisions
- Review critical code changes
- Ensure code quality standards
- Manage development tooling
- Add/manage API keys and database credentials

## Owns

- System architecture
- Code quality standards
- Technical hiring decisions
- Infrastructure and credentials
```

## Human-Agent Communication

### Agents Messaging You

Agents can send messages to you:

```bash
# From inside an agent session
termlings message human:default "Task-123 is blocked, waiting for database credentials"
termlings message human:default "Need AWS access to proceed with data export"
termlings message human:default "Ready to deploy, awaiting final approval"
```

### You Messaging Agents

Message agents by their slug (folder name):

```bash
# Message a specific agent
termlings message agent:developer "Here's the API key you requested"
termlings message agent:designer "Task-456 is approved, move forward"
termlings message agent:operator "Can you review the design mockups?"
```

Find agent slugs with:

```bash
termlings list-agents
# Output:
# Session             Name         Title              Role
# tl-abc123def456     Alice        Developer          Build and ship product (you)
# tl-xyz789pqr012     Bob          Designer           Design and user experience
```

### Message Format

When agents receive your message, they see:

```
[Message from Tommy - Founder. id: human:default]: Here's the database password
```

When you receive agent messages:

```
[Message from Alice - Developer. id: agent:developer]: Task-123 is blocked, need AWS credentials
```

## Key Responsibilities

### 1. Environment Setup & Credentials

You're responsible for:
- Adding environment variables (API keys, tokens, passwords)
- Managing database credentials
- Configuring service access (AWS, GitHub, databases, etc.)
- Providing agents with the credentials they need

**Example workflow:**
```bash
# Agent messages
termlings message human:default "Need AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3 access"

# You respond
termlings message agent:developer "Check project .env (or .termlings/.env for internal secrets), I've added the AWS credentials"

# Agent can now access S3
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

### 2. Access & Permissions

You're responsible for:
- Granting database access (user creation, permissions)
- Provisioning API keys on external services
- Managing team member access to tools/services
- Handling access revocation when needed

**Example workflow:**
```bash
# Agent messages
termlings message human:default "Need PostgreSQL credentials for prod database"

# You respond
termlings message agent:operator "Created user 'agent-bot' in prod. Username: agent-bot, password in 1Password vault"
```

### 3. Decision Making

You're responsible for:
- Strategic decisions (which features to build, direction)
- Prioritization (which task comes first when conflicts arise)
- Budget/resource allocation
- Approval of major changes

**Example workflow:**
```bash
# Agent messages
termlings message human:default "Should we refactor the API or focus on new features? Need guidance"

# You respond
termlings message agent:developer "Focus on new features for now. Refactor comes after we hit 1000 users"
```

### 4. Manual/Authenticated Tasks

You're responsible for:
- Actions requiring human authentication (login to services)
- CAPTCHA solving
- Two-factor authentication
- Human judgment calls

**Example workflow:**
```bash
# Agent messages
termlings message human:default "Need to generate new GitHub token. Can you do this?"

# You respond
termlings message agent:designer "Token created: ghp_xxxx...., added to project .env"
```

## Future: Multiple Humans & Access Control

In future versions, Termlings will support:

### Multiple Humans

```
.termlings/humans/
├── default/SOUL.md           # Primary owner/founder
├── alice/SOUL.md             # Engineering lead
├── bob/SOUL.md               # Product manager
└── carol/SOUL.md             # Operations manager
```

### Role-Based Access Control

Each human could have specific permissions:

```yaml
---
name: Alice
title: Engineering Lead
role: engineer
permissions:
  - manage_agents      # Can create/delete agents
  - approve_deploys    # Can approve production changes
  - manage_credentials # Can add/manage environment credentials
---
```

### Human-to-Agent Task Assignment

```bash
termlings task claim task-123 --assign-to alice
termlings task show task-123
# Output:
# Owner: Alice (Engineering Lead)
```

### Access Logging

Track which human granted which credentials:

```
.termlings/store/access-log.jsonl

{
  "timestamp": 1234567890,
  "action": "credentials_added",
  "human": "alice",
  "type": "API_KEY",
  "service": "github",
  "grantedTo": "agent:developer",
  "description": "GitHub API access for CI/CD automation"
}
```

### Human Delegation

Humans could temporarily delegate authority:

```bash
termlings human delegate alice --for "2 hours" --actions "approve_deploys,manage_credentials"
```

## Best Practices

✅ **DO:**
- Edit `.termlings/humans/default/SOUL.md` to describe your role
- Respond to agent messages promptly (they may be blocked)
- Use descriptive titles (e.g., "Founder", "Engineering Lead", not "Admin")
- Message agents with specific instructions and ETAs
- Add credentials/access when requested instead of asking agents to self-serve
- Document credentials in a secure location (1Password, LastPass, etc.)

❌ **DON'T:**
- Leave agents blocked waiting for credentials
- Be vague in responses (agents need specific next steps)
- Share passwords via message (use secure vaults)
- Forget to add required environment variables
- Assume agents know what access they need
- Create cryptic role titles (agents need to understand your function)

## Monitoring & Updates

### Check Current Human Status

```bash
# View your identity
cat .termlings/humans/default/SOUL.md

# See who's messaging you
# Check workspace TUI
```

### Update Your Info

Edit `.termlings/humans/default/SOUL.md` anytime:

```bash
# Change your name, title, or responsibilities
nano .termlings/humans/default/SOUL.md

# Agents will see updated info in next list-agents
```

## Examples

### Startup Founder

```yaml
---
name: Sarah
title: Founder & CEO
---

## Purpose
Build and scale the company.

## Responsibilities
- Set company strategy and direction
- Make go/no-go decisions
- Manage investor relationships
- Approve major feature decisions
- Handle emergency issues

## Owns
- Company direction
- Strategic partnerships
- Final decision authority
- Customer relationships
```

### Tech Lead

```yaml
---
name: Mike
title: Tech Lead
---

## Purpose
Ensure technical excellence and system reliability.

## Responsibilities
- Design system architecture
- Approve technical decisions
- Review critical code changes
- Manage infrastructure
- Add/manage credentials and access

## Owns
- System architecture
- Code quality
- Infrastructure & credentials
- Technical hiring
```

### Operations Manager

```yaml
---
name: Diana
title: Operations Manager
---

## Purpose
Keep systems running and handle operations.

## Responsibilities
- Monitor system health
- Handle incidents and outages
- Manage database backups
- Ensure disaster recovery
- Coordinate between teams

## Owns
- System reliability
- Database administration
- Incident response
- Team coordination
```

## FAQ

**Q: Can I change my name after initialization?**

A: Yes! Edit `.termlings/humans/default/SOUL.md` and change the `name:` field. Agents will see the updated name on next `termlings list-agents`.

**Q: How do agents know I've added credentials?**

A: Message them! `termlings message agent:<slug> "I've added AWS_KEY to project .env, you can now access S3"`. They can't detect environment changes automatically.

**Q: What if I need to revoke an agent's access?**

A: That's a future feature. For now, manually remove credentials from project `.env` (or `.termlings/.env` for internal Termlings-only values) or change passwords in external services.

**Q: Can multiple humans work in the same workspace?**

A: Currently only one. Future versions (v2) will support multiple humans with role-based access.

**Q: What if I forget my name during init?**

A: Just press Enter to use the auto-detected name, or re-run `termlings init --force` to redo setup.

## Related Documentation

- [TERMLINGS.md](TERMLINGS.md) - Agent identity and lifecycle
- [MESSAGING.md](MESSAGING.md) - How humans and agents communicate
- [TASK.md](TASK.md) - Task management and assignment
- [docs/TERMLINGS.md](TERMLINGS.md) - SOUL frontmatter conventions and identity model
