/**
 * Browser service types and interfaces
 */

export interface BrowserConfig {
  port: number
  binaryPath: string
  autoStart: boolean
  profilePath: string
  timeout: number
  startupTimeoutMs: number
  startupAttempts: number
  startupPollMs: number
}

export interface ProcessState {
  pid: number | null
  port: number
  status: "running" | "starting" | "stopped"
  startedAt: number | null
  url?: string
  cdpWsUrl?: string
  profilePath?: string
  mode?: "cdp"
}

export interface ActivityLogEntry {
  ts: number
  sessionId?: string
  agentName?: string
  agentSlug?: string
  agentDna?: string
  command: string
  args: unknown[]
  result: "success" | "error" | "timeout"
  error?: string
}

export type AgentBrowserPresenceStatus = "active" | "idle" | "closed"
export type AgentBrowserPresenceEndReason = "idle" | "closed"

export interface BrowserScreenshot {
  base64: string
  mimeType: string
}

export interface Cookie {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: string
  expires?: number
}

export interface HealthCheckResponse {
  status: string
  version?: string
}

export interface ProfileReference {
  name: string
  location: string
  projectName: string
  createdAt: number
  lastUsed?: number
}

export interface AgentBrowserState {
  sessionId: string
  agentName?: string
  agentSlug?: string
  agentDna?: string
  tabId?: string
  url?: string
  status: AgentBrowserPresenceStatus
  active: boolean
  startedAt: number
  lastSeenAt: number
  lastAction: string
  lastActionAt: number
  idleAt?: number
  endedAt?: number
  endReason?: AgentBrowserPresenceEndReason
}
