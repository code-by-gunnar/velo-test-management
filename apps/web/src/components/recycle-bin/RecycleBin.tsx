import { useCallback, useEffect, useMemo, useState } from "react"
import { FolderTree, FileText, Play, RotateCcw, Trash2, Undo2, ChevronRight } from "lucide-react"
import { Button, ConfirmDialog, ConfirmInline, Modal } from "@/components/ui"
import { useToast } from "@/components/ui/toast"
import { useCachedState } from "@/hooks/useCachedState"
import { notifyRecycleBinChanged } from "@/lib/recycle-bin-events"

type RecycleType = "suite" | "case" | "run"

// A soft-deleted item, normalized across the source types so the list can render
// and restore them uniformly. `label` is the suite name, case title, or run name.
interface RecycleItem {
  id: string
  label: string
  deleted_at: string
  deletedBy: string | null
  type: RecycleType
  // Cases only: true when the parent suite is also deleted, so restoring the
  // case reparents it to the project root.
  restoresToRoot?: boolean
  // Cases only: the parent suite id (used to group child cases under a deleted
  // suite's side panel).
  suiteId?: string | null
}

interface DeletedRow {
  deleted_at: string
  deleted_by_name?: string | null
}

interface RecycleBinResponse {
  suites: ({ id: string; name: string } & DeletedRow)[]
  cases: ({ id: string; title: string; restores_to_root?: boolean; suite_id?: string | null } & DeletedRow)[]
  // Present only for admins (runs are an admin-only concern); may be absent.
  runs?: ({ id: string; name: string } & DeletedRow)[]
}

interface RecycleBinProps {
  workspaceId: string
  projectId: string
}

// Project- vs workspace-scoped API bases. Suites/cases hang off the project;
// runs are workspace-scoped (/workspaces/:id/runs/...).
interface Bases {
  project: string
  workspace: string
}

// Restore endpoints diverge by type (VEL-31): suites → /suites/bulk-restore
// ({ ids }), runs → /runs/bulk-restore ({ ids }), cases → /cases/bulk action
// enum ({ case_ids }). One helper owns the split so callers never guess.
function restoreRequest(bases: Bases, type: RecycleType, ids: string[]): [string, RequestInit] {
  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (type === "suite") return [`${bases.project}/suites/bulk-restore`, json({ ids })]
  if (type === "run") return [`${bases.workspace}/runs/bulk-restore`, json({ ids })]
  return [`${bases.project}/cases/bulk`, json({ action: "restore", case_ids: ids })]
}

// Purge (permanent delete) is the destructive twin of restore and splits the
// same way, plus /runs/bulk-purge for runs.
function purgeRequest(bases: Bases, type: RecycleType, ids: string[]): [string, RequestInit] {
  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (type === "suite") return [`${bases.project}/suites/bulk-purge`, json({ ids })]
  if (type === "run") return [`${bases.workspace}/runs/bulk-purge`, json({ ids })]
  return [`${bases.project}/cases/bulk`, json({ action: "purge", case_ids: ids })]
}

// Per-type presentation: icon, icon tone, and the singular label shown per row.
const TYPE_META: Record<RecycleType, { icon: typeof FolderTree; tone: string; label: string }> = {
  suite: { icon: FolderTree, tone: "text-primary", label: "Suite" },
  case: { icon: FileText, tone: "text-gray-400", label: "Case" },
  run: { icon: Play, tone: "text-gray-400", label: "Run" },
}

