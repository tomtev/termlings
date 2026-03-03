import {
  createBrandTemplate,
  createOrReplaceBrand,
  extractBrand,
  getBrandPathValue,
  listBrandProfiles,
  mergeBrandData,
  normalizeBrandProfile,
  readBrand,
  relativeBrandFilePath,
  setBrandPathValue,
  validateBrand,
  writeBrand,
  type BrandData,
  type DeepPartial,
} from "../engine/brand.js";

function printHelp(): void {
  console.log(`
Brand - Project brand profile for agents

USAGE:
  termlings brand [--profile <id>]
  termlings brand show [--profile <id>] [--json]
  termlings brand init [--profile <id>] [--name <name>] [--primary <hex>] [--logo <path>] [--domain <domain>] [--email <email>] [--force]
  termlings brand extract [--profile <id>] [--from tailwind,shadcn,css,logos,package] [--write] [--replace] [--json]
  termlings brand get <path> [--profile <id>] [--json]
  termlings brand set <path> <value> [--profile <id>] [--json-value]
  termlings brand validate [--profile <id>] [--strict] [--json]
  termlings brand profiles [--json]
  termlings brand schema [--json]

FILES:
  brand/brand.json          Default brand profile
  brand/profiles/<id>.json  Additional profiles (future multi-brand support)
  brand/logo.svg            Optional logo asset (recommended)

COMMANDS:
  show      Print current brand profile (default command)
  init      Create selected brand profile from template
  extract   Try to detect colors/logos/domain from project files
  get       Read one field via dot-path (e.g. colors.primary)
  set       Write one field via dot-path
  validate  Validate shape + references (strict checks optional)
  profiles  List available brand profiles
  schema    Print canonical schema/template structure

PROFILE:
  --profile <id>            Select brand profile (default: default)

FIELD NOTES:
  voice                       One plain string for brand voice/tone.
  colors.*                    CSS color tokens (hex or CSS color values).
  logos.*                     Relative file paths to logo assets.
  identity.domain.*           Public domains/URLs used by the product.
  identity.email.*            Public sender/contact emails (non-secret).
  sources                     Files used by extraction (audit/debug aid).

SCHEMA STRUCTURE (brand/brand.json):
{
  "schemaVersion": 1,
  "name": "Termlings",
  "voice": "Clear, pragmatic, direct. Friendly but not fluffy. Avoid hype and jargon.",
  "colors": {
    "primary": "#574747",
    "secondary": "#F4F4F5",
    "accent": "#F4F4F5",
    "background": "#FFFFFF",
    "foreground": "#09090B",
    "palette": []
  },
  "logos": {
    "main": "",
    "mark": "",
    "favicon": ""
  },
  "identity": {
    "domain": {
      "primary": "termlings.com",
      "website": "https://termlings.com",
      "app": "",
      "docs": "",
      "api": ""
    },
    "email": {
      "fromName": "Termlings",
      "fromAddress": "",
      "replyTo": "",
      "support": "",
      "sales": "",
      "security": "",
      "noreply": ""
    }
  },
  "sources": [],
  "updatedAt": "2026-03-03T00:00:00.000Z"
}

EXAMPLES:
  termlings brand init --name "Acme"
  termlings brand show --profile marketing
  termlings brand extract --write
  termlings brand get colors.primary
  termlings brand set voice "Clear, direct, no hype."
  termlings brand set colors.palette '["#111111","#FFFFFF"]' --json-value
  termlings brand validate --strict
`);
}

