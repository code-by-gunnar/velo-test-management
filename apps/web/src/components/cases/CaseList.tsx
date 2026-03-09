import { useState } from "react"
import { clsx } from "clsx"
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
import { Button } from "@/components/ui"
import type { TestCase } from "@/hooks/useTestCases"
import type { Suite } from "@/hooks/useSuiteTree"
import { CaseListRow } from "./CaseListRow"

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
  workspaceId: string
  projectId: string
  onNewCase: () => void
  onOpenCase: (id: string) => void
  onCasesChange: (cases: TestCase[]) => void
  refetch: () => void
}

export function CaseList({
  cases,
  isLoading,
  selectedSuite,
  workspaceId,
  projectId,
  onNewCase,
  onOpenCase,
  onCasesChange,
  refetch,
}: CaseListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)

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

    // Persist to API
    try {
      await fetch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/cases/${activeId}/position`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: newPosition }),
        }
      )
    } catch {
      // Ignore network errors — refetch will restore correct state
    }

    // Refetch to get server-confirmed order (in case of renumber)
    refetch()
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{suiteName}</span>
          {!isLoading && (
            <span className="text-xs text-gray-400">{cases.length} {cases.length === 1 ? "case" : "cases"}</span>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={onNewCase}>
          New Case
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      ) : cases.length === 0 ? (
        // Empty state
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl text-gray-300">
            ✓
          </div>
          <div>
            <h3 className="mb-1 text-base font-semibold text-gray-900">No test cases yet</h3>
            <p className="text-sm text-gray-500">Create your first test case to get started</p>
          </div>
          <Button variant="primary" size="md" onClick={onNewCase}>
            New Test Case
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                {/* Drag handle column header — empty */}
                <th className="w-8 px-2 py-2" />
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = indeterminate
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-cobalt"
                    aria-label="Select all"
                  />
                </th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Title
                </th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Priority
                </th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Steps
                </th>
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => { void handleDragEnd(e) }}
            >
              <SortableContext
                items={cases.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {cases.map((tc, index) => (
                    <CaseListRow
                      key={tc.id}
                      testCase={tc}
                      index={index}
                      isSelected={selectedIds.has(tc.id)}
                      onToggleSelect={toggleSelect}
                      onOpen={onOpenCase}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className={clsx(
          "flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-2.5 shadow-md"
        )}>
          <span className="text-sm font-medium text-gray-700">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm">
              Move to ▾
            </Button>
            <Button variant="secondary" size="sm">
              Copy to ▾
            </Button>
            <Button variant="destructive" size="sm">
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
