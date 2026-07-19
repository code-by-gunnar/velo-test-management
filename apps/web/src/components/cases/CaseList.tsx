import { useState, useMemo } from "react"
import { useUserRole } from "@/hooks/useUserRole"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensors,
  useSensor,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { Button, useToast } from "@/components/ui"
import { ArrowUp, ArrowDown, Sparkles, Pencil, ClipboardList } from "lucide-react"
import type { TestCase } from "@/hooks/useTestCases"
import type { Suite } from "@/hooks/useSuiteTree"
import { CaseListRow } from "./CaseListRow"
import { BulkActionBar } from "./BulkActionBar"
import { SuiteFormModal } from "./SuiteFormModal"

type SortField = "title" | "suite" | "priority"
type SortDir = "asc" | "desc"
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// Compute mid-gap position for drag reorder.
// Returns -1 if gap has collapsed (positions equal), signaling server renumber.
function computeNewPosition(
  items: { id: string; position: number }[],
  activeId: string,
  overId: string
): number {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const newIndex = sorted.findIndex((i) => i.id === overId)
  if (newIndex === -1) return -1
  const prev = sorted[newIndex - 1]?.position ?? 0
  const next = sorted[newIndex + 1]?.position ?? (sorted[newIndex]!.position + 2000)
  const newPos = Math.floor((prev + next) / 2)
  return newPos === prev ? -1 : newPos
}

interface CaseListProps {
  cases: TestCase[]
  isLoading: boolean
  selectedSuite: Suite | null  // null = All Cases
  suites: Suite[]              // Flat suite list for BulkActionBar suite picker
  workspaceId: string
  projectId: string
  onNewCase: () => void
  onImport: () => void
  onLinearImport?: () => void
  onOpenCase: (id: string) => void
  onCasesChange: (cases: TestCase[]) => void
  refetch: () => void
}