function resolveProfileOrExit(opts: Record<string, string>): string {
  try {
    return normalizeBrandProfile(opts.profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

function loadBrandOrFail(root = process.cwd(), profile = "default"): BrandData {
  const brand = readBrand(root, profile);
  if (brand) return brand;
  console.error(`No brand profile found at ${relativeBrandFilePath(root, profile)}.`);
  console.error(`Run: termlings brand init --profile ${profile}`);
  process.exit(1);
}

function printBrandSummary(brand: BrandData, profile = "default"): void {
  console.log(`Profile: ${profile}`);
  console.log(`Name: ${brand.name}`);
  console.log(`Voice: ${brand.voice || "-"}`);
  console.log(`Domain: ${brand.identity.domain.primary || "-"}`);
  console.log(`Website: ${brand.identity.domain.website || "-"}`);
  console.log(`Email: ${brand.identity.email.fromAddress || "-"}`);
  console.log(`Primary: ${brand.colors.primary || "-"}`);
  console.log(`Secondary: ${brand.colors.secondary || "-"}`);
  console.log(`Accent: ${brand.colors.accent || "-"}`);
  console.log(`Background: ${brand.colors.background || "-"}`);
  console.log(`Foreground: ${brand.colors.foreground || "-"}`);
  console.log(`Logo: ${brand.logos.main || "-"}`);
  console.log(`Mark: ${brand.logos.mark || "-"}`);
  console.log(`Favicon: ${brand.logos.favicon || "-"}`);
  console.log(`Sources: ${brand.sources.length}`);
  console.log(`Updated: ${brand.updatedAt || "-"}`);
}

function parseSetValue(flags: Set<string>, raw: string): unknown {
  if (!flags.has("json-value")) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Invalid JSON value: ${message}`);
    process.exit(1);
  }
}

export async function handleBrand(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const subcommand = positional[1] || "show";
  const profile = resolveProfileOrExit(opts);

  if (flags.has("help") || subcommand === "help") {
    printHelp();
    return;
  }

  if (subcommand === "schema") {
    const schema = createBrandTemplate();
    if (flags.has("json")) {
      console.log(JSON.stringify(schema, null, 2));
      return;
    }
    console.log(JSON.stringify(schema, null, 2));
    return;
  }

  if (subcommand === "init") {
    const patch: DeepPartial<BrandData> = {};
    if (opts.name) patch.name = opts.name;
    if (opts.primary || opts.logo || opts.domain || opts.email) {
      patch.colors = {};
      patch.logos = {};
      patch.identity = { domain: {}, email: {} };
      if (opts.primary) patch.colors.primary = opts.primary;
      if (opts.logo) patch.logos.main = opts.logo;
      if (opts.domain) patch.identity.domain.primary = opts.domain;
      if (opts.domain && !opts.website) patch.identity.domain.website = `https://${opts.domain}`;
      if (opts.email) patch.identity.email.fromAddress = opts.email;
    }
    const created = createOrReplaceBrand(process.cwd(), patch, flags.has("force"), profile);
    console.log(`Created ${relativeBrandFilePath(process.cwd(), profile)}`);
    if (flags.has("json")) {
      console.log(JSON.stringify(created, null, 2));
      return;
    }
    printBrandSummary(created, profile);
    return;
  }

  if (subcommand === "extract") {
    const result = extractBrand(process.cwd(), opts.from);
    if (!flags.has("write")) {
      if (flags.has("json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("Extract preview (not written):");
        console.log(JSON.stringify(result.extracted, null, 2));
        if (result.sources.length > 0) {
          console.log(`Sources: ${result.sources.join(", ")}`);
        }
        if (result.notes.length > 0) {
          for (const note of result.notes) console.log(`Note: ${note}`);
        }
        console.log('Run with "--write" to persist.');
      }
      return;
    }

    const base = readBrand(process.cwd(), profile) || createBrandTemplate();
    const merged = mergeBrandData(base, result.extracted, flags.has("replace"));
    merged.sources = Array.from(new Set([...base.sources, ...result.sources]));
    merged.updatedAt = new Date().toISOString();
    writeBrand(merged, process.cwd(), profile);

    if (flags.has("json")) {
      console.log(JSON.stringify(merged, null, 2));
      return;
    }

    console.log(`Updated ${relativeBrandFilePath(process.cwd(), profile)} from ${result.sources.length} source(s).`);
    if (result.notes.length > 0) {
      for (const note of result.notes) console.log(`Note: ${note}`);
    }
    printBrandSummary(merged, profile);
    return;
  }

  if (subcommand === "get") {
    const path = positional[2];
    if (!path) {
      console.error("Usage: termlings brand get <path> [--profile <id>] [--json]");
      process.exit(1);
    }
    const brand = loadBrandOrFail(process.cwd(), profile);
    const value = getBrandPathValue(brand, path);
    if (value === undefined) {
      console.error(`Path not found: ${path}`);
      process.exit(1);
    }
    if (flags.has("json") || typeof value === "object") {
      console.log(JSON.stringify(value, null, 2));
      return;
    }
    console.log(String(value));
    return;
  }

  if (subcommand === "set") {
    const path = positional[2];
    const rawValue = positional.slice(3).join(" ");
    if (!path || !rawValue) {
      console.error("Usage: termlings brand set <path> <value> [--profile <id>] [--json-value]");
      process.exit(1);
    }
    const value = parseSetValue(flags, rawValue);
    const brand = readBrand(process.cwd(), profile) || createBrandTemplate();
    setBrandPathValue(brand, path, value);
    brand.updatedAt = new Date().toISOString();
    writeBrand(brand, process.cwd(), profile);
    console.log(`Updated ${path} in ${relativeBrandFilePath(process.cwd(), profile)}`);
    return;
  }

  if (subcommand === "validate") {
    const brand = loadBrandOrFail(process.cwd(), profile);
    const strict = flags.has("strict");
    const issues = validateBrand(brand, process.cwd(), strict);
    if (flags.has("json")) {
      console.log(JSON.stringify({ valid: issues.every((issue) => issue.level !== "error"), issues }, null, 2));
      if (issues.some((issue) => issue.level === "error")) process.exit(1);
      return;
    }

    if (issues.length === 0) {
      console.log("Brand profile is valid.");
      return;
    }

    for (const issue of issues) {
      const label = issue.level === "error" ? "ERROR" : "WARN";
      console.log(`[${label}] ${issue.path}: ${issue.message}`);
    }
    if (issues.some((issue) => issue.level === "error")) process.exit(1);
    return;
  }

  if (subcommand === "profiles") {
    const profiles = listBrandProfiles(process.cwd());
    if (flags.has("json")) {
      console.log(JSON.stringify({ active: profile, profiles }, null, 2));
      return;
    }
    console.log(`Active profile: ${profile}`);
    if (profiles.length === 0) {
      console.log("No brand profiles found. Run: termlings brand init");
      return;
    }
    for (const id of profiles) {
      const marker = id === profile ? "*" : "-";
      console.log(`${marker} ${id} (${relativeBrandFilePath(process.cwd(), id)})`);
    }
    return;
  }

  if (subcommand === "show") {
    const brand = loadBrandOrFail(process.cwd(), profile);
    if (flags.has("json")) {
      console.log(JSON.stringify(brand, null, 2));
      return;
    }
    printBrandSummary(brand, profile);
    return;
  }

  console.error(`Unknown brand command: ${subcommand}`);
  console.error("Run: termlings brand --help");
  process.exit(1);
}
