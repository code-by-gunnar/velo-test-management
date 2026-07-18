import { useEffect, useRef, useState } from "react"

export interface RunStats {
  pass: number
  fail: number
  blocked: number
  skipped: number
  untested: number
  total: number
}

interface RunUpdateEvent {
  type: "run_update"
  runId: string
  stats: RunStats
  updatedItem?: {
    id: string
    status: string
    caseTitle: string | null
  }
}

interface DefectStatusUpdateEvent {
  type: "defect_status_update"
  defectId: string
  externalStatus: string
  runItemId: string
}

export interface UseRunSSEOptions {
  onDefectStatusUpdate?: (runItemId: string, externalStatus: string) => void
}

/**
 * Subscribes to SSE streams for one or more runs, returning a Map from runId to
 * the latest stats. Connects directly to the API (NOT through the /api/backend
 * gateway) because EventSource can't set headers.
 *
 * Auth (VEL-42): instead of putting the long-lived session token in the URL,
 * each connection first mints a short-lived single-use ticket via the gateway
 * (POST .../stream-ticket), then passes that ticket to the stream. Because a
 * ticket is single-use, this hook manages reconnection itself (mint a fresh
 * ticket each attempt) rather than relying on EventSource's built-in retry.
 *
 * @param runIds       - Run IDs to subscribe to
 * @param apiUrl       - Browser-facing API base URL (for EventSource)
 * @param workspaceId  - Workspace the runs belong to
 */
export function useRunSSE(
  runIds: string[],
  apiUrl: string,
  workspaceId: string,
  options?: UseRunSSEOptions | undefined
): Map<string, RunStats> {
  const [statsMap, setStatsMap] = useState<Map<string, RunStats>>(new Map())

  // Stable ref for the callback so SSE connections don't reconnect on identity changes
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (runIds.length === 0 || !apiUrl || !workspaceId) return

    // One self-managed connection per run. `closed` guards against reconnecting
    // after cleanup; `backoff` grows on repeated failures.
    const connections = runIds.map((runId) => {
      const conn = {
        runId,
        es: null as EventSource | null,
        timer: null as ReturnType<typeof setTimeout> | null,
        closed: false,
        backoff: 1000,
      }

      const scheduleReconnect = () => {
        if (conn.closed) return
        conn.timer = setTimeout(connect, conn.backoff)
        conn.backoff = Math.min(conn.backoff * 2, 15000)
      }

      async function connect() {
        if (conn.closed) return
        try {
          // Mint a fresh single-use ticket through the authenticated gateway
          const res = await fetch(
            `/api/backend/workspaces/${workspaceId}/runs/${runId}/stream-ticket`,
            { method: "POST" }
          )
          if (!res.ok) throw new Error(`ticket ${res.status}`)
          const { ticket } = (await res.json()) as { ticket: string }
          if (conn.closed) return

          const es = new EventSource(
            `${apiUrl}/api/workspaces/${workspaceId}/runs/${runId}/stream?ticket=${encodeURIComponent(ticket)}`
          )
          conn.es = es

          es.onopen = () => {
            conn.backoff = 1000 // reset backoff once connected
          }

          es.onmessage = (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data as string) as RunUpdateEvent | DefectStatusUpdateEvent
              if (data.type === "run_update" && "stats" in data) {
                setStatsMap((prev) => {
                  const next = new Map(prev)
                  next.set(runId, data.stats)
                  return next
                })
              } else if (data.type === "defect_status_update" && optionsRef.current?.onDefectStatusUpdate) {
                optionsRef.current.onDefectStatusUpdate(data.runItemId, data.externalStatus)
              }
            } catch {
              // Ignore malformed SSE frames (heartbeats are comments, not data events)
            }
          }

          es.onerror = () => {
            // The ticket is spent — close and reconnect with a fresh one rather
            // than letting EventSource retry against a now-invalid ticket.
            es.close()
            conn.es = null
            scheduleReconnect()
          }
        } catch {
          scheduleReconnect()
        }
      }

      void connect()
      return conn
    })

    return () => {
      for (const conn of connections) {
        conn.closed = true
        if (conn.timer) clearTimeout(conn.timer)
        conn.es?.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIds.join(","), apiUrl, workspaceId])

  return statsMap
}
