import { useCallback, useEffect, useState } from "react"
import { FolderTree, FileText, RotateCcw, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui"
import { useToast } from "@/components/ui/toast"
import { useCachedState } from "@/hooks/useCachedState"

// A soft-deleted item, normalized across the two source types so the list can
// render and restore them uniformly. `label` is the suite name or case title.
interface RecycleItem {
  id: string
  label: string
  deleted_at: string
  type: "suite" | "case"
}

interface RecycleBinResponse {
  suites: { id: string; name: string; deleted_at: string }[]
  cases: { id: string; title: string; deleted_at: string }[]
}

interface RecycleBinProps {
  workspaceId: string
  projectId: string
}

// Restore endpoints diverge by type (see VEL-31): suites have a dedicated
// bulk-restore route keyed by { ids }, cases ride the generic /cases/bulk action
// enum keyed by { case_ids }. One helper owns that split so callers never guess.
function restoreRequest(
  base: string,
  type: "suite" | "case",
  ids: string[]
): [string, RequestInit] {
  if (type === "suite") {
    return [
      `${base}/suites/bulk-restore`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) },
    ]
  }
  return [
    `${base}/cases/bulk`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore", case_ids: ids }),
    },
  ]
}

// Other surfaces (sidebar badge, cases page) listen for this to refresh once an
// item leaves the bin. Mirrors the existing `velo:project-updated` convention.
function announceChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("velo:recycle-bin-changed"))
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function RecycleBin({ workspaceId, projectId }: RecycleBinProps) {
  const { toast } = useToast()
  const base = `/api/backend/workspaces/${workspaceId}/projects/${projectId}`

  const [items, setItems, hadCache] = useCachedState<RecycleItem[]>(
    `velo:recycle-bin:${projectId}`,
    []
  )
  const [loading, setLoading] = useState(!hadCache)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${base}/recycle-bin`)
      if (!res.ok) return
      const data = (await res.json()) as RecycleBinResponse
      const merged: RecycleItem[] = [
        ...data.suites.map((s) => ({ id: s.id, label: s.name, deleted_at: s.deleted_at, type: "suite" as const })),
        ...data.cases.map((c) => ({ id: c.id, label: c.title, deleted_at: c.deleted_at, type: "case" as const })),
      ].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
      setItems(merged)
    } catch {
      // Network hiccup — keep whatever the cache rendered.
    } finally {
      setLoading(false)
    }
  }, [base, setItems])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // Restore a batch of items of a single type. Removes them from the list on
  // success and surfaces failure without dropping the rows (so a retry is easy).
  const restore = useCallback(
    async (type: "suite" | "case", ids: string[], noun: string) => {
      setBusy((prev) => new Set([...prev, ...ids]))
      try {
        const [url, init] = restoreRequest(base, type, ids)
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(String(res.status))
        setItems((prev) => prev.filter((i) => !(i.type === type && ids.includes(i.id))))
        announceChange()
        toast("success", `Restored ${noun}`)
      } catch {
        toast("error", `Couldn't restore ${noun}. Please try again.`)
      } finally {
        setBusy((prev) => {
          const next = new Set(prev)
          for (const id of ids) next.delete(id)
          return next
        })
      }
    },
    [base, setItems, toast]
  )

  const restoreAll = useCallback(async () => {
    const suiteIds = items.filter((i) => i.type === "suite").map((i) => i.id)
    const caseIds = items.filter((i) => i.type === "case").map((i) => i.id)
    const total = suiteIds.length + caseIds.length
    if (total === 0) return
    const noun = `${total} ${total === 1 ? "item" : "items"}`
    await Promise.all([
      suiteIds.length ? restore("suite", suiteIds, `${suiteIds.length} ${suiteIds.length === 1 ? "suite" : "suites"}`) : null,
      caseIds.length ? restore("case", caseIds, `${caseIds.length} ${caseIds.length === 1 ? "case" : "cases"}`) : null,
    ])
    void noun
  }, [items, restore])

  if (loading && items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-2 py-6" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Trash2 size={22} />
        </div>
        <h2 className="text-base font-semibold text-gray-900">Recycle bin is empty</h2>
        <p className="max-w-sm text-sm text-gray-500">
          Deleted suites and cases show up here. Restore anything you removed by mistake.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {items.length} deleted {items.length === 1 ? "item" : "items"}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void restoreAll()}>
          <Undo2 size={14} />
          Restore all
        </Button>
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {items.map((item) => {
          const isBusy = busy.has(item.id)
          const typeLabel = item.type === "suite" ? "suite" : "case"
          return (
            <li key={`${item.type}:${item.id}`} className="flex items-center gap-3 px-4 py-3">
              <span
                className={item.type === "suite" ? "text-primary" : "text-gray-400"}
                aria-hidden="true"
              >
                {item.type === "suite" ? <FolderTree size={16} /> : <FileText size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">
                  {typeLabel === "suite" ? "Suite" : "Case"}
                  <span aria-hidden="true"> · </span>
                  deleted {relativeTime(item.deleted_at)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={isBusy}
                aria-label={`Restore ${item.label}`}
                onClick={() => void restore(item.type, [item.id], `"${item.label}"`)}
              >
                <RotateCcw size={14} />
                Restore
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
