import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui"
import type { Suite } from "@/hooks/useSuiteTree"

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
  const [dropdownMode, setDropdownMode] = useState<DropdownMode>(null)
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
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-6 py-3 shadow-lg"
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
            disabled={isSubmitting}
          >
            Move to &#9660;
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
            disabled={isSubmitting}
          >
            Copy to &#9660;
          </Button>
          {dropdownMode === "copy" && (
            <SuitePicker suites={suites} onSelect={handleSuiteSelect} />
          )}
        </div>

        {/* Delete */}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => { void handleDelete() }}
          disabled={isSubmitting}
        >
          Delete
        </Button>

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClearSelection}
          className="ml-auto text-sm text-gray-500 hover:text-gray-700"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

interface SuitePickerProps {
  suites: Suite[]
  onSelect: (suiteId: string | null) => void
}

function SuitePicker({ suites, onSelect }: SuitePickerProps) {
  return (
    <ul className="absolute bottom-full left-0 mb-1 max-h-64 min-w-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-md">
      {/* Root option */}
      <li>
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
          onClick={() => onSelect(null)}
        >
          Root (no suite)
        </button>
      </li>
      {suites.map((suite) => (
        <li key={suite.id}>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
            style={{ paddingLeft: 12 + suite.depth * 12 }}
            onClick={() => onSelect(suite.id)}
          >
            {suite.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
