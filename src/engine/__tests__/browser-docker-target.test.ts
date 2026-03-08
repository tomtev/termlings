import { describe, expect, it } from "vitest"

import { resolveDockerBrowserTargetToIp, resolveReachableBrowserClientTarget } from "../browser.js"

type BrowserState = {
  pid: number | null
  port: number
  status: "running" | "starting" | "stopped"
  startedAt: number | null
  cdpWsUrl?: string
  dockerCdpTarget?: string
  sharedForDocker?: boolean
  mode: "cdp"
}

describe("docker browser target resolution", () => {
  it("resolves shared docker browser host aliases to numeric ips", async () => {
    const target = await resolveDockerBrowserTargetToIp(
      "host.docker.internal:9223",
      async () => ({ address: "0.250.250.254" }),
    )

    expect(target).toBe("0.250.250.254:9223")
  })

  it("falls back to the original host target when dns lookup fails", async () => {
    const target = await resolveDockerBrowserTargetToIp(
      "host.docker.internal:9223",
      async () => {
        throw new Error("lookup failed")
      },
    )

    expect(target).toBe("host.docker.internal:9223")
  })

  it("keeps numeric docker browser targets unchanged", async () => {
    const target = await resolveDockerBrowserTargetToIp(
      "0.250.250.254:9223",
      async () => ({ address: "should-not-be-used" }),
    )

    expect(target).toBe("0.250.250.254:9223")
  })

  it("keeps localhost docker browser targets unchanged", async () => {
    const target = await resolveDockerBrowserTargetToIp(
      "localhost:9223",
      async () => ({ address: "should-not-be-used" }),
    )

    expect(target).toBe("localhost:9223")
  })

  it("keeps non host:port targets unchanged", async () => {
    const target = await resolveDockerBrowserTargetToIp(
      "ws://127.0.0.1:9223/devtools/browser/test",
      async () => ({ address: "should-not-be-used" }),
    )

    expect(target).toBe("ws://127.0.0.1:9223/devtools/browser/test")
  })

  it("does not rewrite shared docker targets outside container runtimes", async () => {
    const target = await resolveReachableBrowserClientTarget(
      {
        pid: 42,
        port: 9223,
        status: "running",
        startedAt: Date.now(),
        cdpWsUrl: "ws://127.0.0.1:9223/devtools/browser/test",
        dockerCdpTarget: "host.docker.internal:9223",
        sharedForDocker: true,
        mode: "cdp",
      } satisfies BrowserState,
      {} as NodeJS.ProcessEnv,
    )

    expect(target).toBe("ws://127.0.0.1:9223/devtools/browser/test")
  })

  it("keeps plain websocket targets for non-docker browser sessions", async () => {
    const target = await resolveReachableBrowserClientTarget(
      {
        pid: 42,
        port: 9223,
        status: "running",
        startedAt: Date.now(),
        cdpWsUrl: "ws://127.0.0.1:9223/devtools/browser/test",
        mode: "cdp",
      } satisfies BrowserState,
      { TERMLINGS_DOCKER: "1" } as NodeJS.ProcessEnv,
    )

    expect(target).toBe("ws://127.0.0.1:9223/devtools/browser/test")
  })
})
