export interface NetClient {
  connect(url: string): void
  send(msg: Record<string, unknown>): void
  onMessage(handler: (msg: Record<string, unknown>) => void): void
  onClose(handler: () => void): void
  onOpen(handler: () => void): void
  close(): void
  isConnected(): boolean
}

export function createNetClient(): NetClient {
  let ws: WebSocket | null = null
  let connected = false
  const messageHandlers: ((msg: Record<string, unknown>) => void)[] = []
  const closeHandlers: (() => void)[] = []
  const openHandlers: (() => void)[] = []

  return {
    connect(url: string) {
      ws = new WebSocket(url)

      ws.onopen = () => {
        connected = true
        for (const h of openHandlers) h()
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : "")
          for (const h of messageHandlers) h(msg)
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        connected = false
        for (const h of closeHandlers) h()
      }

      ws.onerror = () => {
        connected = false
      }
    },

    send(msg: Record<string, unknown>) {
      if (ws && connected) {
        ws.send(JSON.stringify(msg))
      }
    },

    onMessage(handler: (msg: Record<string, unknown>) => void) {
      messageHandlers.push(handler)
    },

    onClose(handler: () => void) {
      closeHandlers.push(handler)
    },

    onOpen(handler: () => void) {
      openHandlers.push(handler)
    },

    close() {
      if (ws) {
        ws.close()
        ws = null
        connected = false
      }
    },

    isConnected() {
      return connected
    },
  }
}
