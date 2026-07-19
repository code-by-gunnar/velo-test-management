import { Modal } from "./Modal"
import { Button } from "./button"

/**
 * A small centered confirm modal for destructive actions that don't fit an
 * inline confirm — either because the surface is cramped (e.g. the narrow
 * suites sidebar header) or because the blast radius warrants a deliberate
 * stop (bulk suite delete, VEL-31 purge). Inline `ConfirmInline` is still the
 * default where there's room; reach for this only when there isn't.
 *
 * Built on the `Modal` primitive so it inherits focus-trap, Escape, scroll-lock,
 * and focus-restore for free.
 */
interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message?: string
  confirmLabel: string
  busyLabel?: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  busyLabel = "Working…",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm text-gray-700">{message}</p>}
    </Modal>
  )
}
