import { useState, useEffect, useRef } from "react"
import { Button, ConfirmInline } from "@/components/ui"
import { ChevronDown } from "lucide-react"
import type { Suite } from "@/hooks/useSuiteTree"
import { useUserRole } from "@/hooks/useUserRole"
import { SuitePicker } from "./SuitePicker"

interface BulkActionBarProps {
  selectedCount: number
  suites: Suite[]
  onMove: (targetSuiteId: string | null) => Promise<void>
  onCopy: (targetSuiteId: string | null) => Promise<void>
  onDelete: () => Promise<void>
  onClearSelection: () => void
}

type DropdownMode = "move" | "copy" | null

export function BulkActionBar({
  selectedCount,
  suites,
  onMove,
  onCopy,
  onDelete,
  onClearSelection,
}: BulkActionBarProps) {
  const { canEdit } = useUserRole()
  const [dropdownMode, setDropdownMode] = useState<DropdownMode>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownMode) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownMode(null)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [dropdownMode])

  async function handleSuiteSelect(suiteId: string | null) {
    setDropdownMode(null)
    setIsSubmitting(true)
    try {
      if (dropdownMode === "move") {
        await onMove(suiteId)
      } else if (dropdownMode === "copy") {
        await onCopy(suiteId)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    setIsSubmitting(true)
    try {
      await onDelete()
      setConfirmingDelete(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      ref={containerRef}
      // Anchored to the content column (CaseList is relative), not the viewport,
      // so the bar never overlaps the suite sidebar to its left.
      className="absolute inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-6 py-3 shadow-lg"
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">
          {selectedCount} selected
        </span>

        {/* Move to dropdown */}
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDropdownMode(dropdownMode === "move" ? null : "move")}
            disabled={isSubmitting || !canEdit}
          >
            Move to <ChevronDown size={14} className="ml-1" aria-hidden="true" />
          </Button>
          {dropdownMode === "move" && (
            <SuitePicker suites={suites} onSelect={handleSuiteSelect} />
          )}
        </div>

        {/* Copy to dropdown */}
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDropdownMode(dropdownMode === "copy" ? null : "copy")}
            disabled={isSubmitting || !canEdit}
          >
            Copy to <ChevronDown size={14} className="ml-1" aria-hidden="true" />
          </Button>
          {dropdownMode === "copy" && (
            <SuitePicker suites={suites} onSelect={handleSuiteSelect} />
          )}
        </div>

        {/* Delete — soft-delete to the recycle bin, so it's recoverable */}
        {confirmingDelete ? (
          <ConfirmInline
            confirmLabel={`Delete ${selectedCount}`}
            busyLabel="Deleting…"
            busy={isSubmitting}
            message="You can undo this right after"
            onConfirm={() => { void handleDelete() }}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmingDelete(true)}
            disabled={isSubmitting || !canEdit}
          >
            Delete {selectedCount}
          </Button>
        )}

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClearSelection}
          className="ml-auto text-sm text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
