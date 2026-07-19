/**
 * ConfirmInline — the single destructive-confirm affordance.
 */

import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ConfirmInline } from "@/components/ui/confirm-inline"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

describe("ConfirmInline", () => {
  it("Confirm fires onConfirm, Cancel fires onCancel", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmInline confirmLabel="Delete 3" onConfirm={onConfirm} onCancel={onCancel} message="This can't be undone." />
    )

    expect(screen.getByText(/can't be undone/i)).toBeDefined()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /delete 3/i }))
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /cancel/i }))
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("busy state shows the busy label and blocks both actions", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmInline confirmLabel="Delete" busyLabel="Deleting…" busy onConfirm={onConfirm} onCancel={onCancel} />
    )

    expect(screen.getByText("Deleting…")).toBeDefined()
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /deleting/i }))
      await user.click(screen.getByRole("button", { name: /cancel/i }))
    })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
