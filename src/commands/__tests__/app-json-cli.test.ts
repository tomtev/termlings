import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { spawn, spawnSync } from "child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { createServer } from "http"
import { tmpdir } from "os"
import { join } from "path"

import { ensureWorkspaceDirs } from "../../workspace/state.js"

const CLI_ENTRY = join(import.meta.dir, "../../../bin/termlings.js")

function runCli(root: string, args: string[], stdin?: string) {
  return spawnSync(process.execPath, ["run", CLI_ENTRY, ...args], {
    cwd: root,
    encoding: "utf8",
    input: stdin,
  })
}

function runCliAsync(root: string, args: string[], stdin?: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["run", CLI_ENTRY, ...args], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (status) => {
      resolve({ status, stdout, stderr })
    })

    if (stdin) child.stdin.write(stdin)
    child.stdin.end()
  })
}

describe("JSON-first app CLI", () => {
  let root = ""
  let originalCwd = ""

  beforeEach(() => {
    originalCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), "termlings-app-json-cli-"))
    process.chdir(root)
    ensureWorkspaceDirs(root)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  it("prints social schema and accepts stdin-json writes", () => {
    const schema = runCli(root, ["social", "schema", "create"])
    expect(schema.status).toBe(0)
    expect(schema.stdout).toContain("\"action\": \"create\"")
    expect(schema.stdout).toContain("\"stdinJson\"")

    const create = runCli(root, ["social", "create", "--stdin-json", "--json"], JSON.stringify({
      platform: "x",
      text: "Ship update",
    }))
    expect(create.status).toBe(0)
    expect(create.stdout).toContain("\"platform\": \"x\"")
    expect(create.stdout).toContain("\"status\": \"draft\"")

    const list = runCli(root, ["social", "list", "--params", "{\"status\":\"all\",\"limit\":10}", "--json"])
    expect(list.status).toBe(0)
    expect(list.stdout).toContain("\"Ship update\"")
  })

  it("rejects the old positional social create form", () => {
    const legacy = runCli(root, ["social", "create", "x", "Ship update"])
    expect(legacy.status).not.toBe(0)
    expect(legacy.stderr).toContain("Use --params and --stdin-json instead")
  })

  it("creates and lists app schedules through JSON", () => {
    const scheduleSchema = runCli(root, ["analytics", "schema", "schedule.create"])
    expect(scheduleSchema.status).toBe(0)
    expect(scheduleSchema.stdout).toContain("\"invoke\": [")
    expect(scheduleSchema.stdout).toContain("\"analytics\"")
    expect(scheduleSchema.stdout).toContain("\"schedule\"")
    expect(scheduleSchema.stdout).toContain("\"create\"")
    expect(scheduleSchema.stdout).toContain("termlings analytics schedule create")

    const create = runCli(
      root,
      ["analytics", "schedule", "create", "--stdin-json", "--json"],
      JSON.stringify({
        action: "sync",
        recurrence: "daily",
        time: "07:00",
        last: "30d",
      }),
    )
    expect(create.status).toBe(0)
    expect(create.stdout).toContain("\"app\": \"analytics\"")

    const list = runCli(root, ["analytics", "schedule", "list", "--json"])
    expect(list.status).toBe(0)
    expect(list.stdout).toContain("\"recurrence\": \"daily\"")
  })

  it("creates and renders a design asset through JSON", () => {
    const schema = runCli(root, ["design", "schema", "render"])
    expect(schema.status).toBe(0)
    expect(schema.stdout).toContain("\"app\": \"design\"")
    expect(schema.stdout).toContain("\"action\": \"render\"")
    expect(schema.stdout).toContain("\"stdinJson\"")

    const templates = runCli(root, ["design", "templates", "list", "--json"])
    expect(templates.status).toBe(0)
    expect(templates.stdout).toContain("\"id\": \"starter\"")
    expect(templates.stdout).toContain("\"id\": \"og-standard\"")
    expect(templates.stdout).toContain("\"id\": \"og-pricing\"")
    expect(templates.stdout).toContain("\"id\": \"linkedin-announcement\"")
    expect(templates.stdout).toContain("\"id\": \"quote-card\"")

    const template = runCli(root, ["design", "templates", "show", "--params", "{\"id\":\"og-standard\"}", "--json"])
    expect(template.status).toBe(0)
    expect(template.stdout).toContain("\"id\": \"og-standard\"")
    expect(template.stdout).toContain("\"width\": 1200")

    const init = runCli(
      root,
      ["design", "init", "--stdin-json", "--json"],
      JSON.stringify({ id: "launch-card", template: "og-standard" }),
    )
    expect(init.status).toBe(0)
    expect(init.stdout).toContain("launch-card.design.tsx")
    expect(init.stdout).toContain("\"template\": \"og-standard\"")

    const render = runCli(
      root,
      ["design", "render", "--stdin-json", "--json"],
      JSON.stringify({ id: "launch-card", format: "png" }),
    )
    expect(render.status).toBe(0)
    expect(render.stdout).toContain("\"format\": \"png\"")

    const payload = JSON.parse(render.stdout) as { path: string }
    expect(existsSync(join(root, payload.path))).toBe(true)
  })

  it("renders a design that imports a completed media image job", () => {
    const mediaDir = join(root, ".termlings", "store", "media")
    mkdirSync(join(mediaDir, "jobs"), { recursive: true })
    mkdirSync(join(mediaDir, "outputs"), { recursive: true })

    const sourcePath = join(mediaDir, "outputs", "img_fixture.png")
    writeFileSync(
      sourcePath,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nX1cAAAAASUVORK5CYII=", "base64"),
    )

    writeFileSync(
      join(mediaDir, "jobs", "img_fixture.json"),
      JSON.stringify({
        id: "img_fixture",
        type: "image",
        provider: "google",
        model: "fixture",
        status: "completed",
        prompt: "fixture",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        output: {
          path: ".termlings/store/media/outputs/img_fixture.png",
          mimeType: "image/png",
          sizeBytes: 68,
        },
      }, null, 2),
    )

    writeFileSync(
      join(root, ".termlings", "design", "media-image.design.tsx"),
      `/** @jsxImportSource termlings/design */
import { Screen, Frame, Image } from "termlings/design"

export const meta = {
  id: "media-image",
  title: "Media Image",
  size: { width: 1200, height: 630 }
}

export default function Design() {
  return (
    <Screen id="hero" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col items-center justify-center h-full bg-card border border-border rounded-3xl p-12">
        <Image id="hero-image" src="img_fixture" className="w-16 h-16 rounded-2xl overflow-hidden" />
      </Frame>
    </Screen>
  )
}
`,
      "utf8",
    )

    const render = runCli(
      root,
      ["design", "render", "--stdin-json", "--json"],
      JSON.stringify({ id: "media-image", format: "png" }),
    )
    expect(render.status).toBe(0)
    expect(render.stdout).toContain("\"format\": \"png\"")

    const payload = JSON.parse(render.stdout) as { path: string }
    expect(existsSync(join(root, payload.path))).toBe(true)
  })

  it("renders a design that imports an external image URL", async () => {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nX1cAAAAASUVORK5CYII=",
      "base64",
    )

    const server = createServer((req, res) => {
      if (req.url === "/fixture.png") {
        res.statusCode = 200
        res.setHeader("content-type", "image/png")
        res.end(pngBytes)
        return
      }
      res.statusCode = 404
      res.end("not found")
    })

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => resolve())
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      server.close()
      throw new Error("Failed to start local image server")
    }

    try {
      writeFileSync(
        join(root, ".termlings", "design", "remote-image.design.tsx"),
        `/** @jsxImportSource termlings/design */
import { Screen, Frame, Image } from "termlings/design"

export const meta = {
  id: "remote-image",
  title: "Remote Image",
  size: { width: 1200, height: 630 }
}

export default function Design() {
  return (
    <Screen id="hero" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col items-center justify-center h-full bg-card border border-border rounded-3xl p-12">
        <Image id="hero-image" src="http://127.0.0.1:${address.port}/fixture.png" className="w-16 h-16 rounded-2xl overflow-hidden" />
      </Frame>
    </Screen>
  )
}
`,
        "utf8",
      )

      const render = await runCliAsync(
        root,
        ["design", "render", "--stdin-json", "--json"],
        JSON.stringify({ id: "remote-image", format: "png" }),
      )
      expect(render.status).toBe(0)
      expect(render.stdout).toContain("\"format\": \"png\"")

      const payload = JSON.parse(render.stdout) as { path: string }
      expect(existsSync(join(root, payload.path))).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
