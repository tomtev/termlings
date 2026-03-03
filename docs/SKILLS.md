# Skills

`termlings skills` is a thin wrapper around the official `skills.sh` CLI for agent workflows.

It does **not** implement a separate package manager. For install/update/check/find/remove, it delegates to `npx skills ...`.

## Command Mapping

```text
termlings skills install ...   -> npx skills add ...
termlings skills check ...     -> npx skills check ...
termlings skills update ...    -> npx skills update ...
termlings skills find ...      -> npx skills find ...
termlings skills remove ...    -> npx skills remove ...
termlings skills init ...      -> npx skills init ...
termlings skills cli ...       -> npx skills ...
```

## Local Visibility (`termlings skills list`)

`termlings skills list` shows what a Termlings agent can currently access in this workspace by scanning:

1. `.agents/skills` (project scope, skills.sh-compatible)
2. `.claude/skills` (project scope)
3. `~/.claude/skills` (personal scope)

If the same skill slug exists in multiple places, project scope wins.

## Typical Agent Workflow

```bash
# 1) See currently accessible skills
termlings skills list

# 2) Check skills.sh-managed installs
termlings skills check

# 3) Find candidates
termlings skills find deployment

# 4) Install
termlings skills install vercel-labs/agent-skills --skill find-skills --yes

# 5) Re-verify workspace access
termlings skills list

# 6) Keep current
termlings skills update
```

## Official Docs

- CLI docs: `https://skills.sh/docs/cli`
- Source/reference formats: `https://skills.sh/docs/cli/sources`
