import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"

import {
  buildTopLevelSpawnWorkerInvocation,
  getTopLevelInitOptions,
  listUnsupportedTopLevelFlags,
} from "../top-level-startup.js"

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }

describe("top-level startup helpers", () => {
  it("allows --template when used with --spawn", () => {
    const flags = new Set(["spawn", "template", "docker", "allow-host-yolo"])

    expect(listUnsupportedTopLevelFlags(flags)).toEqual([])
    expect(getTopLevelInitOptions(flags, { template: "personal-assistant" })).toEqual({
      template: "personal-assistant",
    })
  })

  it("rejects --template without --spawn", () => {
    const flags = new Set(["template"])

    expect(listUnsupportedTopLevelFlags(flags)).toEqual(["template"])
    expect(getTopLevelInitOptions(flags, { template: "personal-assistant" })).toEqual({})
  })

  it("builds a detached spawn worker invocation that uses bun and bypasses duplicate yolo confirmation", () => {
    expect(
      buildTopLevelSpawnWorkerInvocation({
        root: "/workspace/project",
        argv1: "/workspace/project/bin/termlings.js",
        execPath: "/usr/bin/node",
        docker: true,
        allowHostYolo: true,
      }),
    ).toEqual({
      command: "bun",
      args: [
        "/workspace/project/bin/termlings.js",
        "spawn",
        "--all",
        "--quiet",
        "--docker",
        "--allow-host-yolo",
      ],
    })
  })

  it("reuses the current bun executable for the detached spawn worker when available", () => {
    expect(
      buildTopLevelSpawnWorkerInvocation({
        root: "/workspace/project",
        argv1: "/workspace/project/bin/termlings.js",
        execPath: "/opt/homebrew/bin/bun",
      }),
    ).toEqual({
      command: "/opt/homebrew/bin/bun",
      args: [
        "/workspace/project/bin/termlings.js",
        "spawn",
        "--all",
        "--quiet",
      ],
    })
  })

  it("uses npm exec when top-level spawn is launched via npx", () => {
    expect(
      buildTopLevelSpawnWorkerInvocation({
        root: "/workspace/project",
        argv1: "/private/tmp/.npm/_npx/abc/node_modules/termlings/bin/termlings.js",
        execPath: "/opt/homebrew/bin/bun",
        docker: true,
        env: {
          npm_execpath: "/Users/test/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js",
          npm_command: "exec",
          npm_lifecycle_event: "npx",
          npm_node_execpath: "/Users/test/.nvm/versions/node/v22.0.0/bin/node",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({
      command: "/Users/test/.nvm/versions/node/v22.0.0/bin/node",
      args: [
        "/Users/test/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js",
        "exec",
        "--yes",
        "--package",
        `termlings@${pkg.version}`,
        "--",
        "termlings",
        "spawn",
        "--all",
        "--quiet",
        "--docker",
      ],
    })
  })
})
