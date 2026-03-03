import { copyFileSync, existsSync, mkdirSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { handleSimAction } from "./actions.js"

function ensureSimMap(): void {
  const termlingsDir = join(process.cwd(), ".termlings")
  mkdirSync(termlingsDir, { recursive: true })

  const mapPath = join(termlingsDir, "map.json")
  if (existsSync(mapPath)) return

  const dir = dirname(fileURLToPath(import.meta.url))
  const bundledMap = join(dir, "default-map", "map.json")
  if (!existsSync(bundledMap)) {
    throw new Error("Bundled sim map missing at src/sim/default-map/map.json")
  }
  copyFileSync(bundledMap, mapPath)
}

function printSimHelp(): void {
  console.log(`Sim mode

USAGE:
  termlings --sim                 Start sim runtime
  termlings sim                   Start sim runtime
  termlings --sim play <map-dir>  Start sim with custom map directory
  termlings sim <walk|gesture|map> ...   Run sim action directly

SIM ACTIONS:
  termlings sim walk <x>,<y>
  termlings sim gesture [wave|talk]
  termlings sim map [--agents|--ascii]
`)
}

export async function runSimCommand(
  positional: string[],
  flags: Set<string>,
): Promise<void> {
  const simFlags = new Set(flags)
  simFlags.delete("sim")

  const args = [...positional]
  if (args[0] === "sim") args.shift()

  if (simFlags.has("help") || args[0] === "help") {
    printSimHelp()
    return
  }

  const directVerb = args[0]
  if (directVerb === "walk" || directVerb === "gesture" || directVerb === "map") {
    await handleSimAction(args, simFlags)
    return
  }

  let mapDir: string | null = null
  if (args[0] === "play") {
    mapDir = args[1] ? resolve(args[1]) : null
  } else if (args[0]) {
    console.error(`Unknown sim command: ${args[0]}`)
    printSimHelp()
    process.exit(1)
  }

  ensureSimMap()
  if (mapDir) process.env.TERMLINGS_MAP_PATH = mapDir

  const runtimeArgs: string[] = []
  if (simFlags.has("small")) runtimeArgs.push("--small")
  if (simFlags.has("debug")) runtimeArgs.push("--debug")

  process.argv = [process.argv[0]!, process.argv[1]!, ...runtimeArgs]
  await import("./runtime.js")
}
