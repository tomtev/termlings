import { describe, expect, it } from "vitest"

import {
  ensureRuntimeSpawnCommandDefaults,
  evaluateHostYoloSpawnRisk,
  renderHostYoloSpawnApproval,
} from "../spawn.js"

describe("spawn host yolo confirmation", () => {
  const config = {
    default: { runtime: "claude", preset: "default" },
    agents: {
      developer: { runtime: "claude", preset: "default" },
      analyst: { runtime: "claude", preset: "safe" },
    },
    runtimes: {
      claude: {
        default: {
          description: "YOLO",
          command: "termlings claude --dangerously-skip-permissions",
        },
        safe: {
          description: "Safe",
          command: "termlings claude",
        },
      },
      codex: {
        default: {
          description: "YOLO",
          command: "termlings codex --sandbox danger-full-access --ask-for-approval never",
        },
      },
    },
  }

  it("requires confirmation for dangerous host-native routes", () => {
    const result = evaluateHostYoloSpawnRisk(config, [
      { slug: "developer", runtimeName: "claude", presetName: "default" },
      { slug: "analyst", runtimeName: "claude", presetName: "safe" },
    ])

    expect(result.requiresConfirmation).toBe(true)
    expect(result.riskyTargets.map((target) => target.slug)).toEqual(["developer"])
    expect(result.dangerousFlags).toEqual(["--dangerously-skip-permissions"])
  })

  it("does not require confirmation for docker-backed spawn", () => {
    const result = evaluateHostYoloSpawnRisk(
      config,
      [{ slug: "developer", runtimeName: "claude", presetName: "default" }],
      { docker: true },
    )

    expect(result.requiresConfirmation).toBe(false)
    expect(result.riskyTargets).toEqual([])
  })

  it("detects codex danger-full-access plus never approval as risky", () => {
    const result = evaluateHostYoloSpawnRisk(config, [
      { slug: "research", runtimeName: "codex", presetName: "default" },
    ])

    expect(result.requiresConfirmation).toBe(true)
    expect(result.dangerousFlags).toEqual([
      "--sandbox danger-full-access",
      "--ask-for-approval never",
    ])
  })

  it("allows explicit host yolo override", () => {
    const result = evaluateHostYoloSpawnRisk(
      config,
      [{ slug: "developer", runtimeName: "claude", presetName: "default" }],
      { allowHostYolo: true },
    )

    expect(result.requiresConfirmation).toBe(false)
    expect(result.riskyTargets).toEqual([])
  })

  it("renders an approval summary with routes, commands, and spawn.json guidance", () => {
    const result = evaluateHostYoloSpawnRisk(config, [
      { slug: "developer", runtimeName: "claude", presetName: "default" },
      { slug: "research", runtimeName: "codex", presetName: "default" },
    ])

    expect(
      renderHostYoloSpawnApproval(config, result.riskyTargets, result.dangerousFlags, "termlings --spawn"),
    ).toContain("Host launch approval required for `termlings --spawn`.")
    expect(
      renderHostYoloSpawnApproval(config, result.riskyTargets, result.dangerousFlags, "termlings --spawn"),
    ).toContain("Resolved routes from `.termlings/spawn.json`:")
    expect(
      renderHostYoloSpawnApproval(config, result.riskyTargets, result.dangerousFlags, "termlings --spawn"),
    ).toContain("claude --dangerously-skip-permissions --effort medium")
    expect(
      renderHostYoloSpawnApproval(config, result.riskyTargets, result.dangerousFlags, "termlings --spawn"),
    ).toContain("Run in Docker for better safety: `termlings --spawn --docker`")
    expect(
      renderHostYoloSpawnApproval(config, result.riskyTargets, result.dangerousFlags, "termlings --spawn"),
    ).toContain("Change defaults: edit `.termlings/spawn.json`")
    expect(
      renderHostYoloSpawnApproval(config, result.riskyTargets, result.dangerousFlags, "termlings --spawn"),
    ).not.toContain("termlings claude")
  })

  it("adds a default Claude effort level for unattended spawn routes", () => {
    expect(ensureRuntimeSpawnCommandDefaults("claude", "termlings claude --dangerously-skip-permissions")).toBe(
      "termlings claude --dangerously-skip-permissions --effort medium",
    )
    expect(ensureRuntimeSpawnCommandDefaults("claude", "termlings claude --effort high")).toBe(
      "termlings claude --effort high",
    )
    expect(ensureRuntimeSpawnCommandDefaults("codex", "termlings codex --dangerously-bypass-approvals-and-sandbox")).toBe(
      "termlings codex --dangerously-bypass-approvals-and-sandbox",
    )
  })
})
