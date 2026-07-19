import { clsx } from "clsx"
import { Button } from "./button"

/**
 * The single destructive-confirm affordance for the whole app. Before this,
 * bulk-case / suite-bulk / single-suite delete each hand-rolled a different
 * confirm treatment (destructive button vs. gray text links vs. bordered card).
 * One component, one visual language: a destructive Confirm + a gray-600 Cancel,
 * with an optional consequence/irreversibility message.
 *
 * - `row` layout: inline next to other controls (action bars, tree headers).
 * - `card` layout: a boxed popover with the message above the buttons.
 */
interface ConfirmInlineProps {
  /** Label on the destructive button, e.g. "Delete 3". */
  confirmLabel: string
  /** Label while the action is in flight, e.g. "Deleting…". */
  busyLabel?: string
  busy?: boolean
  /** Optional consequence / irreversibility note. */
  message?: string
  onConfirm: () => void
  onCancel: () => void
  layout?: "row" | "card"
  className?: string
}

export function ConfirmInline({
  confirmLabel,
  busyLabel = "Working…",
  busy = false,
  message,
  onConfirm,
  onCancel,
  layout = "row",
  className,
}: ConfirmInlineProps) {
  const confirm = (
    <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
      {busy ? busyLabel : confirmLabel}
    </Button>
  )
  const cancel = (
    <button
      type="button"
      onClick={onCancel}
      disabled={busy}
      className="rounded text-sm text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
    >
      Cancel
    </button>
  )

  if (layout === "card") {
    return (
      <div className={clsx("rounded-md border border-gray-200 bg-white p-2 shadow-card", className)}>
        {message && <p className="mb-2 text-xs text-gray-600">{message}</p>}
        <div className="flex items-center gap-2">
          {confirm}
          {cancel}
        </div>
      </div>
    )
  }

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      {message && <span className="text-xs text-gray-600">{message}</span>}
      {confirm}
      {cancel}
    </div>
  )
}
