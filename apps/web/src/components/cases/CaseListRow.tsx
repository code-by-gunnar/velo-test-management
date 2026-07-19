import { clsx } from "clsx"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { TestCase } from "@/hooks/useTestCases"
import type { Suite } from "@/hooks/useSuiteTree"
import { useUserRole } from "@/hooks/useUserRole"
import { GripVertical } from "lucide-react"
import { PriorityBadge, type Priority } from "@/components/ui"

interface CaseListRowProps {
  testCase: TestCase
  index: number
  isSelected: boolean
  showSuiteColumn: boolean
  suites: Suite[]
  onToggleSelect: (index: number, shiftKey: boolean) => void
  onOpen: (id: string) => void
}

function findSuiteName(suites: Suite[], suiteId: string): string | null {
  for (const s of suites) {
    if (s.id === suiteId) return s.name
    const child = findSuiteName(s.children, suiteId)
    if (child) return child
  }
  return null
}

export function CaseListRow({ testCase, index, isSelected, showSuiteColumn, suites, onToggleSelect, onOpen }: CaseListRowProps) {
  const { canEdit } = useUserRole()
  const priority = testCase.priority as Priority

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: testCase.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr
      ref={setNodeRef}
      style={{ ...style, borderRadius: 8 }}
      className={clsx(
        "group cursor-pointer transition-colors",
        isDragging ? "opacity-50 bg-primary/5" : isSelected ? "bg-primary-selected" : "bg-gray-50 hover:bg-gray-100"
      )}
      onClick={(e) => {
        // Only open panel if clicking the row itself, not the checkbox or drag handle
        const target = e.target as HTMLElement
        if (target.closest("td:first-child") || target.closest("td:nth-child(2)")) return
        onOpen(testCase.id)
      }}
    >
      {/* Drag handle — listeners spread here only, NOT on the whole row */}
      <td className="w-8 px-2 py-2.5">
        {canEdit && (
          <span
            {...attributes}
            {...listeners}
            className="flex cursor-grab items-center justify-center rounded text-gray-400 hover:text-gray-600 select-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Drag to reorder"
          >
            <GripVertical size={14} aria-hidden="true" />
          </span>
        )}
      </td>

      {/* Checkbox */}
      <td className="w-8 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(index, e.nativeEvent instanceof MouseEvent ? (e.nativeEvent as MouseEvent).shiftKey : false)}
          className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
          aria-label={`Select ${testCase.title}`}
        />
      </td>

      {/* Title — a real button so the case opens from the keyboard (Enter/Space),
          not just a row click. stopPropagation avoids a double-open via the tr. */}
      <td className="py-2.5 pr-4">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(testCase.id) }}
          className="rounded text-left text-sm text-gray-900 group-hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {testCase.title}
        </button>
      </td>

      {/* Suite (only in All Cases view) */}
      {showSuiteColumn && (
        <td className="py-2.5 pr-4 text-sm text-gray-500">
          {testCase.suite_id ? (findSuiteName(suites, testCase.suite_id) ?? "—") : "—"}
        </td>
      )}

      {/* Priority */}
      <td className="py-2.5 pr-4">
        <PriorityBadge priority={priority} />
      </td>

      {/* Steps count */}
      <td className="py-2.5 pr-4 text-sm text-gray-500">
        {testCase.step_count === 1 ? "1 step" : `${testCase.step_count} steps`}
      </td>
    </tr>
  )
}
