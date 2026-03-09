import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs"
import { dirname, extname, isAbsolute, join } from "path"
import { randomBytes } from "crypto"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type MediaProvider = "google"
export type MediaType = "image" | "video"
export type MediaJobStatus = "queued" | "running" | "completed" | "failed"

export interface MediaJobOutput {
  path: string
  mimeType: string
  sizeBytes: number
}

export interface MediaSourceImage {
  path: string
  mimeType: string
  fromJobId?: string
}

export interface MediaJob {
  id: string
  type: MediaType
  provider: MediaProvider
  model: string
  status: MediaJobStatus
  prompt: string
  createdAt: number
  updatedAt: number
  sourceImage?: MediaSourceImage
  output?: MediaJobOutput
  requestedOutputPath?: string
  providerOperationName?: string
  options?: Record<string, string>
  error?: string
}

export interface GenerateImageOptions {
  provider?: MediaProvider
  model?: string
  prompt: string
  image?: string
  out?: string
}

export interface GenerateVideoOptions {
  provider?: MediaProvider
  model?: string
  prompt: string
  image?: string
  aspect?: "16:9" | "9:16"
  duration?: "4" | "6" | "8"
  resolution?: "720p" | "1080p" | "4k"
  out?: string
  wait?: boolean
  pollIntervalMs?: number
  maxPolls?: number
}

interface GoogleMediaConfig {
  provider: MediaProvider
  apiKey: string
}

type FetchLike = typeof fetch

interface GoogleImageInlineData {
  mimeType?: string
  data?: string
}

function mediaRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "media")
}

function mediaJobsDir(root = process.cwd()): string {
  return join(mediaRoot(root), "jobs")
}

function mediaOutputsDir(root = process.cwd()): string {
  return join(mediaRoot(root), "outputs")
}

function mediaJobPath(id: string, root = process.cwd()): string {
  return join(mediaJobsDir(root), `${id}.json`)
}

