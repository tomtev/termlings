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

const DESIGN_CONTRACT: AppApiContract = {
  app: "design",
  title: "Design",
  summary: "Local-first design assets authored as .design.tsx",
  actions: {
    init: {
      summary: "Create a design asset from a built-in template",
      stdinJson: {
        id: "hero-card",
        template: "og-standard",
      },
    },
    "templates.list": {
      summary: "List built-in design templates",
    },
    "templates.show": {
      summary: "Inspect one built-in design template",
      params: {
        id: "og-standard",
      },
    },
    list: {
      summary: "List design assets",
    },
    brief: {
      summary: "Summarize one design asset",
      params: {
        id: "hero-card",
      },
    },
    tree: {
      summary: "Return the normalized node tree for one design asset",
      params: {
        id: "hero-card",
      },
    },
    inspect: {
      summary: "Inspect one node inside a design asset",
      params: {
        id: "hero-card",
        node: "headline",
      },
    },
    props: {
      summary: "Show prop definitions for one design asset",
      params: {
        id: "hero-card",
      },
    },
    validate: {
      summary: "Validate one design asset",
      params: {
        id: "hero-card",
      },
    },
    render: {
      summary: "Render one design asset to SVG or PNG",
      stdinJson: {
        id: "hero-card",
        format: "png",
        out: "/tmp/hero-card.png",
        props: {
          title: "Launch faster",
        },
      },
    },
  },
  notes: [
    "Design source files live under .termlings/design/*.design.tsx.",
    "The first slice supports single-file assets. Shared component imports are not implemented yet.",
    "Use `termlings design templates list --json` to discover built-in starters before `init`.",
  ],
}

export async function handleDesign(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    formatDesignTemplateList,
    formatDesignList,
    initDesign,
    inspectDesignNode,
    listDesigns,
    listDesignTemplates,
    readDesignTemplate,
    readDesignSummary,
    renderDesign,
  } = await import("../engine/design.js")

  if (maybeHandleAppHelpOrSchema(DESIGN_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "init") {
      assertNoExtraPositionalArgs(positional, 2, "design", "init")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const created = initDesign({
        id: readString(body.id, "id"),
        template: readOptionalString(body.template),
      })
      printJson(created)
      return
    }

    if (subcommand === "templates") {
      const nested = positional[2] || "list"
      if (nested === "list") {
        assertNoExtraPositionalArgs(positional, 3, "design", "templates list")
        const items = listDesignTemplates()
        if (flags.has("json")) printJson(items)
        else console.log(formatDesignTemplateList(items))
        return
      }

      if (nested === "show") {
        assertNoExtraPositionalArgs(positional, 3, "design", "templates show")
        printJson(readDesignTemplate(readString(params.id, "id")))
        return
      }

      throw new Error(`Unknown design templates command: ${nested}`)
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "design", "list")
      const items = await listDesigns()
      if (flags.has("json")) printJson(items)
      else console.log(formatDesignList(items))
      return
    }

    if (subcommand === "brief" || subcommand === "tree" || subcommand === "props" || subcommand === "validate") {
      assertNoExtraPositionalArgs(positional, 2, "design", subcommand)
      const summary = await readDesignSummary(readString(params.id, "id"), {})
      if (subcommand === "brief") {
        printJson({
          id: summary.id,
          title: summary.title,
          intent: summary.intent || null,
          audience: summary.audience || null,
          path: summary.path,
          size: summary.size,
          props: Object.keys(summary.props),
          warnings: summary.warnings,
          errors: summary.errors,
        })
        return
      }
      if (subcommand === "tree") {
        printJson(summary.tree)
        return
      }
      if (subcommand === "props") {
        printJson(summary.props)
        return
      }
      printJson({
        ok: summary.errors.length === 0,
        warnings: summary.warnings,
        errors: summary.errors,
      })
      return
    }

    if (subcommand === "inspect") {
      assertNoExtraPositionalArgs(positional, 2, "design", "inspect")
      const node = await inspectDesignNode(
        readString(params.id, "id"),
        readString(params.node, "node"),
        {},
      )
      printJson(node)
      return
    }

    if (subcommand === "render") {
      assertNoExtraPositionalArgs(positional, 2, "design", "render")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const result = await renderDesign({
        id: readString(body.id, "id"),
        format: readOptionalString(body.format),
        out: readOptionalString(body.out),
        props: body.props && typeof body.props === "object" && !Array.isArray(body.props)
          ? body.props as Record<string, unknown>
          : undefined,
      })
      printJson(result)
      return
    }

    console.error(`Unknown design command: ${subcommand}`)
    console.error(renderAppApiHelp(DESIGN_CONTRACT))
    process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
