import { clsx } from "clsx"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { TestCase } from "@/hooks/useTestCases"
import type { Suite } from "@/hooks/useSuiteTree"
import { useUserRole } from "@/hooks/useUserRole"

type Priority = "critical" | "high" | "medium" | "low"

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  critical: {
    label: "Critical",
    className: "bg-fail-bg text-fail-text border-fail/20",
  },
  high: {
    label: "High",
    className: "bg-blocked-bg text-blocked-text border-blocked/20",
  },
  medium: {
    label: "Medium",
    className: "bg-cobalt/5 text-cobalt border-cobalt/20",
  },
  low: {
    label: "Low",
    className: "bg-gray-50 text-gray-500 border-gray-200",
  },
}

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
  const priorityCfg = PRIORITY_CONFIG[priority]

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
      style={style}
      className={clsx(
        "group cursor-pointer border-b border-gray-100 transition-colors",
        isDragging ? "opacity-50 bg-cobalt/5" : isSelected ? "bg-cobalt/5" : "hover:bg-gray-50"
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
            className="flex cursor-grab items-center justify-center text-gray-300 hover:text-gray-500 select-none active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            &#8801;
          </span>
        )}
      </td>

      {/* Checkbox */}
      <td className="w-8 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(index, e.nativeEvent instanceof MouseEvent ? (e.nativeEvent as MouseEvent).shiftKey : false)}
          className="h-3.5 w-3.5 rounded border-gray-300 accent-cobalt"
          aria-label={`Select ${testCase.title}`}
        />
      </td>

      {/* Title */}
      <td className="py-2.5 pr-4">
        <span className="text-sm text-gray-900 group-hover:text-cobalt">{testCase.title}</span>
      </td>

      {/* Suite (only in All Cases view) */}
      {showSuiteColumn && (
        <td className="py-2.5 pr-4 text-sm text-gray-500">
          {testCase.suite_id ? (findSuiteName(suites, testCase.suite_id) ?? "—") : "—"}
        </td>
      )}

      {/* Priority */}
      <td className="py-2.5 pr-4">
        <span
          className={clsx(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            priorityCfg.className
          )}
        >
          {priorityCfg.label}
        </span>
      </td>

      {/* Steps count */}
      <td className="py-2.5 pr-4 text-sm text-gray-500">
        {testCase.step_count === 1 ? "1 step" : `${testCase.step_count} steps`}
      </td>
    </tr>
  )
}
