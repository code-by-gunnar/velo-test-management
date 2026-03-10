import React, { useState, useEffect } from "react"
import { StatusBadge } from "@/components/ui/status-badge"
import type { TestStatus } from "@/components/ui/status-badge"

interface HistoryEntry {
  run_item_id: string
  status: string
  comment: string | null
  executed_at: string | null
  run_id: string
  run_name: string
  executed_by_name: string | null
}

interface ExecutionHistoryProps {
  caseId: string
  workspaceId: string
}

const MAX_VISIBLE = 10

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

const VALID_STATUSES = new Set<TestStatus>(["pass", "fail", "blocked", "skipped", "untested"])

function toStatus(s: string): TestStatus {
  return VALID_STATUSES.has(s as TestStatus) ? (s as TestStatus) : "untested"
}

export function ExecutionHistory({ caseId, workspaceId }: ExecutionHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!caseId || !workspaceId) return
    setLoading(true)
    setEntries([])
    fetch(`/api/backend/workspaces/${workspaceId}/test-cases/${caseId}/history`)
      .then((res) => {
        if (!res.ok) throw new Error(`History fetch failed: ${res.status}`)
        return res.json() as Promise<HistoryEntry[]>
      })
      .then((data) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [caseId, workspaceId])

  const visible = showAll ? entries : entries.slice(0, MAX_VISIBLE)

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-lg"
      >
        <span className="text-sm font-medium text-gray-700">
          Execution History
          {entries.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">({entries.length})</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {loading && (
            <p className="text-xs text-gray-400 py-2">Loading history…</p>
          )}

          {!loading && entries.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No previous executions for this case.</p>
          )}

          {!loading && entries.length > 0 && (
            <>
              <ul className="space-y-2">
                {visible.map((entry) => (
                  <li key={entry.run_item_id} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <StatusBadge status={toStatus(entry.status)} className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{entry.run_name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{formatDate(entry.executed_at)}</span>
                        {entry.executed_by_name && (
                          <>
                            <span>·</span>
                            <span>{entry.executed_by_name}</span>
                          </>
                        )}
                      </div>
                      {entry.comment && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate italic">{entry.comment}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {entries.length > MAX_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 text-xs text-cobalt hover:underline"
                >
                  {showAll ? "Show less" : `Show all ${entries.length} results`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
