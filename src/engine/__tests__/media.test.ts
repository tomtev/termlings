import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  formatMediaJob,
  formatMediaJobs,
  generateImage,
  generateVideo,
  listMediaJobs,
  pollVideoJob,
  showMediaJob,
} from "../media.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("media app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    ipcDir: process.env.TERMLINGS_IPC_DIR,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-media-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
    ensureWorkspaceDirs(root)
    process.env.TERMLINGS_IPC_DIR = join(root, ".termlings")
    process.env.TERMLINGS_SESSION_ID = "tl-design-1"
    process.env.TERMLINGS_AGENT_SLUG = "designer"
    process.env.TERMLINGS_AGENT_NAME = "Tango"
    process.env.TERMLINGS_AGENT_DNA = "3f40bf"
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalEnv.geminiApiKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalEnv.geminiApiKey
    if (originalEnv.googleApiKey === undefined) delete process.env.GOOGLE_API_KEY
    else process.env.GOOGLE_API_KEY = originalEnv.googleApiKey
    if (originalEnv.sessionId === undefined) delete process.env.TERMLINGS_SESSION_ID
    else process.env.TERMLINGS_SESSION_ID = originalEnv.sessionId
    if (originalEnv.agentSlug === undefined) delete process.env.TERMLINGS_AGENT_SLUG
    else process.env.TERMLINGS_AGENT_SLUG = originalEnv.agentSlug
    if (originalEnv.agentName === undefined) delete process.env.TERMLINGS_AGENT_NAME
    else process.env.TERMLINGS_AGENT_NAME = originalEnv.agentName
    if (originalEnv.agentDna === undefined) delete process.env.TERMLINGS_AGENT_DNA
    else process.env.TERMLINGS_AGENT_DNA = originalEnv.agentDna
    if (originalEnv.ipcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalEnv.ipcDir
    rmSync(root, { recursive: true, force: true })
  })

  it("creates media store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "media", "jobs"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "media", "outputs"))).toBe(true)
  })

  it("stores completed image jobs and async video jobs", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key"

    const refImagePath = join(root, "input.png")
    writeFileSync(refImagePath, Buffer.from("source-image"))

    const imageBytes = Buffer.from("generated-image")
    const videoBytes = Buffer.from("generated-video")
    let operationPolls = 0

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith(":generateContent")) {
        expect(init?.method).toBe("POST")
        return new Response(JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: imageBytes.toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (url.endsWith(":predictLongRunning")) {
        return new Response(JSON.stringify({
          name: "operations/video-op-123",
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (url.endsWith("/operations/video-op-123")) {
        operationPolls += 1
        if (operationPolls === 1) {
          return new Response(JSON.stringify({ done: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        }
        return new Response(JSON.stringify({
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [
                {
                  video: {
                    uri: "https://download.example/video.mp4",
                  },
                },
              ],
            },
          },
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (url === "https://download.example/video.mp4") {
        return new Response(videoBytes, {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })
      }

      return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    }

    const imageJob = await generateImage({
      prompt: "pixel-art founder dashboard hero",
      image: "./input.png",
      out: "./hero.png",
    }, root, fetchImpl)

    expect(imageJob.status).toBe("completed")
    expect(imageJob.model).toBe("nano-banana-2")
    expect(imageJob.output?.mimeType).toBe("image/png")
    expect(existsSync(join(root, "hero.png"))).toBe(true)

    const asyncVideoJob = await generateVideo({
      prompt: "8 second launch teaser",
      image: imageJob.id,
      aspect: "16:9",
      duration: "8",
      resolution: "720p",
      wait: false,
    }, root, fetchImpl)

    expect(asyncVideoJob.status).toBe("running")
    expect(asyncVideoJob.providerOperationName).toBe("operations/video-op-123")

    const firstPoll = await pollVideoJob(asyncVideoJob.id, root, fetchImpl)
    expect(firstPoll.status).toBe("running")

    const completedVideoJob = await pollVideoJob(asyncVideoJob.id, root, fetchImpl)
    expect(completedVideoJob.status).toBe("completed")
    expect(completedVideoJob.output?.mimeType).toBe("video/mp4")
    expect(existsSync(completedVideoJob.output?.path || "")).toBe(true)

    const imageJobs = listMediaJobs("image", root)
    const videoJobs = listMediaJobs("video", root)
    expect(imageJobs).toHaveLength(1)
    expect(videoJobs).toHaveLength(1)
    expect(showMediaJob(imageJob.id, "image", root).status).toBe("completed")
    expect(showMediaJob(completedVideoJob.id, "video", root).status).toBe("completed")

    expect(formatMediaJobs([...imageJobs, ...videoJobs], root)).toContain(imageJob.id)
    expect(formatMediaJob(completedVideoJob, root)).toContain("video/mp4")

    const activities = readRecentAppActivityEntries(20, root)
    expect(activities.map((entry) => entry.app)).toContain("media")
    expect(activities.map((entry) => entry.kind)).toContain("image.completed")
    expect(activities.map((entry) => entry.kind)).toContain("video.started")
    expect(activities.map((entry) => entry.kind)).toContain("video.completed")
  })
})
