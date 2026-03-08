import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  buildRemoteMachineShellCommand,
  buildRemoteMachineSshArgs,
  getRemoteMachine,
  listRemoteMachines,
  saveRemoteMachine,
} from "../machines.js"

describe("remote machine ssh support", () => {
  const originalIpcDir = process.env.TERMLINGS_IPC_DIR
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-machines-test-"))
    process.env.TERMLINGS_IPC_DIR = join(root, ".termlings")
  })

  afterEach(() => {
    if (originalIpcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalIpcDir
    rmSync(root, { recursive: true, force: true })
  })

  it("stores machine definitions in .termlings/machines.json", () => {
    const machine = saveRemoteMachine("hetzner", {
      host: "1.2.3.4",
      user: "root",
      port: 2222,
      remoteDir: "/srv/acme",
      identityFile: "~/.ssh/id_ed25519",
      description: "shared workspace",
    }, root)

    expect(machine.name).toBe("hetzner")
    expect(machine.runtimeMode).toBe("host")
    expect(getRemoteMachine("hetzner", root)?.host).toBe("1.2.3.4")
    expect(listRemoteMachines(root).map((entry) => entry.name)).toEqual(["hetzner"])

    const path = join(root, ".termlings", "machines.json")
    expect(existsSync(path)).toBe(true)
    const stored = JSON.parse(readFileSync(path, "utf8")) as {
      machines: Record<string, { host: string; remoteDir: string }>
    }
    expect(stored.machines.hetzner?.host).toBe("1.2.3.4")
    expect(stored.machines.hetzner?.remoteDir).toBe("/srv/acme")
  })

  it("builds host ssh commands with the expected remote behavior", () => {
    const machine = saveRemoteMachine("hetzner", {
      host: "1.2.3.4",
      user: "root",
      port: 2222,
      remoteDir: "~/srv/acme",
      identityFile: "~/.ssh/id_ed25519",
    }, root)

    const connectArgs = buildRemoteMachineSshArgs(machine)
    const connectCommand = buildRemoteMachineShellCommand(machine)

    expect(connectArgs.slice(0, 5)).toEqual(["-p", "2222", "-i", "~/.ssh/id_ed25519", "-t"])
    expect(connectArgs[5]).toBe("root@1.2.3.4")
    expect(connectCommand).toContain('command -v termlings')
    expect(connectCommand).toContain('cd "${HOME}/srv/acme" && termlings')
  })

  it("builds docker-workspace ssh commands with the expected remote behavior", () => {
    const machine = saveRemoteMachine("dockerbox", {
      host: "1.2.3.4",
      remoteDir: "/srv/termlings",
      runtimeMode: "docker-workspace",
      dockerShell: "./docker-shell",
      containerDir: "/workspaces/acme",
    }, root)

    const connectArgs = buildRemoteMachineSshArgs(machine)
    const connectCommand = buildRemoteMachineShellCommand(machine)

    expect(connectArgs).toContain("-t")
    expect(connectArgs[1]).toBe("1.2.3.4")
    expect(connectCommand).toContain('command -v docker')
    expect(connectCommand).toContain('cd "/srv/termlings" && [ -x \'./docker-shell\' ]')
    expect(connectCommand).toContain("'./docker-shell' -lc 'cd /workspaces/acme && termlings'")
  })
})
