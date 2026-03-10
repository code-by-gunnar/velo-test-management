import { clsx } from "clsx"
import { SegmentedBar } from "./SegmentedBar"
import type { RunStats } from "@/hooks/useRunSSE"

export interface RunListItem {
  id: string
  name: string
  status: string
  assigned_to: string | null
  assigned_to_name: string | null
  created_by_name: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  total_items: number
  pass_count: number
  fail_count: number
  blocked_count: number
  skipped_count: number
  untested_count: number
}

interface RunCardProps {
  run: RunListItem
  onClick: (runId: string) => void
  liveStats?: RunStats
}

const RUN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-cobalt/10 text-cobalt border-cobalt/20",
  },
  completed: {
    label: "Completed",
    className: "bg-pass-bg text-pass-text border-pass/20",
  },
  aborted: {
    label: "Aborted",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function RunCard({ run, onClick, liveStats }: RunCardProps) {
  const stats = liveStats ?? {
    pass: run.pass_count,
    fail: run.fail_count,
    blocked: run.blocked_count,
    skipped: run.skipped_count,
    untested: run.untested_count,
    total: run.total_items,
  }

  const passRate = stats.total > 0
    ? Math.round(((stats.pass) / stats.total) * 100)
    : 0

  const statusConfig = RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.aborted!
  const isActive = run.status === "active"
  const completed = stats.total > 0
    ? stats.total - stats.untested
    : 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(run.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(run.id)
      }}
      className={clsx(
        "flex cursor-pointer flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm",
        "transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2",
        isActive
          ? "border-cobalt/30 ring-1 ring-cobalt/20 animate-pulse-border"
          : "border-gray-200"
      )}
    >
      {/* Header: name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex-1 truncate text-sm font-semibold text-gray-900">
          {run.name}
        </h3>
        <span
          className={clsx(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            statusConfig.className
          )}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* Progress bar */}
      <SegmentedBar
        pass={stats.pass}
        fail={stats.fail}
        blocked={stats.blocked}
        skipped={stats.skipped}
        untested={stats.untested}
        total={stats.total}
      />

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium">
          {passRate}% pass
        </span>
        <span>
          {completed}/{stats.total} done
        </span>
      </div>

      {/* Footer: assignee + time */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        {run.assigned_to_name ? (
          <span className="truncate">
            Assigned to {run.assigned_to_name}
          </span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className="shrink-0 ml-2">{formatRelative(run.created_at)}</span>
      </div>
    </div>
  )
}
