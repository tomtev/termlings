import { spawn } from "child_process"
import { relative } from "path"

import { listSkills } from "../engine/skills.js"
import { maybeHandleCommandSchema, type CommandSchemaContract } from "./command-schema.js"

const SKILLS_SCHEMA: CommandSchemaContract = {
  command: "skills",
  title: "Skills",
  summary: "Discover local skills and proxy skills.sh operations",
  notes: [
    "Discovery order: .agents/skills, .claude/skills, then ~/.claude/skills.",
    "Wrapped commands call `npx skills ...` under the hood.",
  ],
  actions: {
    list: {
      summary: "List workspace-visible skills",
      usage: "termlings skills list [--json]",
      options: {
        json: "Output { skills: [...] } JSON",
      },
      examples: [
        "termlings skills list --json",
      ],
    },
    install: {
      summary: "Install a skill source through skills.sh",
      usage: "termlings skills install <source> [skills options...]",
      notes: [
        "Additional flags are passed directly to `npx skills add ...`.",
      ],
      examples: [
        "termlings skills install vercel-labs/agent-skills --skill find-skills --yes",
      ],
    },
    check: {
      summary: "Check installed skills",
      usage: "termlings skills check [skills options...]",
      notes: [
        "Additional flags are passed directly to `npx skills check ...`.",
      ],
      examples: [
        "termlings skills check",
      ],
    },
    update: {
      summary: "Update installed skills",
      usage: "termlings skills update [skills options...]",
      notes: [
        "Additional flags are passed directly to `npx skills update ...`.",
      ],
      examples: [
        "termlings skills update",
      ],
    },
    find: {
      summary: "Search installable skills",
      usage: "termlings skills find [query...]",
      examples: [
        "termlings skills find deployment",
      ],
    },
    remove: {
      summary: "Remove installed skills",
      usage: "termlings skills remove [skills...]",
      examples: [
        "termlings skills remove find-skills",
      ],
    },
    init: {
      summary: "Initialize a new skill scaffold",
      usage: "termlings skills init [name]",
      examples: [
        "termlings skills init browser-audit",
      ],
    },
    cli: {
      summary: "Pass raw arguments through to skills.sh",
      usage: "termlings skills cli <skills-command> [args...]",
      examples: [
        "termlings skills cli list -g",
      ],
    },
  },
}

function printHelp(): void {
  console.log(`
🧠 Skills - Discover local skills and wrap skills.sh CLI

USAGE:
  termlings skills
  termlings skills list
  termlings skills list --json
  termlings skills install <source> [skills options...]
  termlings skills check [skills options...]
  termlings skills update [skills options...]
  termlings skills find [query...]
  termlings skills remove [skills...]
  termlings skills init [name]
  termlings skills cli <skills-command> [args...]

DISCOVERY ORDER:
  1. .agents/skills            Project skills (skills.sh compatible)
  2. .claude/skills            Project Claude skills
  3. ~/.claude/skills          Personal Claude skills

WRAPPED COMMANDS:
  install   -> npx skills add ...
  check     -> npx skills check ...
  update    -> npx skills update ...
  find      -> npx skills find ...
  remove    -> npx skills remove ...
  init      -> npx skills init ...
  cli       -> npx skills <raw args...>

NOTES:
  - Expected layout: <skills-dir>/<skill-slug>/SKILL.md
  - If the same slug exists in multiple sources, project takes precedence.
  - For source formats and options see: https://skills.sh/docs/cli

EXAMPLES:
  termlings skills list
  termlings skills install vercel-labs/agent-skills --skill find-skills --yes
  termlings skills check
  termlings skills update
  termlings skills find deployment
  termlings skills remove find-skills
  termlings skills cli list -g
`);
}

function formatScope(scope: "project" | "personal"): string {
  return scope === "personal" ? "personal" : "project"
}

function getRawSkillsArgs(): string[] {
  return process.argv.slice(2)
}

function getNpxBinary(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx"
}

async function runSkillsCli(args: string[]): Promise<void> {
  const npx = getNpxBinary()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npx, ["skills", ...args], {
      stdio: "inherit",
      env: process.env,
    })
    child.on("error", (error) => reject(error))
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`npx skills ${args[0] || ""} exited with code ${code ?? 1}`.trim()))
    })
  })
}

function usageError(message: string): never {
  console.error(message)
  console.error("Run `termlings skills schema` for the command contract.")
  process.exit(1)
}

export async function handleSkills(flags: Set<string>, positional: string[]): Promise<void> {
  if (maybeHandleCommandSchema(SKILLS_SCHEMA, positional)) {
    return
  }

  const rawArgs = getRawSkillsArgs()
  const rawSubcommand = rawArgs[1]
  const subcommand = rawSubcommand || positional[1] || "list"

  const showLocalHelp = (
    subcommand === "help"
    || subcommand === "--help"
    || (subcommand === "list" && flags.has("help"))
  )

  if (showLocalHelp) {
    printHelp()
    return
  }

  try {
    if (subcommand === "list") {
      const cwd = process.cwd()
      const skills = await listSkills(cwd)

      if (flags.has("json")) {
        console.log(JSON.stringify({ skills }, null, 2))
        return
      }

      if (skills.length === 0) {
        console.log("No skills found. Add SKILL.md files to .agents/skills/ or .claude/skills/.")
        return
      }

      console.log(`Skills (${skills.length})`)
      for (const skill of skills) {
        const pathText = skill.scope === "project"
          ? relative(cwd, skill.skillPath)
          : skill.skillPath
        const desc = skill.description ? ` — ${skill.description}` : ""
        console.log(`- ${skill.name} · ${formatScope(skill.scope)} · ${pathText}${desc}`)
      }
      return
    }

    if (subcommand === "install") {
      const passthrough = rawArgs.slice(2)
      if (passthrough.length === 0) usageError("Usage: termlings skills install <source> [skills options...]")
      await runSkillsCli(["add", ...passthrough])
      return
    }

    if (subcommand === "check") {
      await runSkillsCli(["check", ...rawArgs.slice(2)])
      return
    }

    if (subcommand === "update") {
      await runSkillsCli(["update", ...rawArgs.slice(2)])
      return
    }

    if (subcommand === "find") {
      await runSkillsCli(["find", ...rawArgs.slice(2)])
      return
    }

    if (subcommand === "remove") {
      await runSkillsCli(["remove", ...rawArgs.slice(2)])
      return
    }

    if (subcommand === "init") {
      await runSkillsCli(["init", ...rawArgs.slice(2)])
      return
    }

    if (subcommand === "cli") {
      const passthrough = rawArgs.slice(2)
      if (passthrough.length === 0) usageError("Usage: termlings skills cli <skills-command> [args...]")
      await runSkillsCli(passthrough)
      return
    }

    usageError("Usage: termlings skills [list|install|check|update|find|remove|init|cli]")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Skills command failed: ${message}`)
    process.exit(1)
  }
}
