import { clsx } from "clsx"

export type TestStatus = "pass" | "fail" | "blocked" | "skipped" | "untested"

interface StatusBadgeProps {
  status: TestStatus
  className?: string
}

const STATUS_CONFIG: Record<TestStatus, { label: string; className: string }> = {
  pass: {
    label: "Pass",
    className: "bg-pass-bg text-pass-text border-pass/20",
  },
  fail: {
    label: "Fail",
    className: "bg-fail-bg text-fail-text border-fail/20",
  },
  blocked: {
    label: "Blocked",
    className: "bg-blocked-bg text-blocked-text border-blocked/20",
  },
  skipped: {
    label: "Skipped",
    className: "bg-skipped-bg text-skipped-text border-skipped/20",
  },
  untested: {
    label: "Untested",
    className: "bg-gray-50 text-gray-500 border-gray-200",
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
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
