import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { getBrowserConfig, getBrowserStartupErrorLogPath, parseSingletonLockPid } from "../browser.js"

describe("browser startup resilience config", () => {
  const originalIpcDir = process.env.TERMLINGS_IPC_DIR
  let tempRoot = ""
  let termlingsDir = ""

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "termlings-browser-test-"))
    termlingsDir = join(tempRoot, ".termlings")
    mkdirSync(termlingsDir, { recursive: true })
    process.env.TERMLINGS_IPC_DIR = termlingsDir
  })

  afterEach(() => {
    if (originalIpcDir === undefined) {
      delete process.env.TERMLINGS_IPC_DIR
    } else {
      process.env.TERMLINGS_IPC_DIR = originalIpcDir
    }
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it("applies startup defaults when config omits startup fields", () => {
    const browserDir = join(termlingsDir, "browser")
    mkdirSync(browserDir, { recursive: true })
    writeFileSync(
      join(browserDir, "config.json"),
      JSON.stringify({
        port: 9555,
        binaryPath: "google-chrome",
        autoStart: false,
        profilePath: join(tempRoot, "profile"),
        timeout: 15000,
      }) + "\n",
      "utf8",
    )

    const config = getBrowserConfig()
    expect(config.port).toBe(9555)
    expect(config.startupTimeoutMs).toBe(30000)
    expect(config.startupAttempts).toBe(3)
    expect(config.startupPollMs).toBe(250)
  })

  it("preserves explicit startup settings from config", () => {
    const browserDir = join(termlingsDir, "browser")
    mkdirSync(browserDir, { recursive: true })
    writeFileSync(
      join(browserDir, "config.json"),
      JSON.stringify({
        port: 9556,
        binaryPath: "google-chrome",
        autoStart: false,
        profilePath: join(tempRoot, "profile"),
        timeout: 12000,
        startupTimeoutMs: 45000,
        startupAttempts: 5,
        startupPollMs: 400,
      }) + "\n",
      "utf8",
    )

    const config = getBrowserConfig()
    expect(config.startupTimeoutMs).toBe(45000)
    expect(config.startupAttempts).toBe(5)
    expect(config.startupPollMs).toBe(400)
    expect(getBrowserStartupErrorLogPath()).toBe(join(browserDir, "startup-errors.jsonl"))
  })
})

describe("parseSingletonLockPid", () => {
  it("extracts pid from mac singleton lock target", () => {
    expect(parseSingletonLockPid("mac.lan-87427")).toBe(87427)
  })

  it("returns null for non-standard targets", () => {
    expect(parseSingletonLockPid("invalid-target")).toBeNull()
    expect(parseSingletonLockPid("mac.lan-")).toBeNull()
  })
})
