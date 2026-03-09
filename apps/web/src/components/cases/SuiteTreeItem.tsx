import { useState } from "react"
import { clsx } from "clsx"
import type { Suite } from "@/hooks/useSuiteTree"

interface SuiteTreeItemProps {
  suite: Suite
  selected: string | null
  onSelect: (id: string) => void
}

export function SuiteTreeItem({ suite, selected, onSelect }: SuiteTreeItemProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = suite.children.length > 0
  const isSelected = selected === suite.id

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(suite.id)}
        className={clsx(
          "flex w-full items-center gap-1 rounded-md py-1 pr-2 text-sm text-left transition-colors",
          isSelected
            ? "bg-cobalt/10 text-cobalt font-medium"
            : "text-gray-700 hover:bg-gray-100"
        )}
        style={{ paddingLeft: suite.depth * 16 + 8 }}
      >
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
        <span className="truncate">{suite.name}</span>
      </button>

      {hasChildren && expanded && (
        <div>
          {suite.children.map((child) => (
            <SuiteTreeItem
              key={child.id}
              suite={child}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