export function ensureMediaDirs(root = process.cwd()): void {
  mkdirSync(mediaRoot(root), { recursive: true })
  mkdirSync(mediaJobsDir(root), { recursive: true })
  mkdirSync(mediaOutputsDir(root), { recursive: true })
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function currentActivityMeta(): Partial<AppActivityEntry> {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined
  const agentDna = (process.env.TERMLINGS_AGENT_DNA || "").trim() || undefined
  const sessionId = (process.env.TERMLINGS_SESSION_ID || "").trim() || undefined
  const agentName = (process.env.TERMLINGS_AGENT_NAME || "").trim() || undefined
  return {
    actorSessionId: sessionId,
    actorName: agentName,
    actorSlug: agentSlug,
    actorDna: agentDna,
    threadId: resolveAgentActivityThreadId({ agentSlug, agentDna }),
  }
}

function appendMediaActivity(
  kind: string,
  text: string,
  result: AppActivityEntry["result"],
  meta: Record<string, unknown> | undefined,
  root: string,
): void {
  appendAppActivity({
    ts: Date.now(),
    app: "media",
    kind,
    text,
    result,
    surface: "both",
    level: "summary",
    meta,
    ...currentActivityMeta(),
  }, root)
}

function createMediaId(type: MediaType): string {
  const prefix = type === "image" ? "img" : "vid"
  return `${prefix}_${randomBytes(6).toString("hex")}`
}

function resolveMediaProvider(input: string | undefined): MediaProvider {
  const provider = (input || "google").trim().toLowerCase()
  if (provider !== "google") {
    throw new Error(`Unsupported media provider: ${input}`)
  }
  return "google"
}

function defaultImageModel(): string {
  return "gemini-3.1-flash-image-preview"
}

function defaultVideoModel(): string {
  return "veo-3.1-generate-preview"
}

function normalizePrompt(input: string): string {
  const prompt = String(input || "").trim()
  if (!prompt) {
    throw new Error("Prompt is required.")
  }
  return prompt
}

function normalizeAspect(input: string | undefined): "16:9" | "9:16" | undefined {
  if (!input) return undefined
  if (input === "16:9" || input === "9:16") return input
  throw new Error(`Invalid aspect ratio: ${input}. Expected 16:9 or 9:16.`)
}

function normalizeDuration(input: string | undefined): "4" | "6" | "8" | undefined {
  if (!input) return undefined
  const normalized = String(input).trim()
  if (normalized === "4" || normalized === "6" || normalized === "8") return normalized
  throw new Error(`Invalid duration: ${input}. Expected 4, 6, or 8.`)
}

function normalizeResolution(input: string | undefined): "720p" | "1080p" | "4k" | undefined {
  if (!input) return undefined
  const normalized = String(input).trim().toLowerCase()
  if (normalized === "720p" || normalized === "1080p" || normalized === "4k") return normalized
  throw new Error(`Invalid resolution: ${input}. Expected 720p, 1080p, or 4k.`)
}

function mediaConfigHelpText(): string {
  return [
    "Missing Google media configuration.",
    "Add this var to .termlings/.env:",
    "  GEMINI_API_KEY=<google-gemini-api-key>",
    "Optional fallback:",
    "  GOOGLE_API_KEY=<google-gemini-api-key>",
  ].join("\n")
}

function readGoogleMediaConfig(): GoogleMediaConfig | null {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim()
  if (!apiKey) return null
  return {
    provider: "google",
    apiKey,
  }
}

function readMediaJob(id: string, root = process.cwd()): MediaJob | null {
  return readJsonFile<MediaJob | null>(mediaJobPath(id, root), null)
}

function writeMediaJob(job: MediaJob, root = process.cwd()): void {
  ensureMediaDirs(root)
  writeJsonFile(mediaJobPath(job.id, root), job)
}

export function listMediaJobs(type?: MediaType, root = process.cwd()): MediaJob[] {
  ensureMediaDirs(root)
  const jobs: MediaJob[] = []
  for (const file of readdirSync(mediaJobsDir(root))) {
    if (!file.endsWith(".json")) continue
    const job = readJsonFile<MediaJob | null>(join(mediaJobsDir(root), file), null)
    if (!job) continue
    if (type && job.type !== type) continue
    jobs.push(job)
  }
  return jobs.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

export function showMediaJob(id: string, type: MediaType, root = process.cwd()): MediaJob {
  const job = readMediaJob(id, root)
  if (!job || job.type !== type) {
    throw new Error(`Unknown ${type} job: ${id}`)
  }
  return job
}

function normalizeInputPath(input: string, root = process.cwd()): string {
  return isAbsolute(input) ? input : join(root, input)
}

function detectMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  if (ext === ".mp4") return "video/mp4"
  throw new Error(`Unsupported media file type: ${path}`)
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return ".png"
  if (mimeType === "image/jpeg") return ".jpg"
  if (mimeType === "image/webp") return ".webp"
  if (mimeType === "image/gif") return ".gif"
  if (mimeType === "video/mp4") return ".mp4"
  return ".bin"
}

function readFileAsBase64(path: string): string {
  return Buffer.from(readFileSync(path)).toString("base64")
}

function writeOutputBytes(
  id: string,
  mimeType: string,
  bytes: Uint8Array,
  root = process.cwd(),
  requestedPath?: string,
): MediaJobOutput {
  ensureMediaDirs(root)
  const outputPath = join(mediaOutputsDir(root), `${id}${extensionForMimeType(mimeType)}`)
  const buffer = Buffer.from(bytes)
  writeFileSync(outputPath, buffer)
  if (requestedPath) {
    const resolved = normalizeInputPath(requestedPath, root)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, buffer)
  }
  return {
    path: outputPath,
    mimeType,
    sizeBytes: buffer.byteLength,
  }
}

function resolveSourceImage(input: string | undefined, root = process.cwd()): MediaSourceImage | undefined {
  if (!input) return undefined
  const resolvedPath = normalizeInputPath(input, root)
  if (existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      mimeType: detectMimeType(resolvedPath),
    }
  }

  const job = readMediaJob(input, root)
  if (!job || job.type !== "image") {
    throw new Error(`Unknown image source: ${input}`)
  }
  if (job.status !== "completed" || !job.output) {
    throw new Error(`Image job is not ready yet: ${input}`)
  }
  return {
    path: job.output.path,
    mimeType: job.output.mimeType,
    fromJobId: job.id,
  }
}