// The shared left side of a row: type icon, label, and a "Type · deleted 2h ago
// · by Name" subtitle. Reused by the main list and the suite side panel.
function ItemBody({ item }: { item: RecycleItem }) {
  const meta = TYPE_META[item.type]
  const Icon = meta.icon
  return (
    <>
      <span className={meta.tone} aria-hidden="true">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
        <p className="text-xs text-gray-500">
          {meta.label}
          <span aria-hidden="true"> · </span>
          deleted {relativeTime(item.deleted_at)}
          {item.deletedBy && (
            <>
              <span aria-hidden="true"> · </span>
              by {item.deletedBy}
            </>
          )}
        </p>
      </div>
    </>
  )
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
  const workspaceBase = `/api/backend/workspaces/${workspaceId}`
  const base = `${workspaceBase}/projects/${projectId}`
  const bases: Bases = useMemo(
    () => ({ project: base, workspace: workspaceBase }),
    [base, workspaceBase]
  )

  const [items, setItems, hadCache] = useCachedState<RecycleItem[]>(
    `velo:recycle-bin:${projectId}`,
    []
  )
  const [loading, setLoading] = useState(!hadCache)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // Permanent-delete confirmation target: a single item, or "all" (empty bin).
  const [confirmTarget, setConfirmTarget] = useState<
    { kind: "one"; item: RecycleItem } | { kind: "all" } | null
  >(null)
  const [purging, setPurging] = useState(false)
  // Which deleted suite's child cases are shown in the popup (null = closed).
  const [openSuiteId, setOpenSuiteId] = useState<string | null>(null)
  // Inline purge confirm inside the popup, keyed by the case row awaiting it.
  const [panelConfirmId, setPanelConfirmId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${base}/recycle-bin`)
      if (!res.ok) return
      const data = (await res.json()) as RecycleBinResponse
      const merged: RecycleItem[] = [
        ...data.suites.map((s) => ({ id: s.id, label: s.name, deleted_at: s.deleted_at, deletedBy: s.deleted_by_name ?? null, type: "suite" as const })),
        ...data.cases.map((c) => ({ id: c.id, label: c.title, deleted_at: c.deleted_at, deletedBy: c.deleted_by_name ?? null, restoresToRoot: c.restores_to_root ?? false, suiteId: c.suite_id ?? null, type: "case" as const })),
        ...(data.runs ?? []).map((r) => ({ id: r.id, label: r.name, deleted_at: r.deleted_at, deletedBy: r.deleted_by_name ?? null, type: "run" as const })),
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
    async (type: RecycleType, ids: string[], noun: string) => {
      setBusy((prev) => new Set([...prev, ...ids]))
      try {
        const [url, init] = restoreRequest(bases, type, ids)
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(String(res.status))
        setItems((prev) => prev.filter((i) => !(i.type === type && ids.includes(i.id))))
        notifyRecycleBinChanged()
        // Resync — restoring a suite also un-deletes its child cases, which are
        // listed individually, so the server view can differ from the optimistic one.
        void refetch()
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
    [bases, refetch, setItems, toast]
  )

  // Fan a batch operation across all three types with correct plural nouns.
  const forEachType = useCallback(
    (run: (type: RecycleType, ids: string[], noun: string) => Promise<void> | void) => {
      const groups: Array<[RecycleType, string]> = [
        ["suite", "suite"],
        ["case", "case"],
        ["run", "run"],
      ]
      return groups
        .map(([type, singular]) => {
          const ids = items.filter((i) => i.type === type).map((i) => i.id)
          if (ids.length === 0) return null
          const noun = `${ids.length} ${ids.length === 1 ? singular : `${singular}s`}`
          return run(type, ids, noun)
        })
        .filter(Boolean)
    },
    [items]
  )

  const restoreAll = useCallback(async () => {
    await Promise.all(forEachType(restore))
  }, [forEachType, restore])

  // Permanently delete a batch of one type. Unlike restore this is irreversible,
  // so it's only ever reached through the confirm dialog below.
  const purge = useCallback(
    async (type: RecycleType, ids: string[], noun: string) => {
      try {
        const [url, init] = purgeRequest(bases, type, ids)
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(String(res.status))
        setItems((prev) => prev.filter((i) => !(i.type === type && ids.includes(i.id))))
        notifyRecycleBinChanged()
        // Resync — purging a suite also purges its child cases (listed separately).
        void refetch()
        toast("success", `Permanently deleted ${noun}`)
      } catch {
        toast("error", `Couldn't delete ${noun}. Please try again.`)
      }
    },
    [bases, refetch, setItems, toast]
  )

  const runPurge = useCallback(async () => {
    if (!confirmTarget) return
    setPurging(true)
    try {
      if (confirmTarget.kind === "one") {
        const { item } = confirmTarget
        await purge(item.type, [item.id], `"${item.label}"`)
      } else {
        await Promise.all(forEachType(purge))
      }
    } finally {
      setPurging(false)
      setConfirmTarget(null)
    }
  }, [confirmTarget, forEachType, purge])

  // Dialog copy adapts to the target so the consequence is explicit.
  const confirmProps = (() => {
    if (!confirmTarget) return { title: "", message: undefined as string | undefined }
    if (confirmTarget.kind === "all") {
      return {
        title: "Empty the recycle bin?",
        message: `This permanently deletes all ${items.length} ${items.length === 1 ? "item" : "items"}. It can't be undone.`,
      }
    }
    const { item } = confirmTarget
    const message =
      item.type === "suite"
        ? "The suite and every case inside it are removed for good. It can't be undone."
        : item.type === "run"
          ? "The run, its results, and any evidence are removed for good. It can't be undone."
          : "This case is removed for good. It can't be undone."
    return { title: `Delete “${item.label}” permanently?`, message }
  })()

  // A case whose parent suite is also in the bin is shown inside that suite's
  // side panel, not at the top level. Group those; keep everything else flat.
  const childCasesBySuite = useMemo(() => {
    const map = new Map<string, RecycleItem[]>()
    for (const item of items) {
      if (item.type === "case" && item.restoresToRoot && item.suiteId) {
        const arr = map.get(item.suiteId) ?? []
        arr.push(item)
        map.set(item.suiteId, arr)
      }
    }
    return map
  }, [items])

  const topLevel = useMemo(
    () => items.filter((i) => !(i.type === "case" && i.restoresToRoot && i.suiteId)),
    [items]
  )

  const openSuite = openSuiteId ? items.find((i) => i.type === "suite" && i.id === openSuiteId) ?? null : null
  const panelCases = openSuiteId ? childCasesBySuite.get(openSuiteId) ?? [] : []

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
          Deleted suites, cases, and runs show up here. Restore anything you removed by mistake.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {items.length} deleted {items.length === 1 ? "item" : "items"}
          <span className="text-gray-400"> · removed automatically after 30 days</span>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmTarget({ kind: "all" })}>
            <Trash2 size={14} />
            Empty bin
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void restoreAll()}>
            <Undo2 size={14} />
            Restore all
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {topLevel.map((item) => {
          const isBusy = busy.has(item.id)
          const childCount = item.type === "suite" ? childCasesBySuite.get(item.id)?.length ?? 0 : 0
          return (
            <li key={`${item.type}:${item.id}`} className="flex items-center gap-3 px-4 py-3">
              <ItemBody item={item} />
              <div className="flex items-center gap-1">
                {childCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenSuiteId(item.id)}
                    className="mr-1 inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`View ${childCount} deleted ${childCount === 1 ? "case" : "cases"} in ${item.label}`}
                  >
                    {childCount} {childCount === 1 ? "case" : "cases"}
                    <ChevronRight size={13} />
                  </button>
                )}
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
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  aria-label={`Delete ${item.label} permanently`}
                  title="Delete permanently"
                  className="text-gray-500 hover:text-fail"
                  onClick={() => setConfirmTarget({ kind: "one", item })}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        title={confirmProps.title}
        {...(confirmProps.message ? { message: confirmProps.message } : {})}
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        busy={purging}
        onConfirm={() => void runPurge()}
        onClose={() => setConfirmTarget(null)}
      />

      {/* Popup listing the deleted cases inside a deleted suite (VEL-31) —
          a centered modal to match the app's other popups. */}
      <Modal
        isOpen={openSuiteId !== null}
        onClose={() => {
          setOpenSuiteId(null)
          setPanelConfirmId(null)
        }}
        size="md"
        title={openSuite ? `${openSuite.label} — deleted cases` : "Deleted cases"}
      >
        <p className="mb-3 text-xs text-gray-500">
          Restoring a case here sends it to the project root. To bring the cases back
          inside the suite, restore the suite itself.
        </p>
        {panelCases.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No deleted cases left in this suite.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {panelCases.map((c) => {
              const isBusy = busy.has(c.id)
              return (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <ItemBody item={c} />
                  {panelConfirmId === c.id ? (
                    <ConfirmInline
                      confirmLabel="Delete"
                      busyLabel="Deleting…"
                      busy={isBusy}
                      message="Can't be undone"
                      onConfirm={() => {
                        void purge("case", [c.id], `"${c.label}"`)
                        setPanelConfirmId(null)
                      }}
                      onCancel={() => setPanelConfirmId(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        aria-label={`Restore ${c.label}`}
                        onClick={() => void restore("case", [c.id], `"${c.label}"`)}
                      >
                        <RotateCcw size={14} />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        aria-label={`Delete ${c.label} permanently`}
                        title="Delete permanently"
                        className="text-gray-500 hover:text-fail"
                        onClick={() => setPanelConfirmId(c.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </div>
  )
}
