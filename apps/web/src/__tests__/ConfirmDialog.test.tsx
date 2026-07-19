/**
 * ConfirmDialog — small modal confirm for high-stakes / cramped destructive
 * actions (where an inline confirm doesn't fit).
 */

import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

describe("ConfirmDialog", () => {
  it("renders title + message and fires confirm/close", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        isOpen
        title="Delete suites?"
        message="Deletes the 2 selected suites and moves their cases to All Cases. Can't be undone."
        confirmLabel="Delete 2"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    )

    expect(screen.getByText(/moves their cases to all cases/i)).toBeDefined()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /delete 2/i }))
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /cancel/i }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog isOpen={false} title="x" confirmLabel="Delete" onConfirm={vi.fn()} onClose={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })
})
