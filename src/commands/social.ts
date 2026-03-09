import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseLimit,
  parseParamsJson,
  printJson,
  readOptionalString,
  readStdinJson,
  readString,
  readStringArray,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const SOCIAL_CONTRACT: AppApiContract = {
  app: "social",
  title: "Social",
  summary: "File-based social drafts, queue, and publishing",
  actions: {
    accounts: {
      summary: "List configured platform accounts",
    },
    create: {
      summary: "Create a draft social post",
      stdinJson: {
        platform: "x",
        text: "Shipping analytics sync this week.",
        title: "Launch note",
        link: "https://termlings.com/blog",
        media: ["./hero.png"],
      },
    },
    list: {
      summary: "List social posts",
      params: {
        status: "all",
        platform: "x",
        limit: 25,
      },
    },
    show: {
      summary: "Show one social post",
      params: {
        id: "post_x_abc123",
      },
    },
    schedule: {
      summary: "Schedule a social post for publishing",
      stdinJson: {
        id: "post_x_abc123",
        at: "2026-03-10T09:00:00+01:00",
        agent: "growth",
      },
    },
    unschedule: {
      summary: "Clear a social publish schedule",
      params: {
        id: "post_x_abc123",
      },
    },
    queue: {
      summary: "List queued scheduled posts",
    },
    publish: {
      summary: "Publish a post immediately",
      params: {
        id: "post_x_abc123",
      },
    },
    history: {
      summary: "Read social publish history",
      params: {
        limit: 25,
      },
    },
    "run-due": {
      summary: "Execute due scheduled posts now",
    },
  },
  env: [
    "SOCIAL_X_WEBHOOK_URL",
    "SOCIAL_LINKEDIN_WEBHOOK_URL",
    "SOCIAL_INSTAGRAM_WEBHOOK_URL",
    "SOCIAL_FACEBOOK_WEBHOOK_URL",
    "SOCIAL_TIKTOK_WEBHOOK_URL",
    "SOCIAL_X_HANDLE",
    "SOCIAL_LINKEDIN_HANDLE",
    "SOCIAL_INSTAGRAM_HANDLE",
    "SOCIAL_FACEBOOK_HANDLE",
    "SOCIAL_TIKTOK_HANDLE",
  ],
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Publishing stays provider-agnostic through webhooks configured in `.termlings/.env`.",
    "Due scheduled posts are executed by `termlings scheduler`.",
  ],
}

export async function handleSocial(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    createSocialPost,
    executeScheduledSocialPosts,
    formatSocialAccounts,
    formatSocialHistory,
    formatSocialPost,
    formatSocialPosts,
    getSocialPost,
    listQueuedSocialPosts,
    listSocialAccounts,
    listSocialPosts,
    publishSocialPost,
    readSocialHistory,
    scheduleSocialPost,
    socialConfigHelpText,
    unscheduleSocialPost,
  } = await import("../engine/social.js")

  if (maybeHandleAppHelpOrSchema(SOCIAL_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "accounts") {
      assertNoExtraPositionalArgs(positional, 2, "social", "accounts")
      const accounts = listSocialAccounts()
      if (flags.has("json")) printJson(accounts)
      else console.log(formatSocialAccounts(accounts))
      return
    }

    if (subcommand === "create") {
      assertNoExtraPositionalArgs(positional, 2, "social", "create")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const post = createSocialPost({
        platform: readString(body.platform, "platform") as never,
        text: readString(body.text, "text"),
        title: readOptionalString(body.title),
        link: readOptionalString(body.link),
        media: Array.isArray(body.media) ? readStringArray(body.media, "media") : [],
      })
      if (flags.has("json")) printJson(post)
      else console.log(formatSocialPost(post))
      return
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "social", "list")
      const platform = readOptionalString(params.platform)?.toLowerCase() as never
      const posts = listSocialPosts({
        status: (readOptionalString(params.status)?.toLowerCase() || "all") as never,
        platform,
        limit: parseLimit(params.limit, 25),
      })
      if (flags.has("json")) printJson(posts)
      else console.log(formatSocialPosts(posts))
      return
    }

    if (subcommand === "show") {
      assertNoExtraPositionalArgs(positional, 2, "social", "show")
      const id = readString(params.id, "id")
      const post = getSocialPost(id)
      if (!post) throw new Error(`Social post not found: ${id}`)
      if (flags.has("json")) printJson(post)
      else console.log(formatSocialPost(post))
      return
    }

    if (subcommand === "schedule") {
      assertNoExtraPositionalArgs(positional, 2, "social", "schedule")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const post = scheduleSocialPost(
        readString(body.id, "id"),
        readString(body.at, "at"),
        { agent: readOptionalString(body.agent) },
      )
      if (flags.has("json")) printJson(post)
      else console.log(formatSocialPost(post))
      return
    }

    if (subcommand === "unschedule") {
      assertNoExtraPositionalArgs(positional, 2, "social", "unschedule")
      const id = readString(params.id, "id")
      const post = unscheduleSocialPost(id)
      if (flags.has("json")) printJson(post)
      else console.log(formatSocialPost(post))
      return
    }

    if (subcommand === "queue") {
      assertNoExtraPositionalArgs(positional, 2, "social", "queue")
      const posts = listQueuedSocialPosts()
      if (flags.has("json")) printJson(posts)
      else console.log(formatSocialPosts(posts))
      return
    }

    if (subcommand === "publish") {
      assertNoExtraPositionalArgs(positional, 2, "social", "publish")
      const id = readString(params.id, "id")
      const post = await publishSocialPost(id)
      if (flags.has("json")) printJson(post)
      else console.log(formatSocialPost(post))
      return
    }

    if (subcommand === "history") {
      assertNoExtraPositionalArgs(positional, 2, "social", "history")
      const history = readSocialHistory(parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(history)
      else console.log(formatSocialHistory(history))
      return
    }

    if (subcommand === "run-due") {
      assertNoExtraPositionalArgs(positional, 2, "social", "run-due")
      const results = await executeScheduledSocialPosts()
      if (flags.has("json")) {
        printJson(results)
      } else if (results.length <= 0) {
        console.log("No scheduled social posts to publish")
      } else {
        console.log(results.map((entry) => `${entry.success ? "✓" : "✗"} ${entry.platform} ${entry.postId}${entry.error ? ` (${entry.error})` : ""}`).join("\n"))
      }
      return
    }

    console.error(`Unknown social command: ${subcommand}`)
    console.error(renderAppApiHelp(SOCIAL_CONTRACT))
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("SOCIAL_")) {
      console.error(socialConfigHelpText())
    } else {
      console.error(message)
    }
    process.exit(1)
  }
}
