import { useState, useRef, useEffect, useCallback } from "react"
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
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Pencil, Trash2 } from "lucide-react"
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

// ── Context Menu ────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number
  y: number
  onRename: () => void
  onDelete: () => void
  onClose: () => void
}

function SuiteContextMenu({ x, y, onRename, onDelete, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-dropdown"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        onClick={() => { onRename(); onClose() }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
      >
        <Pencil size={14} className="text-gray-400" />
        Rename
      </button>
      <button
        type="button"
        onClick={() => { onDelete(); onClose() }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
      >
        <Trash2 size={14} className="text-gray-400" />
        Delete
      </button>
    </div>
  )
}

// ── Suite Tree Item ─────────────────────────────────────────────────────────

interface SuiteTreeItemProps {
  suite: Suite
  selected: string | null
  onSelect: (id: string) => void
  workspaceId: string
  projectId: string
  onSuiteReordered?: (() => void) | undefined
  onSuiteChanged?: (() => void) | undefined
  selectMode?: boolean | undefined
  checkedIds?: Set<string> | undefined
  onToggleCheck?: ((id: string) => void) | undefined
}

export function SuiteTreeItem({
  suite,
  selected,
  onSelect,
  workspaceId,
  projectId,
  onSuiteReordered,
  onSuiteChanged,
  selectMode,
  checkedIds,
  onToggleCheck,
}: SuiteTreeItemProps) {
  const { canEdit } = useUserRole()
  const [expanded, setExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(suite.name)
  const [isDeleting, setIsDeleting] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)
  const hasChildren = suite.children.length > 0
  const isSelected = selected === suite.id
  const isChecked = checkedIds?.has(suite.id) ?? false

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!canEdit || selectMode) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [canEdit, selectMode])

  const startRename = useCallback(() => {
    setRenameValue(suite.name)
    setIsRenaming(true)
    setTimeout(() => renameRef.current?.select(), 0)
  }, [suite.name])

  const confirmRename = useCallback(async () => {
    const name = renameValue.trim()
    if (!name || name === suite.name) {
      setIsRenaming(false)
      return
    }
    try {
      await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/${suite.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      )
      onSuiteChanged?.()
    } finally {
      setIsRenaming(false)
    }
  }, [renameValue, suite.name, suite.id, workspaceId, projectId, onSuiteChanged])

  const confirmDelete = useCallback(async () => {
    try {
      await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/${suite.id}`,
        { method: "DELETE" }
      )
      onSuiteChanged?.()
    } finally {
      setIsDeleting(false)
    }
  }, [suite.id, workspaceId, projectId, onSuiteChanged])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: suite.id,
    disabled: selectMode ?? false,
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
          "flex w-full items-center gap-1 overflow-hidden rounded-md text-sm text-left transition-colors",
          isSelected && !selectMode
            ? "bg-primary-selected text-primary font-medium"
            : "text-gray-800 hover:bg-gray-100"
        )}
        style={{ height: 32, padding: '6px 8px', paddingLeft: suite.depth * 16 + 8 }}
        onContextMenu={handleContextMenu}
      >
        {/* Select mode: checkbox replaces drag handle */}
        {selectMode ? (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleCheck?.(suite.id)}
            className="mr-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-primary"
          />
        ) : (
          <>
            {/* Drag handle — listeners here only, not on the whole row */}
            {canEdit && (
              <span
                {...attributes}
                {...listeners}
                className="mr-0.5 flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-gray-300 hover:text-gray-500 select-none active:cursor-grabbing"
                aria-label="Drag to reorder"
              >
                &#8801;
              </span>
            )}
          </>
        )}

        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className={clsx("mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center hover:text-gray-600", isSelected ? "text-primary" : "text-gray-400")}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="mr-0.5 h-4 w-4 shrink-0" />
        )}

        {isRenaming ? (
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void confirmRename() }
              if (e.key === "Escape") setIsRenaming(false)
            }}
            onBlur={() => { void confirmRename() }}
            className="min-w-0 flex-1 rounded border border-primary bg-white px-1 py-0 text-sm focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (selectMode) {
                onToggleCheck?.(suite.id)
              } else {
                onSelect(suite.id)
              }
            }}
            className="flex-1 truncate text-left"
          >
            {suite.name}
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {isDeleting && (
        <div className="mx-2 my-1 rounded-md border border-gray-200 bg-white p-2 text-xs shadow-card">
          <p className="mb-2 text-gray-600">Delete &ldquo;{suite.name}&rdquo;? Cases move to All Cases.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void confirmDelete() }}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setIsDeleting(false)}
              className="rounded-md px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <SuiteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={startRename}
          onDelete={() => setIsDeleting(true)}
          onClose={() => setContextMenu(null)}
        />
      )}

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
                  onSuiteChanged={onSuiteChanged}
                  selectMode={selectMode}
                  checkedIds={checkedIds}
                  onToggleCheck={onToggleCheck}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