export function CaseList({
  cases,
  isLoading,
  selectedSuite,
  suites,
  workspaceId,
  projectId,
  onNewCase,
  onImport,
  onLinearImport,
  onOpenCase,
  onCasesChange,
  refetch,
}: CaseListProps) {
  const { canEdit } = useUserRole()
  const { toast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [editSuiteOpen, setEditSuiteOpen] = useState(false)

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "asc") {
        setSortDir("desc")
      } else {
        // Third click clears sort (back to position order)
        setSortField(null)
        setSortDir("asc")
      }
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const suiteNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of suites) map.set(s.id, s.name)
    return map
  }, [suites])

  const sortedCases = useMemo(() => {
    if (!sortField) return cases
    const sorted = [...cases].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title)
          break
        case "suite": {
          const aName = a.suite_id ? (suiteNameMap.get(a.suite_id) ?? "") : ""
          const bName = b.suite_id ? (suiteNameMap.get(b.suite_id) ?? "") : ""
          cmp = aName.localeCompare(bName)
          break
        }
        case "priority":
          cmp = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
          break
      }
      return sortDir === "desc" ? -cmp : cmp
    })
    return sorted
  }, [cases, sortField, sortDir, suiteNameMap])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // distance: 8 prevents checkbox clicks from triggering drag
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    const newPosition = computeNewPosition(cases, activeId, overId)

    // Optimistic: reorder local state immediately
    const oldIndex = cases.findIndex((c) => c.id === activeId)
    const newIndex = cases.findIndex((c) => c.id === overId)
    const reordered = arrayMove(cases, oldIndex, newIndex)
    onCasesChange(reordered)

    // Persist to API. On failure the refetch below restores the true order, but
    // tell the user their reorder didn't stick rather than silently snapping back.
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/${activeId}/position`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: newPosition }),
        }
      )
      if (!res.ok) toast("error", "Couldn't save the new order — please try again.")
    } catch {
      toast("error", "Couldn't save the new order — check your connection and retry.")
    }

    // Refetch to get server-confirmed order (in case of renumber)
    refetch()
  }

  const bulkUrl = `/api/backend/workspaces/${workspaceId}/projects/${projectId}/cases/bulk`

  // Restore soft-deleted cases — powers the "Undo" on a delete toast. (Cases are
  // soft-deleted server-side, so the ids are still recoverable via deleted_at.)
  async function undoDelete(ids: string[]) {
    const noun = ids.length === 1 ? "case" : "cases"
    try {
      const res = await fetch(bulkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", case_ids: ids }),
      })
      if (!res.ok) {
        toast("error", "Couldn't undo — please try again.")
        return
      }
      toast("success", `Restored ${ids.length} ${noun}`)
      refetch()
    } catch {
      toast("error", "Couldn't undo — check your connection and retry.")
    }
  }

  // Single source of truth for the three bulk operations — all POST the same
  // /cases/bulk endpoint, differing only by action. Checks res.ok and reports
  // success/failure so a failed move/copy/delete is never silent.
  async function runBulkAction(action: "move" | "copy" | "delete", targetSuiteId?: string | null) {
    const ids = [...selectedIds]
    const count = ids.length
    const noun = count === 1 ? "case" : "cases"
    try {
      const res = await fetch(bulkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          case_ids: ids,
          ...(action !== "delete" ? { target_suite_id: targetSuiteId ?? null } : {}),
        }),
      })
      if (!res.ok) {
        toast("error", `Couldn't ${action} ${count} ${noun} — please try again.`)
        return
      }
      setSelectedIds(new Set())
      if (action === "delete") {
        // Soft delete → offer an immediate Undo (restores deleted_at).
        toast("success", `Deleted ${count} ${noun}`, {
          action: { label: "Undo", onClick: () => { void undoDelete(ids) } },
        })
      } else {
        const verb = action === "move" ? "Moved" : "Copied"
        toast("success", `${verb} ${count} ${noun}`)
      }
      refetch()
    } catch {
      toast("error", `Couldn't ${action} ${count} ${noun} — check your connection and retry.`)
    }
  }

  const toggleSelect = (index: number, shiftKey: boolean) => {
    const id = cases[index]?.id
    if (!id) return

    if (shiftKey && lastClickedIndex !== null) {
      // Range selection
      const start = Math.min(lastClickedIndex, index)
      const end = Math.max(lastClickedIndex, index)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          const caseId = cases[i]?.id
          if (caseId) next.add(caseId)
        }
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    }
    setLastClickedIndex(index)
  }

  const toggleAll = () => {
    if (selectedIds.size === cases.length && cases.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(cases.map((c) => c.id)))
    }
  }

  const suiteName = selectedSuite ? selectedSuite.name : "All Cases"
  const allChecked = cases.length > 0 && selectedIds.size === cases.length
  const indeterminate = selectedIds.size > 0 && selectedIds.size < cases.length

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4" style={{ minHeight: 52 }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{suiteName}</span>
            {!isLoading && (
              <span className="text-xs text-gray-500">{cases.length} {cases.length === 1 ? "case" : "cases"}</span>
            )}
            {selectedSuite && canEdit && (
              <button
                type="button"
                onClick={() => setEditSuiteOpen(true)}
                aria-label="Edit suite"
                title="Edit suite"
                className="inline-flex items-center justify-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
          {selectedSuite?.description && (
            <span className="text-xs text-gray-500">{selectedSuite.description}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onLinearImport && (
            <Button variant="secondary" size="sm" onClick={onLinearImport} disabled={!canEdit}>
              <Sparkles size={14} className="mr-1.5" />
              From Linear
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onImport} disabled={!canEdit}>
            Import CSV
          </Button>
          <Button variant="primary" size="sm" onClick={onNewCase} disabled={!canEdit} title="New case (press N)">
            New Case
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-8 px-2 py-3" />
                  <td className="w-8 px-3 py-3"><div className="skeleton h-3.5 w-3.5 rounded" /></td>
                  <td className="py-3 pr-4"><div className="skeleton h-3 rounded" style={{ width: `${[55, 70, 45, 65, 50][i]}%` }} /></td>
                  <td className="py-3 pr-4"><div className="skeleton h-3 w-12 rounded" /></td>
                  <td className="py-3 pr-4"><div className="skeleton h-3 w-6 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : cases.length === 0 ? (
        // Empty state
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <ClipboardList size={28} aria-hidden="true" />
          </div>
          <div>
            <h3 className="mb-1 text-base font-semibold text-gray-900">No test cases yet</h3>
            <p className="text-sm text-gray-500">Create your first test case to get started</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="primary" size="md" onClick={onNewCase} disabled={!canEdit} title="New case (press N)">
              New Test Case
            </Button>
            {canEdit && (
              <p className="text-xs text-gray-500">
                or press{" "}
                <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-mono text-[10px] text-gray-600">N</kbd>
              </p>
            )}
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => { void handleDragEnd(e) }}
        >
          <div className="flex-1 overflow-auto">
            <table className="w-full" style={{ borderSpacing: "0 4px", borderCollapse: "separate" }}>
              <thead className="sticky top-0 bg-white">
                <tr>
                  {/* Drag handle column header — empty */}
                  <th className="w-8 px-2 py-2.5" />
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = indeterminate
                      }}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
                      aria-label="Select all"
                    />
                  </th>
                  <SortHeader field="title" label="Title" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                  {!selectedSuite && (
                    <SortHeader field="suite" label="Suite" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                  )}
                  <SortHeader field="priority" label="Priority" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Steps
                  </th>
                </tr>
              </thead>
              <SortableContext
                items={sortedCases.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
                disabled={!!sortField}
              >
                <tbody>
                  {sortedCases.map((tc, index) => (
                    <CaseListRow
                      key={tc.id}
                      testCase={tc}
                      index={index}
                      isSelected={selectedIds.has(tc.id)}
                      showSuiteColumn={!selectedSuite}
                      suites={suites}
                      onToggleSelect={toggleSelect}
                      onOpen={onOpenCase}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </div>
        </DndContext>
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          suites={suites}
          onMove={(targetSuiteId) => runBulkAction("move", targetSuiteId)}
          onCopy={(targetSuiteId) => runBulkAction("copy", targetSuiteId)}
          onDelete={() => runBulkAction("delete")}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {selectedSuite && editSuiteOpen && (
        <SuiteFormModal
          isOpen={editSuiteOpen}
          onClose={() => setEditSuiteOpen(false)}
          workspaceId={workspaceId}
          projectId={projectId}
          mode="edit"
          suite={selectedSuite}
          onSaved={() => { refetch() }}
        />
      )}
    </div>
  )
}

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onToggle,
}: {
  field: SortField
  label: string
  sortField: SortField | null
  sortDir: SortDir
  onToggle: (field: SortField) => void
}) {
  const active = sortField === field
  return (
    <th className="py-2.5 pr-4 text-left">
      <button
        type="button"
        onClick={() => onToggle(field)}
        className="group inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />
        )}
      </button>
    </th>
  )
}
