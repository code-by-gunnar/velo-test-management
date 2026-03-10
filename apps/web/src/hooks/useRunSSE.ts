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

/**
 * Subscribes to SSE streams for one or more runs, returning a Map from
 * runId to the latest stats. Connects directly to the Railway API URL
 * (NOT through the Next.js /api/backend/ gateway) because EventSource
 * cannot set custom headers — auth is passed as a ?token= query param.
 *
 * @param runIds  - List of run IDs to subscribe to
 * @param apiUrl  - Railway API base URL (e.g. https://....railway.app)
 * @param token   - Auth.js session token passed as ?token= query param
 * @returns Map<runId, RunStats>
 */
export function useRunSSE(
  runIds: string[],
  apiUrl: string,
  token: string | null,
  workspaceId: string
): Map<string, RunStats> {
  const [statsMap, setStatsMap] = useState<Map<string, RunStats>>(new Map())

  // Stable ref so the effect cleanup can access the current sources
  const sourcesRef = useRef<Map<string, EventSource>>(new Map())

  useEffect(() => {
    if (!token || runIds.length === 0 || !apiUrl || !workspaceId) return

    const newSources = new Map<string, EventSource>()

    for (const runId of runIds) {
      const url = `${apiUrl}/api/workspaces/${workspaceId}/runs/${runId}/stream?token=${encodeURIComponent(token)}`
      const es = new EventSource(url)

      es.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as RunUpdateEvent
          if (data.type === "run_update" && data.stats) {
            setStatsMap((prev) => {
              const next = new Map(prev)
              next.set(runId, data.stats)
              return next
            })
          }
        } catch {
          // Ignore malformed SSE frames (heartbeats are comments, not data events)
        }
      }

      es.onerror = () => {
        // On error, EventSource auto-reconnects. No action needed.
      }

      newSources.set(runId, es)
    }

    sourcesRef.current = newSources

    return () => {
      for (const es of newSources.values()) {
        es.close()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIds.join(","), apiUrl, token, workspaceId])

  return statsMap
}
