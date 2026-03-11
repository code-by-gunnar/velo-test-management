import { clsx } from "clsx"

export type Priority = "high" | "medium" | "low"

interface PriorityBadgeProps {
  priority: Priority
  className?: string
}

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  high: {
    label: "High",
    className: "bg-primary text-white border-primary",
  },
  medium: {
    label: "Medium",
    className: "bg-primary-selected text-primary border-primary",
  },
  low: {
    label: "Low",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority]
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
