import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseParamsJson,
  printJson,
  readOptionalString,
  readStdinJson,
  readString,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const IMAGE_CONTRACT: AppApiContract = {
  app: "image",
  title: "Image",
  summary: "File-based media generation",
  actions: {
    generate: {
      summary: "Generate an image job",
      stdinJson: {
        prompt: "pixel-art startup dashboard hero",
        provider: "google",
        model: "gemini-3.1-flash-image-preview",
        image: "./input.png",
        out: "./hero.png",
      },
    },
    list: {
      summary: "List image jobs",
    },
    show: {
      summary: "Show one image job",
      params: {
        id: "img_abc123",
      },
    },
  },
  env: ["GEMINI_API_KEY"],
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Request `GEMINI_API_KEY` into `.termlings/.env` with `termlings request env ... --scope termlings`.",
  ],
}

export async function handleImage(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    formatMediaJob,
    formatMediaJobs,
    generateImage,
    listMediaJobs,
    showMediaJob,
  } = await import("../engine/media.js")

  if (maybeHandleAppHelpOrSchema(IMAGE_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "generate") {
      assertNoExtraPositionalArgs(positional, 2, "image", "generate")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const job = await generateImage({
        provider: readOptionalString(body.provider),
        model: readOptionalString(body.model),
        prompt: readString(body.prompt, "prompt"),
        image: readOptionalString(body.image),
        out: readOptionalString(body.out),
      })
      if (flags.has("json")) printJson(job)
      else console.log(formatMediaJob(job))
      return
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "image", "list")
      const jobs = listMediaJobs("image")
      if (flags.has("json")) printJson(jobs)
      else console.log(formatMediaJobs(jobs))
      return
    }

    if (subcommand === "show") {
      assertNoExtraPositionalArgs(positional, 2, "image", "show")
      const job = showMediaJob(readString(params.id, "id"), "image")
      if (flags.has("json")) printJson(job)
      else console.log(formatMediaJob(job))
      return
    }

    console.error(`Unknown image command: ${subcommand}`)
    console.error(renderAppApiHelp(IMAGE_CONTRACT))
    process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
