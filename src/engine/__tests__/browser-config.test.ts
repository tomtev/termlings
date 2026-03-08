import { createServer, type Server } from "http"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  buildBrowserLaunchCommand,
  getBrowserConfig,
  getBrowserProfileDir,
  getBrowserLifecycleLockPath,
  getBrowserStartupErrorLogPath,
  isContainerRuntime,
  isDefaultBrowserProfilePath,
  parseSingletonLockPid,
  resolveBrowserClientTarget,
  runWithBrowserLifecycleLock,
  shouldForceHeadlessBrowser,
  updateProcessState,
  waitForBrowserReady,
} from "../browser.js"

describe("browser startup resilience config", () => {
  const originalIpcDir = process.env.TERMLINGS_IPC_DIR
  const originalHome = process.env.HOME
  const originalDocker = process.env.TERMLINGS_DOCKER
  let tempRoot = ""
  let termlingsDir = ""
  let server: Server | null = null

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "termlings-browser-test-"))
    termlingsDir = join(tempRoot, ".termlings")
    mkdirSync(termlingsDir, { recursive: true })
    process.env.TERMLINGS_IPC_DIR = termlingsDir
  })

  afterEach(() => {
    if (server) {
      server.close()
      server = null
    }
    if (originalIpcDir === undefined) {
      delete process.env.TERMLINGS_IPC_DIR
    } else {
      process.env.TERMLINGS_IPC_DIR = originalIpcDir
    }
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalDocker === undefined) {
      delete process.env.TERMLINGS_DOCKER
    } else {
      process.env.TERMLINGS_DOCKER = originalDocker
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

  it("treats the real Chrome user-data dir as forbidden", () => {
    const home = process.env.HOME || tempRoot
    expect(isDefaultBrowserProfilePath(join(home, "Library", "Application Support", "Google", "Chrome"))).toBe(
      process.platform === "darwin",
    )
  })

  it("detects docker-like container runtimes", () => {
    expect(isContainerRuntime({ TERMLINGS_DOCKER: "1" } as NodeJS.ProcessEnv)).toBe(true)
    expect(isContainerRuntime({ container: "docker" } as NodeJS.ProcessEnv)).toBe(true)
    expect(isContainerRuntime({} as NodeJS.ProcessEnv)).toBe(existsSync("/.dockerenv"))
  })

  it("adds no-sandbox for headless chromium in containers", () => {
    const launch = buildBrowserLaunchCommand("/usr/bin/chromium", {
      headless: true,
      port: 9333,
      profilePath: "/tmp/profile",
      env: { TERMLINGS_DOCKER: "1" } as NodeJS.ProcessEnv,
    })

    expect(launch.command).toBe("/usr/bin/chromium")
    expect(launch.args).toContain("--no-sandbox")
    expect(launch.args).toContain("--disable-dev-shm-usage")
    expect(launch.args).toContain("--headless=new")
  })

  it("forces headless chromium in containers without DISPLAY", () => {
    const launch = buildBrowserLaunchCommand("/usr/bin/chromium", {
      headless: false,
      port: 9333,
      profilePath: "/tmp/profile",
      env: { TERMLINGS_DOCKER: "1" } as NodeJS.ProcessEnv,
    })

    expect(launch.command).toBe("/usr/bin/chromium")
    expect(launch.args).toContain("--no-sandbox")
    expect(launch.args).toContain("--headless=new")
    expect(shouldForceHeadlessBrowser({ TERMLINGS_DOCKER: "1" } as NodeJS.ProcessEnv)).toBe(true)
  })

  it("prefers the shared host browser target from Docker workers", () => {
    expect(
      resolveBrowserClientTarget(
        {
          pid: 42,
          port: 9222,
          status: "running",
          startedAt: Date.now(),
          cdpWsUrl: "ws://127.0.0.1:9222/devtools/browser/test",
          dockerCdpTarget: "host.docker.internal:9333",
          sharedForDocker: true,
          mode: "cdp",
        },
        { TERMLINGS_DOCKER: "1" } as NodeJS.ProcessEnv,
      ),
    ).toBe("host.docker.internal:9333")
  })

  it("normalizes managed Termlings profile paths to the current runtime home", () => {
    process.env.HOME = "/home/termlings"
    const browserDir = join(termlingsDir, "browser")
    mkdirSync(browserDir, { recursive: true })
    writeFileSync(
      join(browserDir, "config.json"),
      JSON.stringify({
        port: 9557,
        binaryPath: "google-chrome",
        autoStart: false,
        profilePath: "/Users/tommyvedvik/.termlings/chrome-profiles/foreign-profile",
        timeout: 15000,
      }) + "\n",
      "utf8",
    )

    const config = getBrowserConfig()
    expect(config.profilePath).toBe(getBrowserProfileDir())
  })

  it("serializes concurrent browser lifecycle callers", async () => {
    const order: string[] = []

    const first = runWithBrowserLifecycleLock(async () => {
      order.push("first:start")
      await new Promise((resolve) => setTimeout(resolve, 120))
      order.push("first:end")
      return "first"
    })

    const second = runWithBrowserLifecycleLock(async () => {
      order.push("second:start")
      order.push("second:end")
      return "second"
    })

    const results = await Promise.all([first, second])
    expect(results).toEqual(["first", "second"])
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"])
  })

  it("waits for a starting browser to become ready", async () => {
    server = createServer((req, res) => {
      if (req.url === "/json/version") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ Browser: "Chrome/1.0", webSocketDebuggerUrl: "ws://127.0.0.1:9555/devtools/browser/test" }))
        return
      }
      res.writeHead(404)
      res.end("not found")
    })
    await new Promise<void>((resolve) => server!.listen(9555, "127.0.0.1", resolve))

    mkdirSync(join(termlingsDir, "browser"), { recursive: true })
    writeFileSync(getBrowserLifecycleLockPath(), JSON.stringify({ pid: process.pid, createdAt: Date.now() }) + "\n", "utf8")
    updateProcessState({
      pid: process.pid,
      port: 9555,
      status: "starting",
      startedAt: null,
      profilePath: join(tempRoot, "profile"),
      mode: "cdp",
    })

    const state = await waitForBrowserReady(1000, 50)
    expect(state?.status).toBe("running")
    expect(state?.port).toBe(9555)

    try {
      unlinkSync(getBrowserLifecycleLockPath())
    } catch {}
  })

  it("waits for a shared host browser to become ready from Docker workers", async () => {
    process.env.TERMLINGS_DOCKER = "1"

    server = createServer((req, res) => {
      if (req.url === "/json/version") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ Browser: "Chrome/1.0", webSocketDebuggerUrl: "ws://host.docker.internal:9558/devtools/browser/test" }))
        return
      }
      res.writeHead(404)
      res.end("not found")
    })
    await new Promise<void>((resolve) => server!.listen(9558, "127.0.0.1", resolve))

    mkdirSync(join(termlingsDir, "browser"), { recursive: true })
    updateProcessState({
      pid: null,
      port: 9558,
      status: "starting",
      startedAt: null,
      dockerCdpTarget: "127.0.0.1:9558",
      sharedForDocker: true,
      profilePath: join(tempRoot, "profile"),
      mode: "cdp",
    })

    const state = await waitForBrowserReady(1000, 50)
    expect(state?.status).toBe("running")
    expect(state?.sharedForDocker).toBe(true)
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