async function googleJsonRequest<T>(
  url: string,
  apiKey: string,
  body: unknown,
  fetchImpl: FetchLike,
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? payload.error?.message
      : undefined
    throw new Error(message || `Google media request failed: HTTP ${response.status}`)
  }
  return payload
}

async function googleFetchOperation(
  operationName: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
    headers: {
      "x-goog-api-key": apiKey,
    },
  })
  const payload = await response.json() as Record<string, unknown> & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google media operation failed: HTTP ${response.status}`)
  }
  return payload
}

async function googleDownloadFile(uri: string, apiKey: string, fetchImpl: FetchLike): Promise<Uint8Array> {
  const response = await fetchImpl(uri, {
    headers: {
      "x-goog-api-key": apiKey,
    },
  })
  if (!response.ok) {
    throw new Error(`Google media download failed: HTTP ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function extractInlineImage(payload: Record<string, unknown>): GoogleImageInlineData | null {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    const content = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>).content : undefined
    const parts = content && typeof content === "object" && Array.isArray((content as Record<string, unknown>).parts)
      ? (content as Record<string, unknown>).parts as Array<Record<string, unknown>>
      : []
    for (const part of parts) {
      const inlineData = part.inlineData
      if (!inlineData || typeof inlineData !== "object") continue
      const mimeType = typeof (inlineData as Record<string, unknown>).mimeType === "string"
        ? String((inlineData as Record<string, unknown>).mimeType)
        : undefined
      const data = typeof (inlineData as Record<string, unknown>).data === "string"
        ? String((inlineData as Record<string, unknown>).data)
        : undefined
      if (mimeType && data) {
        return { mimeType, data }
      }
    }
  }
  return null
}

function createPendingJob(
  type: MediaType,
  provider: MediaProvider,
  model: string,
  prompt: string,
  sourceImage: MediaSourceImage | undefined,
  requestedOutputPath: string | undefined,
  options: Record<string, string> | undefined,
): MediaJob {
  const now = Date.now()
  return {
    id: createMediaId(type),
    type,
    provider,
    model,
    status: "queued",
    prompt,
    createdAt: now,
    updatedAt: now,
    sourceImage,
    requestedOutputPath,
    options,
  }
}

function updateMediaJob(job: MediaJob, patch: Partial<MediaJob>, root = process.cwd()): MediaJob {
  const next: MediaJob = {
    ...job,
    ...patch,
    updatedAt: Date.now(),
  }
  writeMediaJob(next, root)
  return next
}

