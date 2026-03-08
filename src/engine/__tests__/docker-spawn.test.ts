import { describe, expect, it } from "vitest"
import {
  buildDockerRunArgs,
  dockerContainerName,
  dockerSpawnImageTag,
  dockerRuntimeHome,
  dockerWorkspaceKey,
  pickDockerHostEnv,
} from "../docker-spawn.js"

describe("docker-spawn helpers", () => {
  it("derives a stable workspace key from the project root", () => {
    const first = dockerWorkspaceKey("/tmp/acme")
    const second = dockerWorkspaceKey("/tmp/acme")
    const third = dockerWorkspaceKey("/tmp/other")

    expect(first).toBe(second)
    expect(first).toHaveLength(12)
    expect(first).not.toBe(third)
  })

  it("creates a safe per-agent container name", () => {
    expect(dockerContainerName("/tmp/acme", "agent:Design Lead")).toMatch(/^termlings-[a-f0-9]{12}-agent-design-lead$/)
  })

  it("only forwards the explicit Docker env allowlist", () => {
    const env = pickDockerHostEnv({
      TERM: "xterm-256color",
      HTTPS_PROXY: "http://proxy",
      OPENAI_API_KEY: "sk-123",
      AWS_SECRET_ACCESS_KEY: "nope",
      HOME: "/Users/tommy",
    })

    expect(env).toEqual({
      TERM: "xterm-256color",
      HTTPS_PROXY: "http://proxy",
      OPENAI_API_KEY: "sk-123",
    })
  })

  it("builds the docker run command for one agent target", () => {
    const args = buildDockerRunArgs(
      {
        root: "/tmp/acme",
        agentSlug: "developer",
        runtimeName: "claude",
        presetName: "default",
        extraArgs: ["resume", "--last"],
      },
      { interactive: false },
    )

    if (process.platform === "linux") {
      expect(args.slice(0, 8)).toEqual([
        "run",
        "--rm",
        "--name",
        dockerContainerName("/tmp/acme", "developer"),
        "--init",
        "--add-host",
        "host.docker.internal:host-gateway",
        "-w",
      ])
      expect(args).toContain("--add-host")
      expect(args).toContain("host.docker.internal:host-gateway")
    } else {
      expect(args.slice(0, 6)).toEqual([
        "run",
        "--rm",
        "--name",
        dockerContainerName("/tmp/acme", "developer"),
        "--init",
        "-w",
      ])
    }
    expect(args).toContain("/tmp/acme:/workspace")
    expect(args).toContain(`${dockerRuntimeHome("/tmp/acme")}/.claude.json:/home/termlings/.claude.json`)
    expect(args).toContain("TERMLINGS_DOCKER=1")
    expect(args).toContain("TERMLINGS_DOCKER_BROWSER_HOST=host.docker.internal")
    expect(args).toContain(dockerSpawnImageTag())
    expect(args.slice(-7)).toEqual(["spawn", "claude", "default", "--agent=developer", "--inline", "--allow-host-yolo", "resume", "--last"].slice(-7))
  })
})
