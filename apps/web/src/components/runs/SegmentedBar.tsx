import { cva, type VariantProps } from "class-variance-authority"
import { clsx } from "clsx"

const barContainer = cva("relative flex w-full overflow-hidden rounded-full", {
  variants: {
    height: {
      default: "h-2",
      compact: "h-1.5",
    },
  },
  defaultVariants: {
    height: "default",
  },
})

interface SegmentedBarProps extends VariantProps<typeof barContainer> {
  pass: number
  fail: number
  blocked: number
  skipped: number
  untested: number
  total: number
  className?: string
}

/** Minimum pixel width for a visible segment (prevents invisible slivers). */
const MIN_WIDTH_PX = 2

export function SegmentedBar({
  pass,
  fail,
  blocked,
  skipped,
  untested,
  total,
  height,
  className,
}: SegmentedBarProps) {
  if (total === 0) {
    return (
      <div className={clsx(barContainer({ height }), "bg-gray-200", className)} />
    )
  }

  // Compute percentage widths. For each non-zero segment, enforce a minimum
  // visible width of MIN_WIDTH_PX by converting to a style-based width string.
  const segments = [
    { count: pass,     color: "bg-pass" },
    { count: fail,     color: "bg-fail" },
    { count: blocked,  color: "bg-blocked" },
    { count: skipped,  color: "bg-gray-400" },
    { count: untested, color: "bg-gray-200" },
  ]

  return (
    <div className={clsx(barContainer({ height }), "bg-gray-200", className)}>
      {segments.map(({ count, color }, i) => {
        if (count === 0) return null
        const pct = (count / total) * 100
        return (
          <div
            key={i}
            className={clsx(color)}
            style={{
              width: `max(${pct.toFixed(2)}%, ${MIN_WIDTH_PX}px)`,
              minWidth: `${MIN_WIDTH_PX}px`,
            }}
          />
        )
      })}
    </div>
  )
}
