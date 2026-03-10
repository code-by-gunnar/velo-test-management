import { clsx } from "clsx"

export interface FilterState {
  status?: string
  assigned_to?: string
}

interface RunFiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  assignees: Array<{ id: string; name: string }>
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "aborted", label: "Aborted" },
]

const ACTIVE_FILTER_LABELS: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  aborted: "Aborted",
}

export function RunFilters({ filters, onChange, assignees }: RunFiltersProps) {
  const activeChips: Array<{ key: keyof FilterState; label: string }> = []

  if (filters.status) {
    activeChips.push({
      key: "status",
      label: `Status: ${ACTIVE_FILTER_LABELS[filters.status] ?? filters.status}`,
    })
  }

  if (filters.assigned_to) {
    const assignee = assignees.find((a) => a.id === filters.assigned_to)
    activeChips.push({
      key: "assigned_to",
      label: `Assignee: ${assignee?.name ?? "Unknown"}`,
    })
  }

  const hasFilters = activeChips.length > 0

  function removeFilter(key: keyof FilterState) {
    const next = { ...filters }
    delete next[key]
    onChange(next)
  }

  function clearAll() {
    onChange({})
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status filter */}
        <select
          value={filters.status ?? ""}
          onChange={(e) => {
            const next: FilterState = { ...filters }
            if (e.target.value) next.status = e.target.value
            else delete next.status
            onChange(next)
          }}
          className={clsx(
            "rounded-md border px-3 py-1.5 text-sm text-gray-700 focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt",
            filters.status ? "border-cobalt bg-cobalt/5 font-medium text-cobalt" : "border-gray-200 bg-white"
          )}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Assignee filter — only shown when assignees are available */}
        {assignees.length > 0 && (
          <select
            value={filters.assigned_to ?? ""}
            onChange={(e) => {
              const next: FilterState = { ...filters }
              if (e.target.value) next.assigned_to = e.target.value
              else delete next.assigned_to
              onChange(next)
            }}
            className={clsx(
              "rounded-md border px-3 py-1.5 text-sm text-gray-700 focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt",
              filters.assigned_to ? "border-cobalt bg-cobalt/5 font-medium text-cobalt" : "border-gray-200 bg-white"
            )}
            aria-label="Filter by assignee"
          >
            <option value="">All Assignees</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        {/* Milestone — placeholder, deferred to v2 */}
        <select
          disabled
          className="cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-300"
          aria-label="Filter by milestone (coming soon)"
        >
          <option>Milestone (v2)</option>
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-gray-400 underline hover:text-gray-600 hover:no-underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full bg-cobalt/10 px-2.5 py-0.5 text-xs font-medium text-cobalt"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => removeFilter(chip.key)}
                className="ml-0.5 rounded-full hover:bg-cobalt/20"
                aria-label={`Remove ${chip.label} filter`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