export async function generateImage(
  options: GenerateImageOptions,
  root = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<MediaJob> {
  const config = readGoogleMediaConfig()
  if (!config) {
    throw new Error(mediaConfigHelpText())
  }
  const provider = resolveMediaProvider(options.provider)
  const prompt = normalizePrompt(options.prompt)
  const model = String(options.model || defaultImageModel()).trim()
  const sourceImage = resolveSourceImage(options.image, root)
  let job = createPendingJob(
    "image",
    provider,
    model,
    prompt,
    sourceImage,
    options.out,
    sourceImage ? { image: sourceImage.fromJobId || sourceImage.path } : undefined,
  )
  writeMediaJob(job, root)

  try {
    job = updateMediaJob(job, { status: "running" }, root)
    const parts: Array<Record<string, unknown>> = [{ text: prompt }]
    if (sourceImage) {
      parts.push({
        inlineData: {
          mimeType: sourceImage.mimeType,
          data: readFileAsBase64(sourceImage.path),
        },
      })
    }
    const payload = await googleJsonRequest<Record<string, unknown>>(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      config.apiKey,
      {
        contents: [{ parts }],
      },
      fetchImpl,
    )
    const inlineImage = extractInlineImage(payload)
    if (!inlineImage?.mimeType || !inlineImage.data) {
      throw new Error("Google image generation did not return an image.")
    }
    const output = writeOutputBytes(
      job.id,
      inlineImage.mimeType,
      Buffer.from(inlineImage.data, "base64"),
      root,
      options.out,
    )
    job = updateMediaJob(job, {
      status: "completed",
      output,
      error: undefined,
    }, root)
    appendMediaActivity("image.completed", `generated image ${job.id}`, "success", {
      jobId: job.id,
      model: job.model,
    }, root)
    return job
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    job = updateMediaJob(job, {
      status: "failed",
      error: message,
    }, root)
    appendMediaActivity("image.failed", `image generation failed for ${job.id}`, "error", {
      jobId: job.id,
      model: job.model,
      error: message,
    }, root)
    throw error
  }
}

async function submitGoogleVideo(
  job: MediaJob,
  config: GoogleMediaConfig,
  root: string,
  fetchImpl: FetchLike,
): Promise<MediaJob> {
  const instance: Record<string, unknown> = {
    prompt: job.prompt,
  }
  if (job.sourceImage) {
    instance.image = {
      inlineData: {
        mimeType: job.sourceImage.mimeType,
        data: readFileAsBase64(job.sourceImage.path),
      },
    }
  }
  const parameters: Record<string, unknown> = {}
  if (job.options?.aspect) parameters.aspectRatio = job.options.aspect
  if (job.options?.duration) parameters.durationSeconds = job.options.duration
  if (job.options?.resolution) parameters.resolution = job.options.resolution

  const payload = await googleJsonRequest<Record<string, unknown>>(
    `https://generativelanguage.googleapis.com/v1beta/models/${job.model}:predictLongRunning`,
    config.apiKey,
    Object.keys(parameters).length > 0
      ? { instances: [instance], parameters }
      : { instances: [instance] },
    fetchImpl,
  )

  const operationName = typeof payload.name === "string" ? payload.name : ""
  if (!operationName) {
    throw new Error("Google video generation did not return an operation name.")
  }
  return updateMediaJob(job, {
    status: "running",
    providerOperationName: operationName,
  }, root)
}

function extractVideoUri(payload: Record<string, unknown>): string | null {
  const response = payload.response
  if (!response || typeof response !== "object") return null

  const generateVideoResponse = (response as Record<string, unknown>).generateVideoResponse
  if (generateVideoResponse && typeof generateVideoResponse === "object") {
    const generatedSamples = Array.isArray((generateVideoResponse as Record<string, unknown>).generatedSamples)
      ? (generateVideoResponse as Record<string, unknown>).generatedSamples as Array<Record<string, unknown>>
      : []
    const firstSample = generatedSamples[0]
    const video = firstSample && typeof firstSample.video === "object" ? firstSample.video as Record<string, unknown> : null
    if (video && typeof video.uri === "string" && video.uri) {
      return video.uri
    }
  }

  const generatedVideos = Array.isArray((response as Record<string, unknown>).generatedVideos)
    ? (response as Record<string, unknown>).generatedVideos as Array<Record<string, unknown>>
    : []
  const firstVideo = generatedVideos[0]
  const video = firstVideo && typeof firstVideo.video === "object" ? firstVideo.video as Record<string, unknown> : null
  if (video && typeof video.uri === "string" && video.uri) {
    return video.uri
  }

  return null
}

function extractOperationError(payload: Record<string, unknown>): string | null {
  const error = payload.error
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return String((error as Record<string, unknown>).message)
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function pollVideoJob(
  id: string,
  root = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<MediaJob> {
  const config = readGoogleMediaConfig()
  if (!config) {
    throw new Error(mediaConfigHelpText())
  }
  let job = showMediaJob(id, "video", root)
  if (!job.providerOperationName) {
    throw new Error(`Video job is missing provider operation state: ${id}`)
  }
  if (job.status === "completed" || job.status === "failed") {
    return job
  }

  const payload = await googleFetchOperation(job.providerOperationName, config.apiKey, fetchImpl)
  const operationError = extractOperationError(payload)
  if (operationError) {
    job = updateMediaJob(job, {
      status: "failed",
      error: operationError,
    }, root)
    appendMediaActivity("video.failed", `video generation failed for ${job.id}`, "error", {
      jobId: job.id,
      model: job.model,
      error: operationError,
    }, root)
    return job
  }

  if ((payload.done as boolean | undefined) !== true) {
    return updateMediaJob(job, { status: "running" }, root)
  }

  const videoUri = extractVideoUri(payload)
  if (!videoUri) {
    throw new Error(`Video operation completed without a downloadable output: ${id}`)
  }
  const outputBytes = await googleDownloadFile(videoUri, config.apiKey, fetchImpl)
  const output = writeOutputBytes(job.id, "video/mp4", outputBytes, root, job.requestedOutputPath)
  job = updateMediaJob(job, {
    status: "completed",
    output,
    error: undefined,
  }, root)
  appendMediaActivity("video.completed", `generated video ${job.id}`, "success", {
    jobId: job.id,
    model: job.model,
  }, root)
  return job
}

export async function generateVideo(
  options: GenerateVideoOptions,
  root = process.cwd(),
  fetchImpl: FetchLike = fetch,
  sleepImpl: (ms: number) => Promise<void> = sleep,
): Promise<MediaJob> {
  const config = readGoogleMediaConfig()
  if (!config) {
    throw new Error(mediaConfigHelpText())
  }

  const provider = resolveMediaProvider(options.provider)
  const prompt = normalizePrompt(options.prompt)
  const model = String(options.model || defaultVideoModel()).trim()
  const sourceImage = resolveSourceImage(options.image, root)
  const wait = options.wait !== false
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 10_000)
  const maxPolls = Math.max(1, options.maxPolls ?? 180)

  let job = createPendingJob(
    "video",
    provider,
    model,
    prompt,
    sourceImage,
    options.out,
    {
      ...(sourceImage ? { image: sourceImage.fromJobId || sourceImage.path } : {}),
      ...(options.aspect ? { aspect: options.aspect } : {}),
      ...(options.duration ? { duration: options.duration } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {}),
    },
  )
  writeMediaJob(job, root)

  try {
    job = await submitGoogleVideo(job, config, root, fetchImpl)
    appendMediaActivity("video.started", `started video generation ${job.id}`, "success", {
      jobId: job.id,
      model: job.model,
    }, root)
    if (!wait) return job

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const next = await pollVideoJob(job.id, root, fetchImpl)
      if (next.status === "completed" || next.status === "failed") {
        return next
      }
      await sleepImpl(pollIntervalMs)
    }
    throw new Error(`Timed out waiting for video job ${job.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    job = updateMediaJob(job, {
      status: "failed",
      error: message,
    }, root)
    appendMediaActivity("video.failed", `video generation failed for ${job.id}`, "error", {
      jobId: job.id,
      model: job.model,
      error: message,
    }, root)
    throw error
  }
}

function relativeOutputPath(path: string, root = process.cwd()): string {
  const normalizedRoot = `${root}${root.endsWith("/") ? "" : "/"}`
  return path.startsWith(normalizedRoot) ? path.slice(normalizedRoot.length) : path
}

export function formatMediaJob(job: MediaJob, root = process.cwd()): string {
  const lines = [
    `${job.id} [${job.status}] • ${job.provider}/${job.model}`,
    `type: ${job.type}`,
    `prompt: ${job.prompt}`,
  ]
  if (job.sourceImage) {
    lines.push(`source image: ${relativeOutputPath(job.sourceImage.path, root)}`)
  }
  if (job.output) {
    lines.push(`output: ${relativeOutputPath(job.output.path, root)} (${job.output.mimeType}, ${job.output.sizeBytes} bytes)`)
  }
  if (job.providerOperationName) {
    lines.push(`operation: ${job.providerOperationName}`)
  }
  if (job.error) {
    lines.push(`error: ${job.error}`)
  }
  return lines.join("\n")
}

export function formatMediaJobs(jobs: MediaJob[], root = process.cwd()): string {
  if (jobs.length <= 0) {
    return "No media jobs found."
  }
  return jobs.map((job) => {
    const output = job.output ? ` • ${relativeOutputPath(job.output.path, root)}` : ""
    return `${job.id} [${job.status}] • ${job.provider}/${job.model}${output}`
  }).join("\n")
}
