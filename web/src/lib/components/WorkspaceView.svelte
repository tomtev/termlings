<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { Avatar } from "../../../../src/svelte/index"
  import { applyDelta, type Delta } from "$lib/workspace-delta-merge"

  type Session = {
    sessionId: string
    name: string
    dna: string
    joinedAt: number
    lastSeenAt: number
  }

  type Message = {
    id: string
    kind: "chat" | "dm" | "system"
    channel?: string
    from: string
    fromName: string
    fromDna?: string
    target?: string
    targetName?: string
    targetDna?: string
    text: string
    ts: number
  }

  type Task = {
    id: string
    title: string
    status: string
    priority: string
    assignedTo?: string
    updatedAt: number
  }

  type CalendarEvent = {
    id: string
    title: string
    description: string
    assignedAgents: string[]
    startTime: number
    endTime: number
    recurrence: string
    enabled: boolean
    nextNotification?: number
  }

  type Agent = {
    id: string
    agentId?: string
    name: string
    dna: string
    title?: string
    title_short?: string
    online: boolean
    typing: boolean
    activitySource?: "terminal"
    sessionIds: string[]
    source: "saved" | "ephemeral"
  }

  type WorkspaceSnapshot = {
    meta: { projectName: string } | null
    sessions: Session[]
    agents: Agent[]
    messages: Message[]
    channels: Array<{ name: string; count: number; lastTs: number }>
    dmThreads: Array<{ target: string; count: number; lastTs: number }>
    tasks: Task[]
    calendarEvents: CalendarEvent[]
    activityUpdatedAt?: number
    generatedAt: number
  }

  type Project = {
    projectId: string
    projectName: string
    root: string
    registeredAt: number
    lastSeenAt: number
  }

  type WorkspacePayload = {
    snapshot: WorkspaceSnapshot
    projects: Project[]
    activeProjectId: string
  }

  export let initialPayload: WorkspacePayload
  export let initialThreadId: string

  let snapshot = initialPayload.snapshot
  let projects = initialPayload.projects
  let activeProjectId = initialPayload.activeProjectId
  let loading = false
  let loadError: string | null = null
  let sendError: string | null = null
  let activeThreadId = initialThreadId
  let composeText = ""
  let stream: EventSource | null = null
  let mounted = false
  let streamProjectId: string | null = null
  let streamGeneration = 0
  let refreshGeneration = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let sessionDnaById = new Map<string, string>()
  let sessionNameById = new Map<string, string>()
  let agentNameByDna = new Map<string, string>()
  let agentByDna = new Map<string, Agent>()
  let lastReadByThread = new Map<string, number>()
  let unreadDmByThread = new Map<string, number>()
  let onlineDnaSet = new Set<string>()
  let ownerInboxSummaries: InboxSummary[] = []
  let talkingDnaSet = new Set<string>()
  let wavingDnaSet = new Set<string>()
  const TALK_DURATION_MS = 2000
  const WAVE_DURATION_MS = 1500
  const PASTE_COMPACT_MIN_CHARS = 700
  const PASTE_COMPACT_MIN_LINES = 8
  const PASTE_COMPACT_MULTILINE_MIN_CHARS = 300
  const PASTE_COMPACT_MULTILINE_MIN_LINES = 4
  const DRAFT_BLOCK_TOKEN_GLOBAL = /\[Image #\d+\]|\[Pasted Content \d+ chars\]/g
  let imagePlaceholderCounter = 0
  let imagePlaceholderByUrl = new Map<string, string>()

  type Thread = {
    id: string
    label: string
    kind: "channel" | "dm"
    dna?: string
    online?: boolean
    title?: string
    typing?: boolean
    activitySource?: "terminal"
  }

  type InboxSummary = {
    key: string
    label: string
    count: number
    lastMessage: Message
    threadId?: string
    dna?: string
  }

  function withProject(path: string, projectId = activeProjectId): string {
    const params = new URLSearchParams()
    if (projectId) {
      params.set("project", projectId)
    }
    return params.size > 0 ? `${path}?${params.toString()}` : path
  }

  function projectPath(projectId: string): string {
    return `/${encodeURIComponent(projectId)}`
  }

  function threadPath(projectId: string, threadId: string): string {
    const encodedProjectId = encodeURIComponent(projectId)
    if (threadId === "activity") return `/${encodedProjectId}`
    if (threadId === "workspace" || threadId === "inbox") {
      return `/${encodedProjectId}/channel/${encodeURIComponent(threadId)}`
    }
    if (threadId === "tasks") return `/${encodedProjectId}/tasks`
    if (threadId === "calendar") return `/${encodedProjectId}/calendar`
    if (threadId.startsWith("agent:")) {
      const dna = threadId.slice("agent:".length)
      return `/${encodedProjectId}/agents/${encodeURIComponent(dna)}`
    }
    return `/${encodedProjectId}`
  }

  function currentProjectName(): string {
    return projects.find((project) => project.projectId === activeProjectId)?.projectName ?? snapshot.meta?.projectName ?? "Project"
  }

  function clearReconnectTimer(): void {
    if (!reconnectTimer) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  async function refresh(projectIdOrEvent: string | Event = activeProjectId) {
    const projectId = typeof projectIdOrEvent === "string" ? projectIdOrEvent : activeProjectId
    const generation = ++refreshGeneration
    loading = true
    try {
      const response = await fetch(withProject("/api/workspace", projectId), { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Workspace API failed (${response.status})`)
      }
      const payload = (await response.json()) as WorkspacePayload
      if (generation !== refreshGeneration) return
      if (projectId !== activeProjectId) return
      snapshot = payload.snapshot
      projects = payload.projects
      activeProjectId = payload.activeProjectId
      loadError = null
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to refresh workspace"
    } finally {
      loading = false
    }
  }

  async function selectProject(projectId: string): Promise<void> {
    if (!projectId) return
    if (projectId === activeProjectId) {
      await goto(projectPath(projectId))
      return
    }
    await goto(projectPath(projectId))
  }

  async function sendMessage() {
    if (activeThreadId === "inbox") {
      sendError = "Inbox is read-only. Open a direct agent thread to reply."
      return
    }

    const text = composeText.trim()
    if (!text) return

    sendError = null
    const kind = activeThreadId === "workspace" ? "chat" : "dm"
    const target = kind === "dm" ? activeThreadId : undefined

    try {
      const response = await fetch(withProject("/api/workspace/message"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          target,
          text,
          from: "operator",
          fromName: "Operator",
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Message failed" }))
        throw new Error(payload.error || "Message failed")
      }
      composeText = ""
    } catch (err) {
      sendError = err instanceof Error ? err.message : "Message failed"
    }
  }

  function normalizePastedInput(input: string): string {
    const withNormalizedNewlines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const withMediaPlaceholders = replaceImageUrlsWithPlaceholders(withNormalizedNewlines)
    return compactLargePastedContent(withMediaPlaceholders, withNormalizedNewlines.length)
  }

  function compactLargePastedContent(input: string, rawCharCount: number): string {
    const trimmed = input.trim()
    if (!trimmed) return input

    const lineCount = input.split("\n").length
    const largeByChars = rawCharCount >= PASTE_COMPACT_MIN_CHARS
    const largeByLines = lineCount >= PASTE_COMPACT_MIN_LINES
    const largeMultiline =
      rawCharCount >= PASTE_COMPACT_MULTILINE_MIN_CHARS
      && lineCount >= PASTE_COMPACT_MULTILINE_MIN_LINES

    if (!largeByChars && !largeByLines && !largeMultiline) return input
    return `[Pasted Content ${rawCharCount} chars]`
  }

  function replaceImageUrlsWithPlaceholders(input: string): string {
    const quotedLocalImageRegex = /(['"])([^'"\n]*\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)(?:[?#][^'"\n]*)?)\1/gi
    let out = input.replace(quotedLocalImageRegex, (_match, _quote: string, rawPath: string) => {
      if (!isLikelyImagePath(rawPath)) return _match
      return placeholderForImageUrl(rawPath)
    })

    const localPathRegex = /(?:^|[\s(])(file:\/\/[^\s)]+|~\/[^\s)]+|\/[^\s)]+)(?=$|[\s),.!?;:'"])/gi
    out = out.replace(localPathRegex, (full: string, rawPath: string) => {
      const prefix = full.slice(0, full.length - rawPath.length)
      const { path, suffix } = stripTrailingPathPunctuation(rawPath)
      if (!isLikelyImagePath(path)) return full
      return `${prefix}${placeholderForImageUrl(path)}${suffix}`
    })

    const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/gi
    out = out.replace(markdownImageRegex, (_match, rawUrl: string) => {
      const { url } = stripTrailingUrlPunctuation(rawUrl)
      if (!isLikelyImageUrl(url)) return _match
      return placeholderForImageUrl(url)
    })

    const urlRegex = /(https?:\/\/[^\s]+)/gi
    out = out.replace(urlRegex, (rawUrl: string) => {
      const { url, suffix } = stripTrailingUrlPunctuation(rawUrl)
      if (!isLikelyImageUrl(url)) return rawUrl
      return `${placeholderForImageUrl(url)}${suffix}`
    })
    return out
  }

  function stripTrailingPathPunctuation(value: string): { path: string; suffix: string } {
    let path = value
    let suffix = ""
    while (path.length > 0 && /[)\],.!?;:'"]/.test(path[path.length - 1] || "")) {
      suffix = `${path[path.length - 1]}${suffix}`
      path = path.slice(0, -1)
    }
    return { path, suffix }
  }

  function stripTrailingUrlPunctuation(value: string): { url: string; suffix: string } {
    let url = value
    let suffix = ""
    while (url.length > 0 && /[)\],.!?;:'"]/.test(url[url.length - 1] || "")) {
      suffix = `${url[url.length - 1]}${suffix}`
      url = url.slice(0, -1)
    }
    return { url, suffix }
  }

  function isLikelyImageUrl(raw: string): boolean {
    if (!raw) return false
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)(?:[?#].*)?$/i.test(raw)) return true
    try {
      const parsed = new URL(raw)
      const host = parsed.hostname.toLowerCase()
      return host.includes("images.unsplash.com")
        || host.includes("i.imgur.com")
        || host.includes("cdn.discordapp.com")
        || host.includes("media.tenor.com")
    } catch {
      return false
    }
  }

  function isLikelyImagePath(raw: string): boolean {
    if (!raw) return false
    if (!/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)(?:[?#].*)?$/i.test(raw)) return false
    if (raw.startsWith("/") || raw.startsWith("~/")) return true
    if (raw.startsWith("file://")) {
      try {
        const parsed = new URL(raw)
        return parsed.protocol === "file:"
      } catch {
        return false
      }
    }
    return false
  }

  function placeholderForImageUrl(url: string): string {
    const existing = imagePlaceholderByUrl.get(url)
    if (existing) return existing
    imagePlaceholderCounter += 1
    const placeholder = `[Image #${imagePlaceholderCounter}]`
    imagePlaceholderByUrl = new Map(imagePlaceholderByUrl).set(url, placeholder)
    return placeholder
  }

  function findComposeBlockSpanAt(index: number): { start: number; end: number } | null {
    if (index < 0 || index >= composeText.length) return null
    DRAFT_BLOCK_TOKEN_GLOBAL.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = DRAFT_BLOCK_TOKEN_GLOBAL.exec(composeText)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (index >= start && index < end) {
        return { start, end }
      }
    }
    return null
  }

  function setComposeTextWithCaret(nextText: string, nextCaret: number, target: HTMLInputElement): void {
    composeText = nextText
    queueMicrotask(() => {
      target.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function insertIntoComposeText(insertText: string, target: HTMLInputElement | null): void {
    const safeText = insertText.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    if (!target) {
      composeText += safeText
      return
    }

    const start = target.selectionStart ?? composeText.length
    const end = target.selectionEnd ?? start
    const nextText = `${composeText.slice(0, start)}${safeText}${composeText.slice(end)}`
    const nextCursor = start + safeText.length
    setComposeTextWithCaret(nextText, nextCursor, target)
  }

  function handleComposerPaste(event: ClipboardEvent): void {
    if (composerDisabled) return
    const pastedText = event.clipboardData?.getData("text/plain") ?? event.clipboardData?.getData("text") ?? ""
    if (!pastedText) return
    event.preventDefault()
    const normalized = normalizePastedInput(pastedText)
    if (!normalized) return
    const target = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null
    insertIntoComposeText(normalized, target)
  }

  function handleComposerDrop(event: DragEvent): void {
    event.preventDefault()
    if (composerDisabled) return
    const raw =
      event.dataTransfer?.getData("text/uri-list")
      || event.dataTransfer?.getData("text/plain")
      || event.dataTransfer?.getData("text")
      || ""
    if (!raw) return
    const normalized = normalizePastedInput(raw)
    if (!normalized) return
    const target = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null
    insertIntoComposeText(normalized, target)
  }

  function handleComposerDragOver(event: DragEvent): void {
    event.preventDefault()
  }

  function handleComposerKeydown(event: KeyboardEvent): void {
    if (composerDisabled) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null
    if (!target) return

    const selectionStart = target.selectionStart ?? 0
    const selectionEnd = target.selectionEnd ?? selectionStart
    if (selectionStart !== selectionEnd) return

    if (event.key === "ArrowLeft") {
      if (selectionStart <= 0) return
      const block = findComposeBlockSpanAt(selectionStart - 1)
      if (!block) return
      event.preventDefault()
      setComposeTextWithCaret(composeText, block.start, target)
      return
    }

    if (event.key === "ArrowRight") {
      if (selectionStart >= composeText.length) return
      const block = findComposeBlockSpanAt(selectionStart)
      if (!block) return
      event.preventDefault()
      setComposeTextWithCaret(composeText, block.end, target)
      return
    }

    if (event.key === "Backspace") {
      if (selectionStart <= 0) return
      const block = findComposeBlockSpanAt(selectionStart - 1)
      if (!block) return
      event.preventDefault()
      const nextText = `${composeText.slice(0, block.start)}${composeText.slice(block.end)}`
      setComposeTextWithCaret(nextText, block.start, target)
      return
    }

    if (event.key === "Delete") {
      if (selectionStart >= composeText.length) return
      const block = findComposeBlockSpanAt(selectionStart)
      if (!block) return
      event.preventDefault()
      const nextText = `${composeText.slice(0, block.start)}${composeText.slice(block.end)}`
      setComposeTextWithCaret(nextText, block.start, target)
    }
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString()
  }

  function formatDateTime(ts: number): string {
    return new Date(ts).toLocaleString()
  }

  function isMine(message: Message): boolean {
    return message.from === "operator"
  }

  async function openDmThread(threadId: string): Promise<void> {
    activeThreadId = threadId
    sendError = null
    markThreadRead(threadId)
    await goto(threadPath(activeProjectId, threadId))
  }

  async function openChannel(threadId: string): Promise<void> {
    activeThreadId = threadId
    sendError = null
    await goto(threadPath(activeProjectId, threadId))
  }

  function isHumanAddress(id?: string): boolean {
    if (!id) return false
    return id === "owner" || id === "operator" || id.startsWith("human:")
  }

  function resolveActorName(params: {
    id?: string
    name?: string
    dna?: string
    fallback?: string
  }): string {
    if (params.name && params.name.trim().length > 0) return params.name
    if (params.dna) {
      const knownAgentName = agentNameByDna.get(params.dna)
      if (knownAgentName) return knownAgentName
      return params.dna
    }
    if (!params.id) return params.fallback ?? "Unknown"
    if (isHumanAddress(params.id)) {
      return params.id === "owner" || params.id === "operator" || params.id === "human:default"
        ? "Operator"
        : params.id
    }
    return sessionNameById.get(params.id) ?? params.id
  }

  function messageFromDna(message: Message): string | undefined {
    return message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
  }

  function messageTargetDna(message: Message): string | undefined {
    return message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined)
  }

  function isAgentWorkingDna(dna?: string): boolean {
    if (!dna) return false
    return agentByDna.get(dna)?.typing === true
  }

  function isTalkingOrWorkingDna(dna?: string): boolean {
    if (!dna) return false
    return talkingDnaSet.has(dna) || isAgentWorkingDna(dna)
  }

  function messageRoute(message: Message): string {
    const fromLabel = resolveActorName({
      id: message.from,
      name: message.fromName,
      dna: messageFromDna(message),
      fallback: "Unknown sender",
    })

    if (message.kind === "dm") {
      const targetLabel = resolveActorName({
        id: message.target,
        name: message.targetName,
        dna: messageTargetDna(message),
        fallback: "Unknown recipient",
      })
      return `${fromLabel} -> ${targetLabel}`
    }

    if (message.kind === "chat") {
      return `${fromLabel} -> #workspace`
    }

    return `${fromLabel} -> workspace`
  }

  function isMessageInDnaThread(message: Message, threadDna: string): boolean {
    if (message.kind !== "dm") return false
    const fromDna = messageFromDna(message)
    const targetDna = messageTargetDna(message)
    return fromDna === threadDna || targetDna === threadDna
  }

  function isIncomingHumanDmForDna(message: Message, threadDna: string): boolean {
    if (message.kind !== "dm") return false
    const fromDna = messageFromDna(message)
    if (fromDna !== threadDna) return false
    return isHumanAddress(message.target)
  }

  function markThreadRead(threadId: string): void {
    if (!threadId.startsWith("agent:")) return
    const threadDna = threadId.slice("agent:".length)
    if (!threadDna) return

    let latestIncomingTs = 0
    for (const message of snapshot.messages) {
      if (!isIncomingHumanDmForDna(message, threadDna)) continue
      if (message.ts > latestIncomingTs) {
        latestIncomingTs = message.ts
      }
    }

    if (latestIncomingTs <= 0) return
    const current = lastReadByThread.get(threadId) ?? 0
    if (latestIncomingTs <= current) return

    const next = new Map(lastReadByThread)
    next.set(threadId, latestIncomingTs)
    lastReadByThread = next
  }

  function unreadDmCount(threadId: string): number {
    return unreadDmByThread.get(threadId) ?? 0
  }

  function connectStream(projectId: string): void {
    streamGeneration += 1
    const generation = streamGeneration
    clearReconnectTimer()
    stream?.close()
    streamProjectId = projectId
    // Use delta-stream endpoint for efficient event-driven updates
    const nextStream = new EventSource(withProject("/api/workspace/delta-stream", projectId))
    stream = nextStream

    nextStream.onmessage = (event: MessageEvent<string>) => {
      if (generation !== streamGeneration) return
      try {
        const payload = JSON.parse(event.data)

        // Handle initial snapshot
        if (payload.type === "snapshot") {
          if (payload.activeProjectId !== projectId) return
          snapshot = payload.snapshot
          projects = payload.projects
          activeProjectId = projectId
          loadError = null
          return
        }

        // Handle delta updates
        if (payload.type === "delta") {
          const delta = payload.delta as Delta
          // Apply delta to current snapshot
          snapshot = applyDelta(snapshot, delta)
          loadError = null
          return
        }
      } catch (err) {
        loadError = "Failed to parse live workspace update: " + (err instanceof Error ? err.message : String(err))
      }
    }

    nextStream.onerror = () => {
      if (generation !== streamGeneration) return
      loadError = "Live sync disconnected. Reconnecting..."
      nextStream.close()
      clearReconnectTimer()
      reconnectTimer = setTimeout(() => {
        if (!mounted || generation !== streamGeneration) return
        connectStream(projectId)
      }, 1000)
    }
  }

  onMount(() => {
    mounted = true
    connectStream(activeProjectId)

    // Update animations every 100ms to smoothly transition between talking/waving/idle
    const animationInterval = setInterval(() => {
      talkingDnaSet = talkingDnaSet
      wavingDnaSet = wavingDnaSet
    }, 100)

    return () => {
      mounted = false
      clearInterval(animationInterval)
      streamGeneration += 1
      clearReconnectTimer()
      stream?.close()
      stream = null
      streamProjectId = null
    }
  })

  $: if (mounted && activeProjectId && streamProjectId !== activeProjectId) {
    connectStream(activeProjectId)
  }

  $: sessionDnaById = new Map(snapshot.sessions.map((session) => [session.sessionId, session.dna]))
  $: sessionNameById = new Map(snapshot.sessions.map((session) => [session.sessionId, session.name]))
  $: agentNameByDna = new Map(snapshot.agents.map((agent) => [agent.dna, agent.name]))
  $: agentByDna = new Map(snapshot.agents.map((agent) => [agent.dna, agent]))
  $: onlineDnaSet = new Set(snapshot.sessions.map((session) => session.dna))

  $: inboxMessages = snapshot.messages.filter(
    (message) => message.kind === "dm" && isHumanAddress(message.target),
  )

  $: {
    const grouped = new Map<string, InboxSummary>()
    for (const message of inboxMessages) {
      const dna = messageFromDna(message)
      const key = dna ? `dna:${dna}` : `from:${message.from}`
      const existing = grouped.get(key)
      if (existing) {
        existing.count += 1
        if (message.ts >= existing.lastMessage.ts) {
          existing.lastMessage = message
        }
        continue
      }
      grouped.set(key, {
        key,
        label: resolveActorName({
          id: message.from,
          name: message.fromName,
          dna,
          fallback: "Unknown",
        }),
        count: 1,
        lastMessage: message,
        threadId: dna ? `agent:${dna}` : undefined,
        dna,
      })
    }
    ownerInboxSummaries = Array.from(grouped.values()).sort((a, b) => b.lastMessage.ts - a.lastMessage.ts)
  }

  $: dmThreads = (() => {
    const byDna = new Map<string, Thread>()

    for (const agent of snapshot.agents) {
      byDna.set(agent.dna, {
        id: `agent:${agent.dna}`,
        label: agent.name,
        kind: "dm",
        dna: agent.dna,
        online: agent.online,
        title: agent.title_short || agent.title,
        typing: agent.typing ?? false,
        activitySource: agent.activitySource,
      })
    }

    for (const message of snapshot.messages) {
      if (message.kind !== "dm") continue

      const fromDna = messageFromDna(message)
      const targetDna = messageTargetDna(message)

      if (fromDna && !isHumanAddress(message.from) && !byDna.has(fromDna)) {
        const known = agentByDna.get(fromDna)
        byDna.set(fromDna, {
          id: `agent:${fromDna}`,
          label: message.fromName || fromDna,
          kind: "dm",
          dna: fromDna,
          online: known?.online ?? onlineDnaSet.has(fromDna),
          title: known?.title_short || known?.title,
          typing: known?.typing ?? false,
          activitySource: known?.activitySource,
        })
      }

      if (targetDna && !isHumanAddress(message.target) && !byDna.has(targetDna)) {
        const known = agentByDna.get(targetDna)
        byDna.set(targetDna, {
          id: `agent:${targetDna}`,
          label: message.targetName || targetDna,
          kind: "dm",
          dna: targetDna,
          online: known?.online ?? onlineDnaSet.has(targetDna),
          title: known?.title_short || known?.title,
          typing: known?.typing ?? false,
          activitySource: known?.activitySource,
        })
      }
    }

    return Array.from(byDna.values()).sort((a, b) => a.label.localeCompare(b.label))
  })()

  $: {
    const next = new Map<string, number>()
    for (const thread of dmThreads) {
      if (!thread.dna) {
        next.set(thread.id, 0)
        continue
      }
      const seenAt = lastReadByThread.get(thread.id) ?? 0
      let unread = 0
      for (const message of snapshot.messages) {
        if (!isIncomingHumanDmForDna(message, thread.dna)) continue
        if (message.ts > seenAt) unread += 1
      }
      next.set(thread.id, unread)
    }
    unreadDmByThread = next
  }

  $: topThreads = [
    { id: "inbox", label: "Inbox", kind: "channel" as const },
    { id: "tasks", label: "Tasks", kind: "channel" as const },
    { id: "calendar", label: "Calendar", kind: "channel" as const },
  ]

  $: channelThreads = [
    { id: "activity", label: "# all-activity", kind: "channel" as const },
    ...snapshot.channels.map((ch) => ({
      id: `channel:${ch.name}`,
      label: `# ${ch.name}`,
      kind: "channel" as const,
    })),
  ]

  $: threads = [...topThreads, ...channelThreads, ...dmThreads]

  $: if (!threads.find((thread) => thread.id === activeThreadId)) {
    activeThreadId = "activity"
  }

  $: activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0]

  $: if (activeThreadId.startsWith("agent:")) {
    markThreadRead(activeThreadId)
  }

  $: visibleMessages =
    activeThreadId === "activity"
      ? snapshot.messages
      : activeThreadId === "workspace"
      ? snapshot.messages.filter((message) => message.kind !== "dm")
      : activeThreadId === "inbox"
      ? []
      : activeThreadId === "tasks" || activeThreadId === "calendar"
      ? []
      : activeThreadId.startsWith("channel:")
      ? snapshot.messages.filter((message) => {
          const channelName = activeThreadId.slice("channel:".length)
          return message.channel === channelName
        })
      : activeThreadId.startsWith("agent:")
      ? snapshot.messages.filter((message) => {
          const threadDna = activeThreadId.slice("agent:".length)
          return isMessageInDnaThread(message, threadDna)
        })
      : snapshot.messages.filter(
          (message) => message.kind === "dm" && (message.from === activeThreadId || message.target === activeThreadId),
        )

  $: composerHidden = activeThreadId === "activity" || activeThreadId === "tasks" || activeThreadId === "calendar"
  $: composerDisabled = activeThreadId === "inbox" || activeThreadId === "tasks" || activeThreadId === "calendar"

  $: calendarEvents = [...snapshot.calendarEvents].sort((a, b) => a.startTime - b.startTime)

  // Update talking/waving animations based on message activity
  $: {
    const now = Date.now()
    const nextTalking = new Set<string>()
    const nextWaving = new Set<string>()

    // Find agents who spoke recently (within TALK_DURATION_MS)
    for (const message of snapshot.messages) {
      if (message.kind === "dm" || message.kind === "chat") {
        const timeSinceTalk = now - message.ts
        const dna = messageFromDna(message)

        if (dna && timeSinceTalk < TALK_DURATION_MS) {
          nextTalking.add(dna)
        } else if (dna && timeSinceTalk >= TALK_DURATION_MS && timeSinceTalk < TALK_DURATION_MS + WAVE_DURATION_MS) {
          nextWaving.add(dna)
        }
      }
    }

    talkingDnaSet = nextTalking
    wavingDnaSet = nextWaving
  }
</script>

<svelte:head>
  <title>Termlings Workspace</title>
</svelte:head>

<main class="layout container">
  <header class="header">
    <div class="heading">
      <h1>Termlings Workspace</h1>
      <p>{currentProjectName()} · {snapshot.sessions.length} online · {snapshot.agents.length} agents · {projects.length} project(s)</p>
    </div>
    <div class="actions">
      <button on:click={refresh} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
      <span class="timestamp">Updated {formatTime(snapshot.generatedAt)}</span>
    </div>
  </header>

  {#if loadError}
    <article role="alert" data-variant="danger">{loadError}</article>
  {/if}

  {#if sendError}
    <article role="alert" data-variant="danger">{sendError}</article>
  {/if}

  <section class="workspace">
    <aside class="project-rail card">
      <h3 class="rail-title">Projects</h3>
      <ul class="project-rail-list">
        {#each projects as project}
          <li>
            <button
              aria-label={project.projectName}
              class:active={project.projectId === activeProjectId}
              class="project-rail-item"
              on:click={() => {
                void selectProject(project.projectId)
              }}
              title={project.projectName}
            >
              <Avatar size="lg" name={project.projectName} />
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    <aside class="sidebar card">
      <section class="sidebar-section">
        <h2>Inbox & Planner</h2>
        <ul class="thread-list">
          {#each topThreads as thread}
            <li>
              <button
                class:active={thread.id === activeThreadId}
                class="thread-item"
                on:click={() => {
                  void openChannel(thread.id)
                }}
              >
                {thread.label}
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <section class="sidebar-section">
        <h2>Channels</h2>
        <ul class="thread-list">
          {#each channelThreads as thread}
            <li>
              <button
                class:active={thread.id === activeThreadId}
                class="thread-item"
                on:click={() => {
                  void openChannel(thread.id)
                }}
              >
                {thread.label}
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <section class="sidebar-section">
        <h2>DM Threads</h2>
        {#if dmThreads.length === 0}
          <p class="muted">No DM threads yet.</p>
        {:else}
          <ul class="thread-list dm-thread-list">
            {#each dmThreads as thread (thread.id)}
              <li>
                <button
                  class:active={thread.id === activeThreadId}
                  class="thread-item thread-item-dm"
                  on:click={() => {
                    void openDmThread(thread.id)
                  }}
                >
                  <span class="thread-main">
                    <span class="thread-avatar">
                      <Avatar
                        size="lg"
                        dna={thread.dna}
                        name={thread.label}
                        talking={thread.typing ?? false}
                      />
                    </span>
                    <span class="thread-text">
                      <span class="thread-label">{thread.label}</span>
                      <span class="thread-meta">
                        {#if thread.typing}
                          <span class="badge secondary">typing…</span>
                        {/if}
                        <span class={`badge ${thread.online ? "success" : "outline"}`}>
                          {thread.online ? "online" : "offline"}
                        </span>
                        {#if thread.title}
                          <span class="thread-title">{thread.title}</span>
                        {/if}
                      </span>
                    </span>
                  </span>
                  {#if unreadDmCount(thread.id) > 0}
                    <span class="badge">({unreadDmCount(thread.id)})</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </aside>

    <article class="chat-panel card">
      <header class="thread-header">
        <h2>{activeThread?.label ?? "Workspace"}</h2>
        <span class="timestamp">
          {#if activeThreadId === "tasks"}
            {snapshot.tasks.length} task(s)
          {:else if activeThreadId === "calendar"}
            {calendarEvents.length} event(s)
          {:else if activeThreadId === "inbox"}
            {ownerInboxSummaries.length} sender(s)
          {:else}
            {visibleMessages.length} message(s)
          {/if}
        </span>
      </header>

      {#if activeThreadId === "tasks"}
        <ul class="messages">
          {#if snapshot.tasks.length === 0}
            <li class="empty">No tasks created.</li>
          {:else}
            {#each snapshot.tasks as task}
              <li class="message">
                <div class="message-meta">
                  <span class="author">{task.title}</span>
                  <span class="timestamp">{formatTime(task.updatedAt)}</span>
                </div>
                <p>{task.status} · {task.priority}</p>
              </li>
            {/each}
          {/if}
        </ul>
      {:else if activeThreadId === "calendar"}
        <ul class="messages">
          {#if calendarEvents.length === 0}
            <li class="empty">No calendar events scheduled.</li>
          {:else}
            {#each calendarEvents as event}
              <li class="message">
                <div class="message-meta">
                  <span class="author">{event.title}</span>
                  <span class="timestamp">{formatDateTime(event.startTime)}</span>
                </div>
                <p>{event.enabled ? "enabled" : "disabled"} · {event.recurrence}</p>
              </li>
            {/each}
          {/if}
        </ul>
      {:else if activeThreadId === "inbox"}
        <ul class="messages">
          {#if ownerInboxSummaries.length === 0}
            <li class="empty">No inbox messages yet.</li>
          {:else}
            {#each ownerInboxSummaries as summary (summary.key)}
              <li class="message inbox-summary">
                <div class="message-meta">
                  <div class="author-block">
                    <span class="avatar">
                      <Avatar
                        size="lg"
                        dna={summary.dna}
                        name={summary.label}
                        talking={isTalkingOrWorkingDna(summary.dna)}
                        waving={wavingDnaSet.has(summary.dna ?? "")}
                      />
                    </span>
                    <span class="author">{summary.label}</span>
                  </div>
                  <div class="inbox-summary-meta">
                    <span class="badge">({summary.count})</span>
                    <span class="timestamp">{formatTime(summary.lastMessage.ts)}</span>
                  </div>
                </div>
                <p>{summary.lastMessage.text}</p>
                {#if summary.threadId}
                  <button
                    class="inbox-open"
                    on:click={() => {
                      void openDmThread(summary.threadId!)
                    }}
                  >
                    Open DM
                  </button>
                {/if}
              </li>
            {/each}
          {/if}
        </ul>
      {:else}
        <ul class="messages">
          {#if visibleMessages.length === 0}
            <li class="empty">No messages in this thread yet.</li>
          {:else}
            {#each visibleMessages as message}
              <li class:mine={isMine(message)} class="message">
                <div class="message-meta">
                  <div class="author-block">
                    <span class="avatar">
                      <Avatar
                        size="lg"
                        dna={messageFromDna(message)}
                        name={resolveActorName({
                          id: message.from,
                          name: message.fromName,
                          dna: messageFromDna(message),
                          fallback: "Agent",
                        })}
                        talking={isTalkingOrWorkingDna(messageFromDna(message))}
                        waving={wavingDnaSet.has(messageFromDna(message) ?? "")}
                      />
                    </span>
                    <span class="author">{resolveActorName({
                      id: message.from,
                      name: message.fromName,
                      dna: messageFromDna(message),
                      fallback: "Unknown",
                    })}</span>
                  </div>
                  <span class="timestamp">{formatTime(message.ts)}</span>
                </div>
                {#if activeThreadId === "activity"}
                  <div class="route">{messageRoute(message)}</div>
                {/if}
                <p>{message.text}</p>
              </li>
            {/each}
          {/if}
        </ul>
      {/if}

      {#if !composerHidden}
        <form
          class="composer"
          on:submit|preventDefault={() => {
            void sendMessage()
          }}
        >
          <input
            bind:value={composeText}
            disabled={composerDisabled}
            on:dragover={handleComposerDragOver}
            on:drop={handleComposerDrop}
            on:keydown={handleComposerKeydown}
            on:paste={handleComposerPaste}
            placeholder={
              activeThreadId === "workspace"
                ? "Message #workspace"
                : activeThreadId === "inbox"
                ? "Inbox is read-only. Select an agent thread to reply."
                : `DM ${activeThread?.label ?? "agent"}`
            }
            type="text"
          />
          <button type="submit" disabled={composerDisabled}>Send</button>
        </form>
      {/if}
    </article>

    <aside class="rightbar">
      <section class="panel card">
        <h2>Tasks</h2>
        {#if snapshot.tasks.length === 0}
          <p class="muted">No tasks created.</p>
        {:else}
          <ul class="list">
            {#each snapshot.tasks as task}
              <li>
                <div class="primary">{task.title}</div>
                <div class="secondary">{task.status} · {task.priority}</div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="panel card">
        <h2>Calendar Events</h2>
        {#if calendarEvents.length === 0}
          <p class="muted">No calendar events scheduled.</p>
        {:else}
          <ul class="list">
            {#each calendarEvents as event}
              <li>
                <div class="primary">{event.title}</div>
                <div class="secondary">
                  {event.enabled ? "enabled" : "disabled"} · {event.recurrence} · {formatDateTime(event.startTime)}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </aside>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
  }

  .layout {
    box-sizing: border-box;
    max-width: var(--container-max);
    padding: var(--space-4);
  }

  h1,
  h2 {
    line-height: 1.2;
    margin: 0;
  }

  h1 {
    font-size: var(--text-2);
  }

  h2 {
    font-size: var(--text-3);
    margin-bottom: var(--space-3);
  }

  .header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .actions {
    align-items: center;
    display: flex;
    gap: var(--space-2);
  }

  .workspace {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: 84px 260px minmax(0, 1fr) 300px;
    min-height: calc(100vh - 8rem);
  }

  .project-rail {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-2);
  }

  .rail-title {
    font-size: var(--text-8);
    letter-spacing: 0.03em;
    margin: 0;
    text-transform: uppercase;
  }

  .project-rail-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .project-rail-item {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-medium);
    color: var(--foreground);
    cursor: pointer;
    display: inline-flex;
    height: 52px;
    justify-content: center;
    padding: 0;
    width: 52px;
  }

  .project-rail-item.active {
    background: var(--muted);
    border-color: var(--border);
  }

  .project-rail-item :global(svg) {
    height: 36px;
    width: 36px;
  }

  .rightbar {
    display: grid;
    gap: var(--space-4);
    grid-template-rows: minmax(0, 1fr) auto;
    min-height: 0;
  }

  .sidebar {
    display: grid;
    gap: var(--space-4);
    grid-template-rows: auto auto 1fr;
    min-height: 0;
  }

  .sidebar-section {
    min-height: 0;
  }

  .thread-list,
  .messages,
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .thread-item {
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-medium);
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
    justify-content: flex-start;
    padding: var(--space-2) var(--space-3);
    text-align: left;
    width: 100%;
  }

  .thread-item {
    align-items: center;
    display: flex;
  }

  .project-rail-item.active,
  .thread-item.active {
    background: var(--muted);
    border-color: var(--border);
    color: var(--foreground);
    font-weight: 700;
  }

  .thread-item-dm {
    align-items: center;
    display: flex;
    gap: var(--space-2);
    justify-content: space-between;
  }

  .thread-main {
    align-items: center;
    display: inline-flex;
    gap: var(--space-2);
    min-width: 0;
  }

  .thread-text {
    display: inline-flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .thread-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-meta {
    align-items: center;
    color: var(--muted-foreground);
    display: inline-flex;
    font-size: var(--text-8);
    gap: var(--space-2);
    line-height: 1;
  }

  .thread-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-avatar {
    align-items: center;
    display: inline-flex;
    flex-shrink: 0;
    height: 36px;
    justify-content: center;
    width: 36px;
  }

  .thread-avatar :global(svg) {
    height: 36px;
    width: 36px;
  }

  .chat-panel {
    display: grid;
    gap: var(--space-2);
    grid-template-rows: auto 1fr auto;
    min-height: 0;
  }

  .thread-header {
    align-items: center;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    padding-bottom: var(--space-2);
  }

  .messages {
    max-height: calc(100vh - 17rem);
    overflow: auto;
    padding-right: var(--space-1);
  }

  .message {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-medium);
    padding: var(--space-2) var(--space-3);
  }

  .message.mine {
    border-inline-start: 4px solid var(--primary);
    margin-left: var(--space-6);
  }

  .message p {
    margin: var(--space-1) 0 0;
  }

  .message-meta {
    align-items: flex-start;
    display: flex;
    gap: var(--space-2);
    justify-content: space-between;
  }

  .author-block {
    align-items: center;
    display: inline-flex;
    gap: var(--space-2);
    min-width: 0;
  }

  .avatar {
    align-items: center;
    display: inline-flex;
    flex-shrink: 0;
    height: 40px;
    justify-content: center;
    width: 40px;
  }

  .avatar :global(svg) {
    height: 40px;
    width: 40px;
  }

  .author {
    font-weight: 600;
  }

  .inbox-summary-meta {
    align-items: center;
    display: inline-flex;
    gap: var(--space-2);
  }

  .inbox-open {
    margin-top: var(--space-2);
  }

  .route {
    color: var(--muted-foreground);
    font-size: var(--text-8);
    margin-top: var(--space-1);
  }

  .composer {
    align-items: center;
    display: grid;
    gap: var(--space-2);
    grid-template-columns: 1fr auto;
    margin-top: var(--space-2);
  }

  .composer input {
    margin: 0;
  }

  .list {
    max-height: 100%;
    overflow: auto;
  }

  .primary {
    font-weight: 600;
  }

  .secondary {
    color: var(--muted-foreground);
    font-size: var(--text-7);
  }

  .muted,
  .timestamp,
  .empty {
    color: var(--muted-foreground);
  }

  @media (max-width: 1080px) {
    .workspace {
      grid-template-columns: 72px 220px minmax(0, 1fr);
    }

    .rightbar {
      grid-column: 1 / -1;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
    }
  }

  @media (max-width: 760px) {
    .header {
      align-items: flex-start;
      flex-direction: column;
    }

    .actions {
      width: 100%;
    }

    .workspace {
      grid-template-columns: 1fr;
    }

    .project-rail {
      align-items: flex-start;
      flex-direction: row;
      overflow-x: auto;
    }

    .rail-title {
      display: none;
    }

    .project-rail-list {
      display: inline-flex;
      flex-direction: row;
    }

    .rightbar {
      grid-template-columns: 1fr;
    }

    .messages {
      max-height: 45vh;
    }
  }
</style>
