import { useEffect, useState } from "react"
import { RECYCLE_BIN_CHANGED_EVENT } from "@/lib/recycle-bin-events"

// Live count of soft-deleted items for the sidebar badge. The sidebar only
// knows the project KEY, so we resolve the id from the projects cache the
// ProjectSwitcher already maintains (velo:projects:*) rather than adding a
// second lookup. Best-effort: if the cache isn't warm yet the badge stays 0
// until the next navigation, which is an acceptable degradation for a hint.
//
// Refreshes whenever a restore/purge dispatches `velo:recycle-bin-changed`.
export function useRecycleBinCount(workspaceId: string, projectKey?: string): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    function resolveProjectId(): string | undefined {
      try {
        const raw = sessionStorage.getItem(`velo:projects:${workspaceId}`)
        const projects = raw ? (JSON.parse(raw) as Array<{ id: string; project_key: string }>) : []
        return projects.find((p) => p.project_key === projectKey)?.id
      } catch {
        return undefined
      }
    }

    // Resolves to the current deleted-item count (0 when there's no project or
    // the request fails). Every setCount here runs off the effect's synchronous
    // path (scheduled via the microtask below), so no cascading-render warning.
    async function computeCount(): Promise<number> {
      if (!workspaceId || !projectKey) return 0
      const projectId = resolveProjectId()
      if (!projectId) return 0
      try {
        const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/recycle-bin`)
        if (!res.ok) return 0
        const data = (await res.json()) as { suites?: unknown[]; cases?: unknown[] }
        return (data.suites?.length ?? 0) + (data.cases?.length ?? 0)
      } catch {
        return 0
      }
    }

    const load = () =>
      computeCount().then((n) => {
        if (!cancelled) setCount(n)
      })

    void load()
    const onChange = () => void load()
    window.addEventListener(RECYCLE_BIN_CHANGED_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(RECYCLE_BIN_CHANGED_EVENT, onChange)
    }
  }, [workspaceId, projectKey])

  return count
}
