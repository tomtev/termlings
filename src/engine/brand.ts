import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";

export const BRAND_SCHEMA_VERSION = 1;

export type BrandExtractSource = "tailwind" | "shadcn" | "css" | "logos" | "package";

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  palette: string[];
}

export interface BrandLogos {
  main: string;
  mark: string;
  favicon: string;
}

export interface BrandIdentityDomain {
  primary: string;
  website: string;
  app: string;
  docs: string;
  api: string;
}

export interface BrandIdentityEmail {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  support: string;
  sales: string;
  security: string;
  noreply: string;
}

export interface BrandIdentity {
  domain: BrandIdentityDomain;
  email: BrandIdentityEmail;
}

export interface BrandData {
  schemaVersion: number;
  name: string;
  voice: string;
  colors: BrandColors;
  logos: BrandLogos;
  identity: BrandIdentity;
  sources: string[];
  updatedAt: string;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface BrandValidationIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

export interface BrandExtractResult {
  extracted: DeepPartial<BrandData>;
  sources: string[];
  notes: string[];
}

const BRAND_FILE_NAME = "brand.json";
const BRAND_PROFILES_DIR_NAME = "profiles";
const DEFAULT_BRAND_PROFILE = "default";
const DEFAULT_EXTRACT_SOURCES: BrandExtractSource[] = ["tailwind", "shadcn", "css", "logos", "package"];
const COLOR_HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const COLOR_HEX_TOKEN_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CSS_VAR_RE = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const PATH_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const BRAND_PROFILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value;
}

function cleanStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) out.push(entry);
  }
  return out;
}

function nowIso(): string {
  return new Date().toISOString();
}

function titleCase(input: string): string {
  const parts = input
    .trim()
    .replace(/^@/, "")
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function uniqueStrings(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function readPackageJson(root: string): Record<string, unknown> | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function inferBrandName(root: string): string {
  const pkg = readPackageJson(root);
  const packageName = cleanString(pkg?.name, "");
  if (packageName) return titleCase(packageName);
  const project = root.split(/[\\/]/).filter(Boolean).pop() || "Brand";
  return titleCase(project) || "Brand";
}

function inferDomainFromHomepage(root: string): { primary: string; website: string } {
  const pkg = readPackageJson(root);
  const homepage = cleanString(pkg?.homepage, "").trim();
  if (!homepage) return { primary: "", website: "" };
  try {
    const url = new URL(homepage);
    const hostname = url.hostname.replace(/^www\./i, "");
    return {
      primary: hostname,
      website: `${url.protocol}//${url.host}`,
    };
  } catch {
    return { primary: "", website: "" };
  }
}

function firstExistingRelative(root: string, candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(join(root, candidate))) return candidate;
  }
  return "";
}

