import { describe, expect, it } from "vitest"

import {
  buildTopLevelSpawnWorkerInvocation,
  getTopLevelInitOptions,
  listUnsupportedTopLevelFlags,
} from "../top-level-startup.js"

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
})
