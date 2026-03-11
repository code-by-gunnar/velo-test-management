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

export function RunFilters({ filters, onChange, assignees }: RunFiltersProps) {
  return (
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
          "rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
          filters.status ? "border-primary bg-primary/5 font-medium text-primary" : "border-gray-200 bg-white text-gray-700"
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
            "rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
            filters.assigned_to ? "border-primary bg-primary/5 font-medium text-primary" : "border-gray-200 bg-white text-gray-700"
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
    </div>
  )
}
