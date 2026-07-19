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
import { Pencil, Trash2, MoreHorizontal, GripVertical, ChevronDown, ChevronRight } from "lucide-react"
import { useToast, ConfirmInline } from "@/components/ui"
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
  const firstItemRef = useRef<HTMLButtonElement>(null)

  // Move focus into the menu on open and restore it to the opener on close, so
  // the menu is fully operable from the keyboard (it can be opened via the
  // actions button, not just right-click).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    firstItemRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

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
      role="menu"
      className="fixed z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-dropdown"
      style={{ left: x, top: y }}
    >
      <button
        ref={firstItemRef}
        type="button"
        role="menuitem"
        onClick={() => { onRename(); onClose() }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:bg-gray-100 transition-colors"
      >
        <Pencil size={14} className="text-gray-400" />
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => { onDelete(); onClose() }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:bg-gray-100 transition-colors"
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
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(suite.name)
  const [isDeleting, setIsDeleting] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const hasChildren = suite.children.length > 0
  const isSelected = selected === suite.id
  const isChecked = checkedIds?.has(suite.id) ?? false

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!canEdit || selectMode) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [canEdit, selectMode])

  // Keyboard/click path to the same actions menu — anchored to the button so it
  // doesn't overflow the sidebar's right edge.
  const openMenuFromButton = useCallback(() => {
    const rect = menuButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setContextMenu({ x: Math.max(8, rect.right - 140), y: rect.bottom + 4 })
  }, [])

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
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/${suite.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      )
      if (res.ok) {
        onSuiteChanged?.()
      } else {
        toast("error", "Couldn't rename the suite — please try again.")
      }
    } catch {
      toast("error", "Couldn't rename the suite — check your connection and retry.")
    } finally {
      setIsRenaming(false)
    }
  }, [renameValue, suite.name, suite.id, workspaceId, projectId, onSuiteChanged, toast])

  const confirmDelete = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/backend/workspaces/${workspaceId}/projects/${projectId}/suites/${suite.id}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        onSuiteChanged?.()
      } else {
        toast("error", "Couldn't delete the suite — please try again.")
      }
    } catch {
      toast("error", "Couldn't delete the suite — check your connection and retry.")
    } finally {
      setIsDeleting(false)
    }
  }, [suite.id, workspaceId, projectId, onSuiteChanged, toast])

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

    // Persist to API; refetch via onSuiteReordered restores correct order.
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

    onSuiteReordered?.()
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : ""}>
      <div
        className={clsx(
          "group flex w-full items-center gap-1 overflow-hidden rounded-md text-sm text-left transition-colors",
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
                className="mr-0.5 flex h-4 w-4 shrink-0 cursor-grab items-center justify-center rounded text-gray-500 hover:text-gray-700 select-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Drag to reorder"
              >
                <GripVertical size={13} aria-hidden="true" />
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
            className={clsx("mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded transition-colors", isSelected ? "text-primary" : "text-gray-400")}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
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
            className="min-w-0 flex-1 rounded border border-primary bg-white px-1 py-0 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
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

        {/* Actions — keyboard path to rename/delete (right-click also works).
            Hidden until row hover or keyboard focus to keep the tree calm. */}
        {canEdit && !selectMode && !isRenaming && (
          <button
            ref={menuButtonRef}
            type="button"
            onClick={openMenuFromButton}
            aria-label="Suite actions"
            aria-haspopup="menu"
            className={clsx(
              "ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition",
              contextMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            )}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {isDeleting && (
        <ConfirmInline
          layout="card"
          className="mx-2 my-1"
          message={`Delete “${suite.name}”? Cases move to All Cases.`}
          confirmLabel="Delete"
          onConfirm={() => { void confirmDelete() }}
          onCancel={() => setIsDeleting(false)}
        />
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
