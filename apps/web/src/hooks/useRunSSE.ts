import { useEffect, useRef, useState } from "react"

export interface RunStats {
  pass: number
  fail: number
  blocked: number
  skipped: number
  untested: number
  total: number
}

export interface RunItemUpdate {
  id: string
  status: string
  caseTitle: string | null
  executedAt: string | null
}

interface RunUpdateEvent {
  type: "run_update"
  runId: string
  stats: RunStats
  updatedItem?: RunItemUpdate
}

interface DefectStatusUpdateEvent {
  type: "defect_status_update"
  defectId: string
  externalStatus: string
  runItemId: string
}

export interface UseRunSSEOptions {
  onDefectStatusUpdate?: (runItemId: string, externalStatus: string) => void
  /**
   * Fired when a run_update carries the specific item that changed, so a
   * subscriber can update that row's status badge live instead of only the
   * aggregate stats (VEL-74 follow-up). `statsMap` still drives the summary.
   */
  onItemUpdate?: (item: RunItemUpdate) => void
}

/**
 * Subscribes to SSE streams for one or more runs, returning a Map from runId to
 * the latest stats. Connects through the same-origin /api/backend gateway (which
 * streams the event-stream through — VEL-77), so live updates work on any host
 * (LAN IP or reverse proxy) with no absolute API URL and no cross-origin CORS.
 *
 * Auth (VEL-42): the gateway forwards the session cookie as a Bearer, so the
 * token never appears in the URL. A short-lived single-use ticket is still minted
 * (POST .../stream-ticket) and passed to the stream as a belt-and-suspenders
 * credential. Because a ticket is single-use, this hook manages reconnection
 * itself (mint a fresh ticket each attempt) rather than relying on EventSource's
 * built-in retry.
 *
 * @param runIds       - Run IDs to subscribe to
 * @param workspaceId  - Workspace the runs belong to
 */
export function useRunSSE(
  runIds: string[],
  workspaceId: string,
  options?: UseRunSSEOptions | undefined
): Map<string, RunStats> {
  const [statsMap, setStatsMap] = useState<Map<string, RunStats>>(new Map())

  // Stable ref for the callback so SSE connections don't reconnect on identity changes
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (runIds.length === 0 || !workspaceId) return

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
            `/api/backend/workspaces/${workspaceId}/runs/${runId}/stream?ticket=${encodeURIComponent(ticket)}`
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
                // Surface the changed item so the per-row badge updates live,
                // not just the aggregate stats (VEL-74 follow-up).
                if (data.updatedItem) optionsRef.current?.onItemUpdate?.(data.updatedItem)
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
  }, [runIds.join(","), workspaceId])

  return statsMap
}