function normalizeColorHex(input: string): string {
  if (!input.startsWith("#")) return input;
  if (input.length === 4) {
    const r = input[1] ?? "0";
    const g = input[2] ?? "0";
    const b = input[3] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return input.toUpperCase();
}

function extractHexColors(text: string): string[] {
  const matches = text.match(COLOR_HEX_RE);
  if (!matches) return [];
  return uniqueStrings(matches.map((value) => normalizeColorHex(value)));
}

function extractCssVariableHexes(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const matches = text.matchAll(CSS_VAR_RE);
  for (const match of matches) {
    const name = (match[1] || "").trim().toLowerCase();
    const value = (match[2] || "").trim();
    const hex = extractHexColors(value)[0];
    if (!name || !hex || out.has(name)) continue;
    out.set(name, hex);
  }
  return out;
}

function colorBrightness(hex: string): number {
  const normalized = normalizeColorHex(hex).replace("#", "");
  if (normalized.length !== 6) return 0;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function pickLightestColor(colors: string[]): string | undefined {
  if (colors.length === 0) return undefined;
  return [...colors].sort((a, b) => colorBrightness(b) - colorBrightness(a))[0];
}

function pickDarkestColor(colors: string[]): string | undefined {
  if (colors.length === 0) return undefined;
  return [...colors].sort((a, b) => colorBrightness(a) - colorBrightness(b))[0];
}

function pickByVariableNames(vars: Map<string, string>, names: string[]): string | undefined {
  const wanted = names.map((name) => name.toLowerCase());
  for (const candidate of wanted) {
    const exact = vars.get(candidate);
    if (exact) return exact;
  }
  for (const [name, value] of vars) {
    for (const candidate of wanted) {
      if (name.endsWith(candidate)) return value;
    }
  }
  return undefined;
}

function listCssFiles(dir: string, maxFiles = 6): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((entry) => entry.endsWith(".css"))
      .slice(0, maxFiles)
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
}

function parseExtractSources(raw?: string): BrandExtractSource[] {
  if (!raw) return [...DEFAULT_EXTRACT_SOURCES];
  const parts = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const out: BrandExtractSource[] = [];
  for (const part of parts) {
    if (part === "tailwind" || part === "shadcn" || part === "css" || part === "logos" || part === "package") {
      out.push(part);
    }
  }
  return out.length > 0 ? uniqueStrings(out) as BrandExtractSource[] : [...DEFAULT_EXTRACT_SOURCES];
}

function toRelative(root: string, absolutePath: string): string {
  const rel = relative(root, absolutePath).replace(/\\/g, "/");
  return rel.startsWith("./") ? rel.slice(2) : rel;
}

function readFileIfPresent(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function collectColorSignalsFromFile(
  root: string,
  filePath: string,
  palette: string[],
  variableHexes: Map<string, string>,
  sourceFiles: string[],
): void {
  const content = readFileIfPresent(filePath);
  if (!content) return;
  sourceFiles.push(toRelative(root, filePath));

  for (const color of extractHexColors(content)) {
    if (!palette.includes(color)) palette.push(color);
  }
  for (const [name, color] of extractCssVariableHexes(content)) {
    if (!variableHexes.has(name)) variableHexes.set(name, color);
  }
}

function normalizeBrand(input: unknown, root: string): BrandData {
  const defaults = createBrandTemplate(root);
  const raw = asRecord(input);
  if (!raw) return defaults;

  const colorsRaw = asRecord(raw.colors);
  const logosRaw = asRecord(raw.logos);
  const identityRaw = asRecord(raw.identity);
  const domainRaw = asRecord(identityRaw?.domain);
  const emailRaw = asRecord(identityRaw?.email);

  return {
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : defaults.schemaVersion,
    name: cleanString(raw.name, defaults.name),
    voice: cleanString(raw.voice, defaults.voice),
    colors: {
      primary: cleanString(colorsRaw?.primary, defaults.colors.primary),
      secondary: cleanString(colorsRaw?.secondary, defaults.colors.secondary),
      accent: cleanString(colorsRaw?.accent, defaults.colors.accent),
      background: cleanString(colorsRaw?.background, defaults.colors.background),
      foreground: cleanString(colorsRaw?.foreground, defaults.colors.foreground),
      palette: cleanStringArray(colorsRaw?.palette, defaults.colors.palette),
    },
    logos: {
      main: cleanString(logosRaw?.main, defaults.logos.main),
      mark: cleanString(logosRaw?.mark, defaults.logos.mark),
      favicon: cleanString(logosRaw?.favicon, defaults.logos.favicon),
    },
    identity: {
      domain: {
        primary: cleanString(domainRaw?.primary, defaults.identity.domain.primary),
        website: cleanString(domainRaw?.website, defaults.identity.domain.website),
        app: cleanString(domainRaw?.app, defaults.identity.domain.app),
        docs: cleanString(domainRaw?.docs, defaults.identity.domain.docs),
        api: cleanString(domainRaw?.api, defaults.identity.domain.api),
      },
      email: {
        fromName: cleanString(emailRaw?.fromName, defaults.identity.email.fromName),
        fromAddress: cleanString(emailRaw?.fromAddress, defaults.identity.email.fromAddress),
        replyTo: cleanString(emailRaw?.replyTo, defaults.identity.email.replyTo),
        support: cleanString(emailRaw?.support, defaults.identity.email.support),
        sales: cleanString(emailRaw?.sales, defaults.identity.email.sales),
        security: cleanString(emailRaw?.security, defaults.identity.email.security),
        noreply: cleanString(emailRaw?.noreply, defaults.identity.email.noreply),
      },
    },
    sources: cleanStringArray(raw.sources, defaults.sources),
    updatedAt: cleanString(raw.updatedAt, defaults.updatedAt),
  };
}

function mergeString(base: string, next: unknown): string {
  if (typeof next !== "string") return base;
  return next;
}

export function getBrandDir(root = process.cwd()): string {
  return join(root, "brand");
}

export function normalizeBrandProfile(profile?: string): string {
  const raw = (profile || DEFAULT_BRAND_PROFILE).trim();
  if (!raw) return DEFAULT_BRAND_PROFILE;
  if (!BRAND_PROFILE_ID_RE.test(raw)) {
    throw new Error(`Invalid brand profile "${raw}". Use letters, numbers, underscores, or dashes.`);
  }
  return raw;
}

export function getBrandProfilesDir(root = process.cwd()): string {
  return join(getBrandDir(root), BRAND_PROFILES_DIR_NAME);
}

export function getBrandFilePath(root = process.cwd(), profile = DEFAULT_BRAND_PROFILE): string {
  const profileId = normalizeBrandProfile(profile);
  if (profileId === DEFAULT_BRAND_PROFILE) {
    return join(getBrandDir(root), BRAND_FILE_NAME);
  }
  return join(getBrandProfilesDir(root), `${profileId}.json`);
}

export function createBrandTemplate(root = process.cwd()): BrandData {
  const inferredName = inferBrandName(root);
  const inferredDomain = inferDomainFromHomepage(root);

  return {
    schemaVersion: BRAND_SCHEMA_VERSION,
    name: inferredName,
    voice: "Clear, pragmatic, direct. Friendly but not fluffy. Avoid hype and jargon.",
    colors: {
      primary: "#574747",
      secondary: "#F4F4F5",
      accent: "#F4F4F5",
      background: "#FFFFFF",
      foreground: "#09090B",
      palette: [],
    },
    logos: {
      main: firstExistingRelative(root, ["brand/logo.svg", "brand/logo.png", "public/logo.svg", "public/logo.png"]),
      mark: firstExistingRelative(root, ["brand/mark.svg", "brand/mark.png", "public/mark.svg", "public/mark.png"]),
      favicon: firstExistingRelative(root, ["public/favicon.svg", "public/favicon.png", "public/favicon.ico"]),
    },
    identity: {
      domain: {
        primary: inferredDomain.primary,
        website: inferredDomain.website,
        app: "",
        docs: "",
        api: "",
      },
      email: {
        fromName: inferredName,
        fromAddress: "",
        replyTo: "",
        support: "",
        sales: "",
        security: "",
        noreply: "",
      },
    },
    sources: [],
    updatedAt: nowIso(),
  };
}

export function readBrand(root = process.cwd(), profile = DEFAULT_BRAND_PROFILE): BrandData | null {
  const path = getBrandFilePath(root, profile);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return normalizeBrand(parsed, root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${message}`);
  }
}

export function writeBrand(brand: BrandData, root = process.cwd(), profile = DEFAULT_BRAND_PROFILE): void {
  const profileId = normalizeBrandProfile(profile);
  mkdirSync(getBrandDir(root), { recursive: true });
  if (profileId !== DEFAULT_BRAND_PROFILE) {
    mkdirSync(getBrandProfilesDir(root), { recursive: true });
  }
  const normalized = normalizeBrand(brand, root);
  writeFileSync(getBrandFilePath(root, profileId), JSON.stringify(normalized, null, 2) + "\n");
}

export function mergeBrandData(base: BrandData, patch: DeepPartial<BrandData>, replaceArrays = false): BrandData {
  const next: BrandData = normalizeBrand(base, process.cwd());

  if (typeof patch.schemaVersion === "number") next.schemaVersion = patch.schemaVersion;
  next.name = mergeString(next.name, patch.name);
  next.voice = mergeString(next.voice, patch.voice);
  next.updatedAt = mergeString(next.updatedAt, patch.updatedAt);

  if (Array.isArray(patch.sources)) {
    const incoming = cleanStringArray(patch.sources);
    next.sources = replaceArrays ? incoming : uniqueStrings([...next.sources, ...incoming]);
  }

  const colors = patch.colors;
  if (colors) {
    next.colors.primary = mergeString(next.colors.primary, colors.primary);
    next.colors.secondary = mergeString(next.colors.secondary, colors.secondary);
    next.colors.accent = mergeString(next.colors.accent, colors.accent);
    next.colors.background = mergeString(next.colors.background, colors.background);
    next.colors.foreground = mergeString(next.colors.foreground, colors.foreground);
    if (Array.isArray(colors.palette)) {
      const incoming = cleanStringArray(colors.palette);
      next.colors.palette = replaceArrays ? incoming : uniqueStrings([...next.colors.palette, ...incoming]);
    }
  }

  const logos = patch.logos;
  if (logos) {
    next.logos.main = mergeString(next.logos.main, logos.main);
    next.logos.mark = mergeString(next.logos.mark, logos.mark);
    next.logos.favicon = mergeString(next.logos.favicon, logos.favicon);
  }

  const identity = patch.identity;
  if (identity?.domain) {
    next.identity.domain.primary = mergeString(next.identity.domain.primary, identity.domain.primary);
    next.identity.domain.website = mergeString(next.identity.domain.website, identity.domain.website);
    next.identity.domain.app = mergeString(next.identity.domain.app, identity.domain.app);
    next.identity.domain.docs = mergeString(next.identity.domain.docs, identity.domain.docs);
    next.identity.domain.api = mergeString(next.identity.domain.api, identity.domain.api);
  }
  if (identity?.email) {
    next.identity.email.fromName = mergeString(next.identity.email.fromName, identity.email.fromName);
    next.identity.email.fromAddress = mergeString(next.identity.email.fromAddress, identity.email.fromAddress);
    next.identity.email.replyTo = mergeString(next.identity.email.replyTo, identity.email.replyTo);
    next.identity.email.support = mergeString(next.identity.email.support, identity.email.support);
    next.identity.email.sales = mergeString(next.identity.email.sales, identity.email.sales);
    next.identity.email.security = mergeString(next.identity.email.security, identity.email.security);
    next.identity.email.noreply = mergeString(next.identity.email.noreply, identity.email.noreply);
  }

  return next;
}

function parsePathSegments(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Path cannot be empty.");
  const segments = trimmed.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) throw new Error("Path cannot be empty.");
  for (const segment of segments) {
    if (!PATH_SEGMENT_RE.test(segment)) {
      throw new Error(`Invalid path segment "${segment}". Use letters, numbers, underscores, or dashes.`);
    }
  }
  return segments;
}

export function getBrandPathValue(brand: BrandData, path: string): unknown {
  const segments = parsePathSegments(path);
  let cursor: unknown = brand;
  for (const segment of segments) {
    const record = asRecord(cursor);
    if (!record) return undefined;
    cursor = record[segment];
  }
  return cursor;
}

export function setBrandPathValue(brand: BrandData, path: string, value: unknown): void {
  const segments = parsePathSegments(path);
  const rootRecord = brand as unknown as Record<string, unknown>;
  let cursor: Record<string, unknown> = rootRecord;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    const existing = cursor[segment];
    const existingRecord = asRecord(existing);
    if (existingRecord) {
      cursor = existingRecord;
      continue;
    }
    const nextRecord: Record<string, unknown> = {};
    cursor[segment] = nextRecord;
    cursor = nextRecord;
  }
  const last = segments[segments.length - 1]!;
  cursor[last] = value;
}

function isAcceptableColorValue(input: string): boolean {
  const value = input.trim();
  if (!value) return false;
  if (COLOR_HEX_TOKEN_RE.test(value)) return true;
  return value.startsWith("var(")
    || value.startsWith("rgb(")
    || value.startsWith("rgba(")
    || value.startsWith("hsl(")
    || value.startsWith("hsla(")
    || value.startsWith("light-dark(");
}

function validateLogoPath(root: string, path: string): boolean {
  if (!path.trim()) return true;
  return existsSync(resolve(root, path));
}

export function validateBrand(brand: BrandData, root = process.cwd(), strict = false): BrandValidationIssue[] {
  const issues: BrandValidationIssue[] = [];

  if (brand.schemaVersion !== BRAND_SCHEMA_VERSION) {
    issues.push({
      level: "error",
      path: "schemaVersion",
      message: `Expected ${BRAND_SCHEMA_VERSION}, received ${brand.schemaVersion}.`,
    });
  }

  if (!brand.name.trim()) {
    issues.push({ level: "error", path: "name", message: "Brand name is required." });
  }
  if (!brand.voice.trim()) {
    issues.push({ level: strict ? "error" : "warning", path: "voice", message: "Voice guidance is empty." });
  }

  const colorFields: Array<keyof BrandColors> = ["primary", "secondary", "accent", "background", "foreground"];
  for (const field of colorFields) {
    const value = brand.colors[field];
    if (!value.trim()) {
      issues.push({
        level: strict ? "error" : "warning",
        path: `colors.${field}`,
        message: "Value is empty.",
      });
      continue;
    }
    if (strict && !isAcceptableColorValue(value)) {
      issues.push({
        level: "warning",
        path: `colors.${field}`,
        message: `Value "${value}" does not look like a CSS color token.`,
      });
    }
  }

  if (brand.colors.palette.length === 0) {
    issues.push({ level: "warning", path: "colors.palette", message: "Palette is empty." });
  }

  if (!validateLogoPath(root, brand.logos.main)) {
    issues.push({ level: "error", path: "logos.main", message: `File not found: ${brand.logos.main}` });
  }
  if (!validateLogoPath(root, brand.logos.mark)) {
    issues.push({ level: "error", path: "logos.mark", message: `File not found: ${brand.logos.mark}` });
  }
  if (!validateLogoPath(root, brand.logos.favicon)) {
    issues.push({ level: "error", path: "logos.favicon", message: `File not found: ${brand.logos.favicon}` });
  }

  const domain = brand.identity.domain.primary.trim();
  if (domain && !DOMAIN_RE.test(domain)) {
    issues.push({ level: "warning", path: "identity.domain.primary", message: `Invalid domain: ${domain}` });
  }

  const emailFields: Array<keyof BrandIdentityEmail> = [
    "fromAddress",
    "replyTo",
    "support",
    "sales",
    "security",
    "noreply",
  ];
  for (const field of emailFields) {
    const value = brand.identity.email[field].trim();
    if (!value) continue;
    if (!EMAIL_RE.test(value)) {
      issues.push({ level: "warning", path: `identity.email.${field}`, message: `Invalid email: ${value}` });
    }
  }

  return issues;
}

export function extractBrand(root = process.cwd(), fromRaw?: string): BrandExtractResult {
  const from = parseExtractSources(fromRaw);
  const extracted: DeepPartial<BrandData> = {};
  const sourceFiles: string[] = [];
  const notes: string[] = [];
  const palette: string[] = [];
  const variableHexes = new Map<string, string>();

  if (from.includes("tailwind")) {
    const candidates = [
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
      "tailwind.config.ts",
      "web/tailwind.config.js",
      "web/tailwind.config.cjs",
      "web/tailwind.config.mjs",
      "web/tailwind.config.ts",
    ];
    for (const candidate of candidates) {
      collectColorSignalsFromFile(root, join(root, candidate), palette, variableHexes, sourceFiles);
    }
  }

  if (from.includes("shadcn")) {
    const componentFiles = [join(root, "components.json"), join(root, "web/components.json")];
    for (const componentPath of componentFiles) {
      const content = readFileIfPresent(componentPath);
      if (!content) continue;
      sourceFiles.push(toRelative(root, componentPath));
      for (const color of extractHexColors(content)) {
        if (!palette.includes(color)) palette.push(color);
      }
      try {
        const parsed = JSON.parse(content) as unknown;
        const obj = asRecord(parsed);
        const cssPath = cleanString(obj?.css, "").trim();
        if (cssPath) {
          const resolvedCss = resolve(dirname(componentPath), cssPath);
          collectColorSignalsFromFile(root, resolvedCss, palette, variableHexes, sourceFiles);
        }
      } catch {
        notes.push(`Could not parse ${toRelative(root, componentPath)}.`);
      }
    }
  }

  if (from.includes("css")) {
    const cssCandidates = [
      "app/globals.css",
      "src/app/globals.css",
      "src/styles/globals.css",
      "styles/globals.css",
      "src/styles.css",
      "web/src/app.css",
      "web/src/styles.css",
      "web/src/lib/styles.css",
    ];
    for (const candidate of cssCandidates) {
      collectColorSignalsFromFile(root, join(root, candidate), palette, variableHexes, sourceFiles);
    }

    if (palette.length === 0) {
      const fallbackDirs = [
        join(root, "web/build/client/_app/immutable/assets"),
        join(root, "web/.svelte-kit/output/server/_app/immutable/assets"),
      ];
      for (const dir of fallbackDirs) {
        for (const cssFile of listCssFiles(dir)) {
          collectColorSignalsFromFile(root, cssFile, palette, variableHexes, sourceFiles);
        }
      }
    }
  }

  if (from.includes("logos")) {
    const main = firstExistingRelative(root, ["brand/logo.svg", "brand/logo.png", "public/logo.svg", "public/logo.png"]);
    const mark = firstExistingRelative(root, ["brand/mark.svg", "brand/mark.png", "public/mark.svg", "public/mark.png"]);
    const favicon = firstExistingRelative(root, ["public/favicon.svg", "public/favicon.png", "public/favicon.ico"]);
    if (main || mark || favicon) {
      extracted.logos = {
        main,
        mark,
        favicon,
      };
      for (const path of [main, mark, favicon]) {
        if (path) sourceFiles.push(path);
      }
    } else {
      notes.push("No logo files found.");
    }
  }

  if (from.includes("package")) {
    const pkg = readPackageJson(root);
    if (pkg) {
      sourceFiles.push("package.json");
      const inferredName = titleCase(cleanString(pkg.name, ""));
      if (inferredName) extracted.name = inferredName;
      const homepage = cleanString(pkg.homepage, "").trim();
      if (homepage) {
        try {
          const url = new URL(homepage);
          extracted.identity = {
            domain: {
              primary: url.hostname.replace(/^www\./i, ""),
              website: `${url.protocol}//${url.host}`,
              app: "",
              docs: "",
              api: "",
            },
          };
        } catch {
          notes.push(`Invalid homepage URL in package.json: ${homepage}`);
        }
      }
    }
  }

  const primary = pickByVariableNames(variableHexes, ["primary", "brand-primary"]);
  const secondary = pickByVariableNames(variableHexes, ["secondary", "brand-secondary"]);
  const accent = pickByVariableNames(variableHexes, ["accent", "brand-accent"]);
  const background = pickByVariableNames(variableHexes, ["background", "bg"]);
  const foreground = pickByVariableNames(variableHexes, ["foreground", "fg"]);

  const lightest = pickLightestColor(palette);
  const darkest = pickDarkestColor(palette);

  if (palette.length > 0 || primary || secondary || accent || background || foreground) {
    extracted.colors = {
      primary: primary || palette[0] || "",
      secondary: secondary || palette[1] || "",
      accent: accent || palette[2] || "",
      background: background || lightest || "",
      foreground: foreground || darkest || "",
      palette: palette.slice(0, 24),
    };
  }

  return {
    extracted,
    sources: uniqueStrings(sourceFiles),
    notes,
  };
}

