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
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Suite } from "@/hooks/useSuiteTree"

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

interface SuiteTreeItemProps {
  suite: Suite
  selected: string | null
  onSelect: (id: string) => void
  workspaceId: string
  projectId: string
  onSuiteReordered?: (() => void) | undefined
}

export function SuiteTreeItem({
  suite,
  selected,
  onSelect,
  workspaceId,
  projectId,
  onSuiteReordered,
}: SuiteTreeItemProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = suite.children.length > 0
  const isSelected = selected === suite.id

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: suite.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  async function handleChildDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    const newPosition = computeNewPosition(suite.children, activeId, overId)

    // Persist to API; refetch via onSuiteReordered restores correct order
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

    onSuiteReordered?.()
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : ""}>
      <div
        className={clsx(
          "flex w-full items-center gap-1 rounded-md py-1 pr-2 text-sm text-left transition-colors",
          isSelected
            ? "bg-cobalt/10 text-cobalt font-medium"
            : "text-gray-700 hover:bg-gray-100"
        )}
        style={{ paddingLeft: suite.depth * 16 + 8 }}
      >
        {/* Drag handle — listeners here only, not on the whole row */}
        <span
          {...attributes}
          {...listeners}
          className="mr-0.5 flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-gray-300 hover:text-gray-500 select-none active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          &#8801;
        </span>

        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className="mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="mr-0.5 h-4 w-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(suite.id)}
          className="flex-1 truncate text-left"
        >
          {suite.name}
        </button>
      </div>

      {hasChildren && expanded && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => { void handleChildDragEnd(e) }}
        >
          <SortableContext
            items={suite.children.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {suite.children.map((child) => (
                <SuiteTreeItem
                  key={child.id}
                  suite={child}
                  selected={selected}
                  onSelect={onSelect}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  onSuiteReordered={onSuiteReordered}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
