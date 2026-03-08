import {
  buildRemoteMachineSshArgs,
  formatShellCommand,
  getRemoteMachine,
  listRemoteMachines,
  removeRemoteMachine,
  runRemoteMachineSession,
  saveRemoteMachine,
} from "../engine/machines.js"

function printMachineHelp(): void {
  console.log(`
🖥️  Machines - SSH into shared remote Termlings workspaces

Use remote machines when multiple humans should share one live Termlings project.

COMMANDS:
  termlings machine add <name> --host <host> --dir <remote-dir> [options]
  termlings machine list
  termlings machine show <name>
  termlings machine remove <name>
  termlings machine connect <name> [--print]

OPTIONS:
  --host <host>              Remote hostname or IP (required for add)
  --user <user>              SSH username
  --port <port>              SSH port
  --dir <remote-dir>         Remote project directory (required for add)
  --identity <path>          SSH identity file
  --mode <mode>              host (default) or docker-workspace
  --docker-shell <path>      docker workspace shell helper (default: ./docker-shell)
  --container-dir <path>     Termlings project path inside docker workspace
  --description <text>       Optional label
  --print                    Print ssh command instead of executing it

MODES:
  connect                    Open your own remote TUI in the shared workspace

EXAMPLES:
  termlings machine add hetzner --host 1.2.3.4 --user root --dir /srv/acme
  termlings machine add prod --host 1.2.3.4 --dir /srv/termlings --mode docker-workspace
  termlings machine connect hetzner
  termlings machine connect prod --print
`)
}

function printMachine(machine: {
  name: string
  host: string
  user?: string
  port?: number
  remoteDir: string
  runtimeMode: "host" | "docker-workspace"
  identityFile?: string
  dockerShell?: string
  containerDir?: string
  description?: string
}): void {
  console.log(`${machine.name}`)
  console.log(`  host: ${machine.host}`)
  if (machine.user) console.log(`  user: ${machine.user}`)
  if (machine.port) console.log(`  port: ${machine.port}`)
  console.log(`  dir: ${machine.remoteDir}`)
  console.log(`  mode: ${machine.runtimeMode}`)
  if (machine.identityFile) console.log(`  identity: ${machine.identityFile}`)
  if (machine.dockerShell) console.log(`  docker shell: ${machine.dockerShell}`)
  if (machine.containerDir) console.log(`  container dir: ${machine.containerDir}`)
  if (machine.description) console.log(`  description: ${machine.description}`)
}

function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value <= 0 || value > 65535) {
    throw new Error(`Invalid port "${raw}".`)
  }
  return value
}

function runMachineConnect(name: string, printOnly: boolean): void {
  const machine = getRemoteMachine(name)
  if (!machine) {
    throw new Error(`Unknown machine "${name}". Add it with: termlings machine add ${name} --host <host> --dir <remote-dir>`)
  }

  const args = buildRemoteMachineSshArgs(machine)
  if (printOnly) {
    console.log(formatShellCommand("ssh", args))
    return
  }

  const exitCode = runRemoteMachineSession(machine)
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

export async function handleMachine(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const subcommand = positional[1]

  if (!subcommand || subcommand === "help" || flags.has("help")) {
    printMachineHelp()
    return
  }

  if (subcommand === "list") {
    const machines = listRemoteMachines()
    if (machines.length === 0) {
      console.log("No remote machines configured.")
      console.log("Add one with: termlings machine add <name> --host <host> --dir <remote-dir>")
      return
    }
    console.log(`Remote machines (${machines.length}):`)
    for (const machine of machines) {
      const target = machine.user ? `${machine.user}@${machine.host}` : machine.host
      const description = machine.description ? ` - ${machine.description}` : ""
      console.log(`- ${machine.name}: ${target}:${machine.remoteDir}${description}`)
    }
    return
  }

  if (subcommand === "show") {
    const name = positional[2]
    if (!name) {
      throw new Error("Usage: termlings machine show <name>")
    }
    const machine = getRemoteMachine(name)
    if (!machine) {
      throw new Error(`Unknown machine "${name}".`)
    }
    printMachine(machine)
    return
  }

  if (subcommand === "remove" || subcommand === "rm") {
    const name = positional[2]
    if (!name) {
      throw new Error("Usage: termlings machine remove <name>")
    }
    if (!removeRemoteMachine(name)) {
      throw new Error(`Unknown machine "${name}".`)
    }
    console.log(`✓ Removed machine ${name}`)
    return
  }

  if (subcommand === "add") {
    const name = positional[2]
    if (!name) {
      throw new Error("Usage: termlings machine add <name> --host <host> --dir <remote-dir> [options]")
    }
    const host = opts.host
    const remoteDir = opts.dir || opts.remoteDir
    if (!host) {
      throw new Error("Missing required option: --host <host>")
    }
    if (!remoteDir) {
      throw new Error("Missing required option: --dir <remote-dir>")
    }

    const machine = saveRemoteMachine(name, {
      host,
      user: opts.user,
      port: parsePort(opts.port),
      remoteDir,
      identityFile: opts.identity,
      runtimeMode: opts.mode === "docker-workspace" ? "docker-workspace" : "host",
      dockerShell: opts["docker-shell"] || opts.docker_shell,
      containerDir: opts["container-dir"] || opts.container_dir || opts.containerDir,
      description: opts.description,
    })
    console.log(`✓ Saved machine ${machine.name}`)
    printMachine(machine)
    return
  }

  if (subcommand === "connect") {
    const name = positional[2]
    if (!name) {
      throw new Error("Usage: termlings machine connect <name> [--print]")
    }
    runMachineConnect(name, flags.has("print"))
    return
  }

  throw new Error(`Unknown machine subcommand "${subcommand}". Run: termlings machine --help`)
}