export function listBrandProfiles(root = process.cwd()): string[] {
  const profiles = new Set<string>();
  if (existsSync(getBrandFilePath(root, DEFAULT_BRAND_PROFILE))) {
    profiles.add(DEFAULT_BRAND_PROFILE);
  }

  const profilesDir = getBrandProfilesDir(root);
  if (existsSync(profilesDir)) {
    try {
      for (const entry of readdirSync(profilesDir)) {
        if (!entry.endsWith(".json")) continue;
        const profile = entry.slice(0, -5);
        if (profile && BRAND_PROFILE_ID_RE.test(profile)) {
          profiles.add(profile);
        }
      }
    } catch {
      // Ignore unreadable profile directory and return what we already have.
    }
  }

  return [...profiles].sort((a, b) => {
    if (a === DEFAULT_BRAND_PROFILE) return -1;
    if (b === DEFAULT_BRAND_PROFILE) return 1;
    return a.localeCompare(b);
  });
}

export function ensureBrandFile(root = process.cwd(), force = false, profile = DEFAULT_BRAND_PROFILE): BrandData {
  const existing = readBrand(root, profile);
  if (existing && !force) return existing;
  const template = createBrandTemplate(root);
  writeBrand(template, root, profile);
  return template;
}

export function createOrReplaceBrand(
  root = process.cwd(),
  patch: DeepPartial<BrandData> = {},
  force = false,
  profile = DEFAULT_BRAND_PROFILE,
): BrandData {
  if (!force && existsSync(getBrandFilePath(root, profile))) {
    throw new Error(`${toRelative(root, getBrandFilePath(root, profile))} already exists. Use --force to overwrite.`);
  }
  const template = createBrandTemplate(root);
  const merged = mergeBrandData(template, patch, true);
  merged.updatedAt = nowIso();
  writeBrand(merged, root, profile);
  return merged;
}

export function relativeBrandFilePath(root = process.cwd(), profile = DEFAULT_BRAND_PROFILE): string {
  return toRelative(root, getBrandFilePath(root, profile));
}
