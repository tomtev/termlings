/**
 * Request store: agents submit requests to the operator for env vars, confirmations, choices.
 * Stored as individual JSON files in .termlings/store/requests/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs"
import { join } from "path"
import { getTermlingsDir } from "./ipc.js"
import { randomBytes } from "crypto"

export type RequestType = "env" | "confirm" | "choice"
export type RequestStatus = "pending" | "resolved" | "dismissed"

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
  const dir = getRequestsDir()
  const file = join(dir, `${id}.json`)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, "utf-8"))
  } catch {
    return null
  }
}

/**
 * Resolve a request with a response.
 * For env requests, the value is written to .env and NOT stored in the request JSON.
 */
export function resolveRequest(id: string, response: string): AgentRequest | null {
  const request = getRequest(id)
  if (!request) return null

  request.status = "resolved"
  request.resolvedAt = Date.now()

  if (request.type === "env") {
    // Write to .env file — never store the secret in request JSON
    writeEnvVar(request.varName!, response)
  } else {
    request.response = response
  }

  const dir = getRequestsDir()
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(request, null, 2) + "\n")
  return request
}

/**
 * Write or update an env var in the project .env file.
 * Replaces existing value if key exists, appends if new.
 */
function writeEnvVar(key: string, value: string): void {
  const envPath = join(process.cwd(), ".env")
  let content = ""

  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8")
  }

  // Escape value: wrap in quotes if it contains spaces or special chars
  const needsQuotes = /[\s#"'\\$`!]/.test(value)
  const escapedValue = needsQuotes ? `"${value.replace(/["\\$`]/g, "\\$&")}"` : value
  const line = `${key}=${escapedValue}`

  // Check if key already exists
  const regex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m")
  if (regex.test(content)) {
    content = content.replace(regex, line)
  } else {
    // Append with newline
    if (content.length > 0 && !content.endsWith("\n")) {
      content += "\n"
    }
    content += line + "\n"
  }

  writeFileSync(envPath, content)
}

/**
 * Dismiss a request (operator declines)
 */
export function dismissRequest(id: string): AgentRequest | null {
  const request = getRequest(id)
  if (!request) return null

  request.status = "dismissed"
  request.resolvedAt = Date.now()

  const dir = getRequestsDir()
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(request, null, 2) + "\n")
  return request
}

/**
 * Count pending requests
 */
export function countPendingRequests(): number {
  return listRequests("pending").length
}
