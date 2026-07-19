import { useState, useEffect, useRef } from "react"
import type { Suite } from "@/hooks/useSuiteTree"

interface SuitePickerProps {
  suites: Suite[]
  onSelect: (suiteId: string | null) => void
  /**
   * Positioning of the popup box. Defaults to the bulk-action-bar flavour
   * (opens upward, left-aligned). Callers inside a fixed menu pass their own
   * (e.g. "relative") so it flows in the menu instead of floating.
   */
  positionClassName?: string
}

/**
 * Searchable suite tree used by both the multi-select BulkActionBar and the
 * per-row CaseRowMenu. Single source of truth for "pick a target suite".
 */
export function SuitePicker({
  suites,
  onSelect,
  positionClassName = "absolute bottom-full left-0 mb-1",
}: SuitePickerProps) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the search on open so a keyboard user can type immediately.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q ? suites.filter((s) => s.name.toLowerCase().includes(q)) : suites

  return (
    <div className={`${positionClassName} min-w-56 rounded border border-gray-200 bg-white shadow-md`}>
      <div className="border-b border-gray-100 p-1.5">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the only/first match — fast keyboard flow on long trees.
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault()
              onSelect(filtered[0].id)
            }
          }}
          placeholder="Search suites…"
          aria-label="Search suites"
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {/* Root option — only when not actively filtering */}
        {!q && (
          <li>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
              onClick={() => onSelect(null)}
            >
              Root (no suite)
            </button>
          </li>
        )}
        {filtered.map((suite) => (
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
        {q && filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-gray-500">No matching suites</li>
        )}
      </ul>
    </div>
  )
}
