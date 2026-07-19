import { clsx } from "clsx"

export type Priority = "critical" | "high" | "medium" | "low"

/**
 * Priority (severity) is a different semantic axis from run status. Run-status
 * badges (StatusBadge) are filled color pills — a red "Fail", an amber
 * "Blocked". If priority reused that treatment, a red "Critical" pill would
 * read as a failed run when a tester scans the list. So priority is a neutral
 * chip carrying a small leading severity dot: the colour lives in the dot, the
 * chip stays neutral, and the label always names the level (never colour alone).
 */
const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string }> = {
  critical: { label: "Critical", dot: "bg-fail" },
  high:     { label: "High",     dot: "bg-blocked" },
  medium:   { label: "Medium",   dot: "bg-primary" },
  low:      { label: "Low",      dot: "bg-gray-400" },
}

interface PriorityBadgeProps {
  priority: Priority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority]
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700",
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  )
}
