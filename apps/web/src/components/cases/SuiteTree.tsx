import { useState, useRef } from "react"
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
import type { Suite } from "@/hooks/useSuiteTree"
import { SuiteTreeItem } from "./SuiteTreeItem"

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
  const [creating, setCreating] = useState(false)
  const [newSuiteName, setNewSuiteName] = useState("")
  const [rootSuites, setRootSuites] = useState<Suite[]>(tree)
  const inputRef = useRef<HTMLInputElement>(null)

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
      await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/${activeId}/position`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: newPosition }),
        }
      )
    } catch {
      // Ignore network errors — refetch will restore correct state
    }

    // Refetch to confirm server order
    onSuiteReordered?.()
  }

  const startCreate = () => {
    setCreating(true)
    setNewSuiteName("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelCreate = () => {
    setCreating(false)
    setNewSuiteName("")
  }

  const confirmCreate = async () => {
    const name = newSuiteName.trim()
    if (!name) {
      cancelCreate()
      return
    }
    try {
      const res = await fetch(`/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        onSuiteCreated?.()
      }
    } finally {
      cancelCreate()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void confirmCreate()
    } else if (e.key === "Escape") {
      cancelCreate()
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      onKeyDown={(e) => {
        // N key when tree is focused (not in input) starts create
        if (e.key === "n" && !creating && (e.target as HTMLElement).tagName !== "INPUT") {
          startCreate()
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suites</span>
        <button
          type="button"
          onClick={startCreate}
          disabled={!canEdit}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-400 text-sm disabled:opacity-40 disabled:cursor-default enabled:hover:bg-gray-100 enabled:hover:text-gray-600"
          title={canEdit ? "New suite" : "Editor access required"}
          aria-label="New suite"
        >
          +
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1">
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
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={clsx(
            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-left transition-colors",
            selected === null
              ? "bg-cobalt/10 text-cobalt font-medium"
              : "text-gray-700 hover:bg-gray-100"
          )}
        >
          <span className="text-gray-400">◈</span>
          <span>All Cases</span>
        </button>

        {/* Inline input — appears at top of suite list */}
        {canEdit && creating && (
          <div className="px-1 py-1">
            <input
              ref={inputRef}
              type="text"
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={cancelCreate}
              placeholder="Suite name…"
              className="w-full rounded border border-cobalt bg-white px-2 py-0.5 text-sm focus:outline-none"
            />
          </div>
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
              />
            ))}
          </SortableContext>
        </DndContext>
          </>
        )}
      </div>

    </div>
  )
}
