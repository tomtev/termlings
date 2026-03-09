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

const VIDEO_CONTRACT: AppApiContract = {
  app: "video",
  title: "Video",
  summary: "File-based media generation",
  actions: {
    generate: {
      summary: "Generate a video job",
      stdinJson: {
        prompt: "8 second launch teaser",
        provider: "google",
        model: "veo-3.1-generate-preview",
        image: "./hero.png",
        aspect: "16:9",
        duration: "8",
        resolution: "720p",
        out: "./teaser.mp4",
        wait: true,
      },
    },
    poll: {
      summary: "Poll an async video job",
      params: {
        id: "vid_abc123",
      },
    },
    list: {
      summary: "List video jobs",
    },
    show: {
      summary: "Show one video job",
      params: {
        id: "vid_abc123",
      },
    },
  },
  env: ["GEMINI_API_KEY"],
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Set `wait: false` for async generation, then use `poll` until complete.",
  ],
}

export async function handleVideo(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    formatMediaJob,
    formatMediaJobs,
    generateVideo,
    listMediaJobs,
    pollVideoJob,
    showMediaJob,
  } = await import("../engine/media.js")

  if (maybeHandleAppHelpOrSchema(VIDEO_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "generate") {
      assertNoExtraPositionalArgs(positional, 2, "video", "generate")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const waitValue = body.wait
      const wait = typeof waitValue === "boolean" ? waitValue : true
      const job = await generateVideo({
        provider: readOptionalString(body.provider),
        model: readOptionalString(body.model),
        prompt: readString(body.prompt, "prompt"),
        image: readOptionalString(body.image),
        aspect: readOptionalString(body.aspect) as "16:9" | "9:16" | undefined,
        duration: readOptionalString(body.duration) as "4" | "6" | "8" | undefined,
        resolution: readOptionalString(body.resolution) as "720p" | "1080p" | "4k" | undefined,
        out: readOptionalString(body.out),
        wait,
      })
      if (flags.has("json")) printJson(job)
      else console.log(formatMediaJob(job))
      return
    }

    if (subcommand === "poll") {
      assertNoExtraPositionalArgs(positional, 2, "video", "poll")
      const job = await pollVideoJob(readString(params.id, "id"))
      if (flags.has("json")) printJson(job)
      else console.log(formatMediaJob(job))
      return
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "video", "list")
      const jobs = listMediaJobs("video")
      if (flags.has("json")) printJson(jobs)
      else console.log(formatMediaJobs(jobs))
      return
    }

    if (subcommand === "show") {
      assertNoExtraPositionalArgs(positional, 2, "video", "show")
      const job = showMediaJob(readString(params.id, "id"), "video")
      if (flags.has("json")) printJson(job)
      else console.log(formatMediaJob(job))
      return
    }

    console.error(`Unknown video command: ${subcommand}`)
    console.error(renderAppApiHelp(VIDEO_CONTRACT))
    process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
