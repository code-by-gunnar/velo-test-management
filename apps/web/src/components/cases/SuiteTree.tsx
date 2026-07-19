import { useState, useRef, useCallback } from "react"
import { clsx } from "clsx"
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
import { Trash2, Inbox } from "lucide-react"
import { useToast, ConfirmInline } from "@/components/ui"
import type { Suite } from "@/hooks/useSuiteTree"
import { SuiteTreeItem } from "./SuiteTreeItem"
import { SuiteFormModal } from "./SuiteFormModal"

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

// Collect all suite IDs from a tree (including nested children)
function collectAllIds(suites: Suite[]): string[] {
  const ids: string[] = []
  for (const s of suites) {
    ids.push(s.id)
    if (s.children.length > 0) ids.push(...collectAllIds(s.children))
  }
  return ids
}

interface SuiteTreeProps {
  tree: Suite[]
  isLoading?: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  workspaceId: string
  projectId: string
  onSuiteCreated?: () => void
  onSuiteReordered?: () => void
}

export function SuiteTree({
  tree,
  isLoading,
  selected,
  onSelect,
  workspaceId,
  projectId,
  onSuiteCreated,
  onSuiteReordered,
}: SuiteTreeProps) {
  const { canEdit } = useUserRole()
  const { toast } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [rootSuites, setRootSuites] = useState<Suite[]>(tree)

  // Select mode state
  const [selectMode, setSelectMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)

  // Keep local root suites in sync when tree prop changes (e.g., refetch)
  // Use a ref to detect external tree changes vs. local optimistic updates
  const prevTreeRef = useRef(tree)
  if (prevTreeRef.current !== tree) {
    prevTreeRef.current = tree
    setRootSuites(tree)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setCheckedIds(new Set())
    setConfirmingBulkDelete(false)
  }, [])

  const toggleSelectAll = useCallback(() => {
    const allIds = collectAllIds(rootSuites)
    setCheckedIds((prev) => {
      if (prev.size === allIds.length) return new Set()
      return new Set(allIds)
    })
  }, [rootSuites])

  const handleBulkDelete = useCallback(async () => {
    if (checkedIds.size === 0) return
    setIsDeleting(true)
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [...checkedIds] }),
        }
      )
      if (res.ok) {
        // If selected suite was deleted, clear selection
        if (selected && checkedIds.has(selected)) {
          onSelect(null)
        }
        onSuiteCreated?.()
        exitSelectMode()
      } else {
        toast("error", "Couldn't delete the selected suites — please try again.")
      }
    } catch {
      toast("error", "Couldn't delete the selected suites — check your connection and retry.")
    } finally {
      setIsDeleting(false)
    }
  }, [checkedIds, workspaceId, projectId, selected, onSelect, onSuiteCreated, exitSelectMode, toast])

  async function handleSuiteDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    const newPosition = computeNewPosition(rootSuites, activeId, overId)

    // Optimistic reorder
    const oldIndex = rootSuites.findIndex((s) => s.id === activeId)
    const newIndex = rootSuites.findIndex((s) => s.id === overId)
    setRootSuites(arrayMove(rootSuites, oldIndex, newIndex))

    // Persist to API
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/${activeId}/position`,
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

    // Refetch to confirm server order
    onSuiteReordered?.()
  }

  const startCreate = () => setCreateOpen(true)

  const allIds = collectAllIds(rootSuites)
  const allChecked = allIds.length > 0 && checkedIds.size === allIds.length

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape" && selectMode) {
          exitSelectMode()
          return
        }
        // N key when tree is focused (not in input) starts create
        if (e.key === "n" && !createOpen && !selectMode && (e.target as HTMLElement).tagName !== "INPUT") {
          startCreate()
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3" style={{ minHeight: 52 }}>
        <span className="text-section-label uppercase text-gray-500">Suites</span>
        <div className="flex items-center gap-1">
          {canEdit && !selectMode && rootSuites.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 text-xs hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
              title="Select suites"
              aria-label="Select suites"
            >
              <Trash2 size={13} />
            </button>
          )}
          {!selectMode && (
            <button
              type="button"
              onClick={startCreate}
              disabled={!canEdit}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-500 text-sm disabled:opacity-40 disabled:cursor-default enabled:hover:bg-gray-100 enabled:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
              title={canEdit ? "New suite" : "Editor access required"}
              aria-label="New suite"
            >
              +
            </button>
          )}
          {selectMode && (
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-xs text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Select mode action bar */}
      {selectMode && (
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleSelectAll}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
            />
            All
          </label>
          {checkedIds.size > 0 && !confirmingBulkDelete && (
            <button
              type="button"
              onClick={() => setConfirmingBulkDelete(true)}
              className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Delete {checkedIds.size}
            </button>
          )}
          {confirmingBulkDelete && (
            <ConfirmInline
              confirmLabel={`Delete ${checkedIds.size}`}
              busyLabel="Deleting…"
              busy={isDeleting}
              onConfirm={() => { void handleBulkDelete() }}
              onCancel={() => setConfirmingBulkDelete(false)}
            />
          )}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isLoading ? (
          // Skeleton shimmer while suites load
          <div className="space-y-1 px-1 pt-1">
            {[40, 60, 48, 72].map((w) => (
              <div key={w} className="flex items-center gap-2 py-1">
                <div className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <>
        {/* All Cases root */}
        {!selectMode && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={clsx(
              "flex w-full items-center gap-2 rounded-md px-2 text-sm text-left transition-colors",
              selected === null
                ? "bg-primary-selected text-primary font-medium"
                : "text-gray-800 hover:bg-gray-100"
            )}
            style={{ height: 32, padding: '6px 8px' }}
          >
            <Inbox size={15} className="shrink-0" aria-hidden="true" />
            <span>All Cases</span>
          </button>
        )}

        {/* Root suite nodes — wrapped in DndContext for within-root reorder */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => { void handleSuiteDragEnd(e) }}
        >
          <SortableContext
            items={rootSuites.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {rootSuites.map((suite) => (
              <SuiteTreeItem
                key={suite.id}
                suite={suite}
                selected={selected}
                onSelect={onSelect}
                workspaceId={workspaceId}
                projectId={projectId}
                onSuiteReordered={onSuiteReordered}
                onSuiteChanged={onSuiteCreated}
                selectMode={selectMode}
                checkedIds={checkedIds}
                onToggleCheck={toggleCheck}
              />
            ))}
          </SortableContext>
        </DndContext>
          </>
        )}
      </div>

      {createOpen && (
        <SuiteFormModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          workspaceId={workspaceId}
          projectId={projectId}
          mode="create"
          parentId={null}
          onSaved={() => { onSuiteCreated?.() }}
        />
      )}
    </div>
  )
}
