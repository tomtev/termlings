import type { RequestHandler } from "@sveltejs/kit"
import { loadWorkspaceSnapshot } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"
import { subscribeHubChanges, subscribeProjectChanges } from "$lib/server/watchers"
import { subscribeMessageChanges } from "$lib/server/message-watcher"

export const GET: RequestHandler = ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? undefined
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let watchedProjectRoot = ""
      let unsubscribeProject: (() => void) | null = null
      let unsubscribeHub: (() => void) | null = null
      let unsubscribeMessages: (() => void) | null = null
      let sendScheduled = false

      const scheduleSend = () => {
        if (closed || sendScheduled) return
        sendScheduled = true
        queueMicrotask(() => {
          sendScheduled = false
          sendUpdate()
        })
      }

      const sendUpdate = () => {
        if (closed) return
        const context = resolveProjectContext(requestedProject)
        if (context.projectRoot !== watchedProjectRoot) {
          watchedProjectRoot = context.projectRoot
          if (unsubscribeProject) unsubscribeProject()
          if (unsubscribeMessages) unsubscribeMessages()
          unsubscribeProject = subscribeProjectChanges(context.projectRoot, scheduleSend)
          // Subscribe to smart message watcher for only changed channels/DMs
          unsubscribeMessages = subscribeMessageChanges(context.projectRoot, scheduleSend)
        }

        const snapshot = loadWorkspaceSnapshot(context.projectRoot)
        const payload = {
          snapshot,
          projects: context.projects,
          activeProjectId: context.activeProjectId,
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      unsubscribeHub = subscribeHubChanges(scheduleSend)
      sendUpdate()
      // Keep UI fresh even if a file watcher event is missed.
      heartbeat = setInterval(sendUpdate, 2_000)

      const onAbort = () => {
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        if (unsubscribeProject) unsubscribeProject()
        if (unsubscribeHub) unsubscribeHub()
        if (unsubscribeMessages) unsubscribeMessages()
        try {
          controller.close()
        } catch {}
      }

      request.signal.addEventListener("abort", onAbort, { once: true })
    },

    cancel() {
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    },
  })
}
