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
  dockerCdpTarget?: string
  sharedForDocker?: boolean
  dockerProxyPort?: number
  dockerProxyPid?: number | null
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
  tabId?: string
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

export interface BrowserTabOwnerSnapshot {
  ownerKey: string
  tabId: string
  updatedAt: number
  sessionId?: string
  agentSlug?: string
  agentName?: string
}

export interface BrowserWorkspaceTabInput {
  id: string
  targetId?: string
  title?: string
  url?: string
  type?: string
  active?: boolean
  current?: boolean
  selected?: boolean
  focused?: boolean
}

export interface BrowserWorkspaceTabSnapshot {
  id: string
  targetId?: string
  title?: string
  url?: string
  type?: string
  active: boolean
  owner?: BrowserTabOwnerSnapshot
  inviteCount: number
}

export interface BrowserWorkspaceSnapshot {
  version: number
  generatedAt: number
  process: ProcessState | null
  profile: ProfileReference | null
  agents: AgentBrowserState[]
  owners: BrowserTabOwnerSnapshot[]
  invites: Array<{
    id: string
    tabId: string
    status: string
    ownerAgentSlug?: string
    ownerAgentName?: string
    target: string
    targetAgentSlug: string
    targetAgentName?: string
    acceptedByAgentSlug?: string
    acceptedByAgentName?: string
    tabTitle?: string
    tabUrl?: string
    updatedAt: number
  }>
  tabs: BrowserWorkspaceTabSnapshot[]
}
