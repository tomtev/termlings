/**
 * Delta stream endpoint - sends only changes, not full snapshots
 *
 * Benefits:
 * - Zero polling (event-driven only)
 * - Minimal bandwidth (100 bytes vs 100KB)
 * - Instant updates (no delay)
 * - True file-first architecture
 */

import type { RequestHandler } from "@sveltejs/kit"
import { loadWorkspaceSnapshot } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"
import { subscribeHubChanges, subscribeProjectChanges } from "$lib/server/watchers"
import { subscribeMessageChanges } from "$lib/server/message-watcher"
import { WorkspaceDeltaComputer, type Delta } from "$lib/server/workspace-delta"

const deltaComputers = new Map<string, WorkspaceDeltaComputer>()

export const GET: RequestHandler = ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? undefined
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let watchedProjectRoot = ""
      let unsubscribeProject: (() => void) | null = null
      let unsubscribeHub: (() => void) | null = null
      let unsubscribeMessages: (() => void) | null = null

      const sendInitialSnapshot = () => {
        if (closed) return
        const context = resolveProjectContext(requestedProject)

        // Send initial full snapshot once
        const snapshot = loadWorkspaceSnapshot(context.projectRoot)
        const payload = {
          type: "snapshot",
          snapshot,
          projects: context.projects,
          activeProjectId: context.activeProjectId,
          timestamp: Date.now(),
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const sendDeltas = (changes: {
        channels: Set<string>
        dms: Set<string>
        indexChanged: boolean
      }) => {
        if (closed) return
        const context = resolveProjectContext(requestedProject)

        // Get or create delta computer for this project
        const key = context.projectRoot
        if (!deltaComputers.has(key)) {
          deltaComputers.set(key, new WorkspaceDeltaComputer())
        }
        const computer = deltaComputers.get(key)!

        // Compute deltas
        const deltas = computer.computeDeltas(context.projectRoot, changes)

        // Send each delta
        for (const delta of deltas) {
          if (closed) return
          const payload = {
            type: "delta",
            delta,
            timestamp: delta.timestamp,
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }
      }

      const setupWatchers = () => {
        const context = resolveProjectContext(requestedProject)
        if (context.projectRoot !== watchedProjectRoot) {
          watchedProjectRoot = context.projectRoot

          // Clean up old watchers
          if (unsubscribeProject) unsubscribeProject()
          if (unsubscribeMessages) unsubscribeMessages()

          // Subscribe to changes and send deltas
          unsubscribeProject = subscribeProjectChanges(context.projectRoot, () =>
            sendInitialSnapshot(),
          )
          unsubscribeMessages = subscribeMessageChanges(context.projectRoot, sendDeltas)
        }
      }

      // Initial setup
      setupWatchers()
      sendInitialSnapshot()

      // Listen for hub changes (project switching)
      unsubscribeHub = subscribeHubChanges(() => {
        setupWatchers()
        sendInitialSnapshot()
      })

      const onAbort = () => {
        closed = true
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
      // Cleanup handled in onAbort
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
