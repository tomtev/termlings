/**
 * Request store: agents submit requests to the operator for env vars, confirmations, choices.
 * Stored as individual JSON files in .termlings/store/requests/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import { getTermlingsDir } from "./ipc.js"
import { randomBytes } from "crypto"
import { writeEnvVarForScope, type EnvScope } from "./env.js"

export type RequestType = "env" | "confirm" | "choice"
export type RequestStatus = "pending" | "resolved" | "dismissed"
const REQUEST_OCC_MAX_RETRIES = 6

export interface AgentRequest {
  id: string
  type: RequestType
  status: RequestStatus
  from: string           // session ID
  fromName: string
  fromSlug?: string
  fromDna?: string
  ts: number

  // env
  varName?: string
  reason?: string
  url?: string
  envScope?: EnvScope

  // confirm
  question?: string

  // choice
  options?: string[]

  // resolution
  resolvedAt?: number
  response?: string      // the value, "yes"/"no", or chosen option
}

function getRequestsDir(): string {
  const dir = join(getTermlingsDir(), "store", "requests")
  mkdirSync(dir, { recursive: true })
  return dir
}

function generateRequestId(): string {
  return `req-${randomBytes(4).toString("hex")}`
}

function requestFile(id: string): string {
  return join(getRequestsDir(), `${id}.json`)
}

function readRequestSnapshot(id: string): { request: AgentRequest; raw: string; file: string } | null {
  const file = requestFile(id)
  if (!existsSync(file)) return null

  try {
    const raw = readFileSync(file, "utf-8")
    const request: AgentRequest = JSON.parse(raw)
    return { request, raw, file }
  } catch {
    return null
  }
}

function tryWriteRequest(file: string, expectedRaw: string, request: AgentRequest): boolean {
  let currentRaw = ""
  if (existsSync(file)) {
    try {
      currentRaw = readFileSync(file, "utf-8")
    } catch {
      return false
    }
  }

  if (currentRaw !== expectedRaw) return false
  writeFileSync(file, JSON.stringify(request, null, 2) + "\n")
  return true
}

function mutateRequestWithRetry<T>(
  id: string,
  mutator: (request: AgentRequest) => { changed: boolean; result: T },
): T | null {
  for (let attempt = 0; attempt < REQUEST_OCC_MAX_RETRIES; attempt++) {
    const snapshot = readRequestSnapshot(id)
    if (!snapshot) return null

    const working: AgentRequest = {
      ...snapshot.request,
      options: snapshot.request.options ? [...snapshot.request.options] : undefined,
    }
    const { changed, result } = mutator(working)
    if (!changed) return result

    if (tryWriteRequest(snapshot.file, snapshot.raw, working)) {
      return result
    }
  }

  return null
}

/**
 * Create a new request
 */
export function createRequest(req: Omit<AgentRequest, "id" | "status" | "ts">): AgentRequest {
  const dir = getRequestsDir()
  const request: AgentRequest = {
    ...req,
    id: generateRequestId(),
    status: "pending",
    ts: Date.now(),
  }
  writeFileSync(join(dir, `${request.id}.json`), JSON.stringify(request, null, 2) + "\n")
  return request
}

/**
 * List all requests, optionally filtered by status
 */
export function listRequests(status?: RequestStatus): AgentRequest[] {
  const dir = getRequestsDir()
  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  const requests: AgentRequest[] = []

  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), "utf-8")
      const req: AgentRequest = JSON.parse(content)
      if (!status || req.status === status) {
        requests.push(req)
      }
    } catch {
      // Skip unreadable files
    }
  }

  return requests.sort((a, b) => b.ts - a.ts)
}

/**
 * Get a single request by ID
 */
export function getRequest(id: string): AgentRequest | null {
  const snapshot = readRequestSnapshot(id)
  return snapshot?.request ?? null
}

/**
 * Resolve a request with a response.
 * For env requests, the value is written to either project .env or .termlings/.env and NOT stored in the request JSON.
 */
export function resolveRequest(id: string, response: string): AgentRequest | null {
  const outcome = mutateRequestWithRetry<{ request: AgentRequest; resolvedNow: boolean }>(
    id,
    (request) => {
      if (request.status !== "pending") {
        return { changed: false, result: { request, resolvedNow: false } }
      }

      request.status = "resolved"
      request.resolvedAt = Date.now()

      if (request.type === "env") {
        delete request.response
      } else {
        request.response = response
      }

      return { changed: true, result: { request, resolvedNow: true } }
    },
  )
  if (!outcome) return null

  if (outcome.resolvedNow && outcome.request.type === "env") {
    // Write env value only after winning CAS write.
    const scope: EnvScope = outcome.request.envScope === "termlings" ? "termlings" : "project"
    writeEnvVarForScope(outcome.request.varName!, response, scope)
  }

  return outcome.request
}

/**
 * Dismiss a request (operator declines)
 */
export function dismissRequest(id: string): AgentRequest | null {
  const outcome = mutateRequestWithRetry<{ request: AgentRequest; dismissedNow: boolean }>(
    id,
    (request) => {
      if (request.status !== "pending") {
        return { changed: false, result: { request, dismissedNow: false } }
      }

      request.status = "dismissed"
      request.resolvedAt = Date.now()

      return { changed: true, result: { request, dismissedNow: true } }
    },
  )
  if (!outcome) return null
  return outcome.request
}

/**
 * Count pending requests
 */
export function countPendingRequests(): number {
  return listRequests("pending").length
}
