import { useState, useRef } from "react"
import { clsx } from "clsx"
import type { Suite } from "@/hooks/useSuiteTree"
import { SuiteTreeItem } from "./SuiteTreeItem"

interface SuiteTreeProps {
  tree: Suite[]
  selected: string | null
  onSelect: (id: string | null) => void
  workspaceId: string
  projectId: string
  onSuiteCreated?: () => void
}

export function SuiteTree({ tree, selected, onSelect, workspaceId, projectId, onSuiteCreated }: SuiteTreeProps) {
  const [creating, setCreating] = useState(false)
  const [newSuiteName, setNewSuiteName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const startCreate = () => {
    setCreating(true)
    setNewSuiteName("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelCreate = () => {
    setCreating(false)
    setNewSuiteName("")
  }

  const confirmCreate = async () => {
    const name = newSuiteName.trim()
    if (!name) {
      cancelCreate()
      return
    }
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${projectId}/suites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent_id: null }),
      })
      if (res.ok) {
        onSuiteCreated?.()
      }
    } finally {
      cancelCreate()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void confirmCreate()
    } else if (e.key === "Escape") {
      cancelCreate()
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      onKeyDown={(e) => {
        // N key when tree is focused (not in input) starts create
        if (e.key === "n" && !creating && (e.target as HTMLElement).tagName !== "INPUT") {
          startCreate()
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suites</span>
        <button
          type="button"
          onClick={startCreate}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-sm"
          title="New suite"
          aria-label="New suite"
        >
          +
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1">
        {/* All Cases root */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={clsx(
            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-left transition-colors",
            selected === null
              ? "bg-cobalt/10 text-cobalt font-medium"
              : "text-gray-700 hover:bg-gray-100"
          )}
        >
          <span className="text-gray-400">◈</span>
          <span>All Cases</span>
        </button>

        {/* Suite nodes */}
        {tree.map((suite) => (
          <SuiteTreeItem
            key={suite.id}
            suite={suite}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* New suite inline input */}
      {creating && (
        <div className="border-t border-gray-100 px-2 py-1.5">
          <input
            ref={inputRef}
            type="text"
            value={newSuiteName}
            onChange={(e) => setNewSuiteName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={cancelCreate}
            placeholder="Suite name…"
            className="w-full rounded border border-cobalt px-2 py-0.5 text-sm focus:outline-none"
          />
        </div>
      )}

      {/* New suite button */}
      {!creating && (
        <div className="border-t border-gray-100 px-2 py-1.5">
          <button
            type="button"
            onClick={startCreate}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <span>+</span>
            <span>New suite</span>
          </button>
        </div>
      )}
    </div>
  )
}
