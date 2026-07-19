/**
 * BulkActionBar destructive-confirm tests (P1b).
 *
 * A bulk delete destroys an arbitrary multi-selection irreversibly, so it must
 * be gated behind an explicit confirm — mirroring the SuiteTree "Delete N →
 * Confirm / No" pattern. These tests assert the gate:
 * - Clicking "Delete N" does NOT call onDelete; it reveals a Confirm control.
 * - "Confirm" calls onDelete exactly once.
 * - "Cancel" dismisses the confirm without calling onDelete.
 */

import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { BulkActionBar } from "@/components/cases/BulkActionBar"
import type { Suite } from "@/hooks/useSuiteTree"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

const noopSuites: Suite[] = []

function setup(overrides?: { onDelete?: () => Promise<void> }) {
  const onDelete = overrides?.onDelete ?? vi.fn(async () => {})
  const onMove = vi.fn(async () => {})
  const onCopy = vi.fn(async () => {})
  const onClearSelection = vi.fn()
  render(
    <BulkActionBar
      selectedCount={3}
      suites={noopSuites}
      onMove={onMove}
      onCopy={onCopy}
      onDelete={onDelete}
      onClearSelection={onClearSelection}
    />
  )
  return { onDelete }
}

const SUITES: Suite[] = [
  { id: "a", parent_id: null, name: "Auth", description: null, position: 1, depth: 0, children: [] },
  { id: "b", parent_id: null, name: "Billing", description: null, position: 2, depth: 0, children: [] },
  { id: "c", parent_id: null, name: "Dashboard", description: null, position: 3, depth: 0, children: [] },
]

describe("BulkActionBar — suite picker search", () => {
  it("filters the Move-to suite list by the search query", async () => {
    const user = userEvent.setup()
    render(
      <BulkActionBar
        selectedCount={2}
        suites={SUITES}
        onMove={vi.fn(async () => {})}
        onCopy={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onClearSelection={vi.fn()}
      />
    )

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /move to/i }))
    })
    // All suites visible before filtering
    expect(screen.getByRole("button", { name: "Billing" })).toBeDefined()

    await act(async () => {
      await user.type(screen.getByRole("textbox", { name: /search suites/i }), "auth")
    })

    expect(screen.getByRole("button", { name: "Auth" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Billing" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Dashboard" })).toBeNull()
  })
})

describe("BulkActionBar — destructive confirmation", () => {
  it("clicking the initial Delete button does not delete; it reveals a confirm affordance", async () => {
    const user = userEvent.setup()
    const { onDelete } = setup()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /delete 3/i }))
    })

    // onDelete must NOT have fired on the first click
    expect(onDelete).not.toHaveBeenCalled()
    // The confirm step is now visible (irreversibility note + a Cancel)
    expect(screen.getByText(/can't be undone/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined()
  })

  it("confirming calls onDelete exactly once", async () => {
    const user = userEvent.setup()
    const { onDelete } = setup()

    // First "Delete 3" = trigger; after it, the only "Delete 3" is the confirm.
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /delete 3/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /delete 3/i }))
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("Cancel dismisses the confirm without deleting", async () => {
    const user = userEvent.setup()
    const { onDelete } = setup()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /delete 3/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /cancel/i }))
    })

    expect(onDelete).not.toHaveBeenCalled()
    // Back to the initial trigger, confirm affordance gone
    expect(screen.getByRole("button", { name: /delete 3/i })).toBeDefined()
    expect(screen.queryByText(/can't be undone/i)).toBeNull()
  })
})
