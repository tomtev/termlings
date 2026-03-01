/**
 * PinchTab browser service types and interfaces
 */

export interface BrowserConfig {
  port: number
  binaryPath: string
  autoStart: boolean
  profilePath: string
  timeout: number
}

export interface ProcessState {
  pid: number | null
  port: number
  status: "running" | "stopped"
  startedAt: number | null
  url?: string
}

export interface ActivityLogEntry {
  ts: number
  sessionId?: string
  agentName?: string
  agentDna?: string
  command: string
  args: unknown[]
  result: "success" | "error" | "timeout"
  error?: string
}

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
