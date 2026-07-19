/**
 * SuiteTreeItem keyboard-access test (P1 a11y).
 *
 * Rename/Delete were reachable only via right-click (onContextMenu), so
 * keyboard and screen-reader users could not manage suites at all. There must
 * be a focusable button that opens the same actions menu.
 */

import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import { ToastProvider } from "@/components/ui/toast"
import { SuiteTreeItem } from "@/components/cases/SuiteTreeItem"
import type { Suite } from "@/hooks/useSuiteTree"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

const SUITE: Suite = {
  id: "s1", parent_id: null, name: "Auth", description: null,
  position: 1000, depth: 0, children: [],
}

function renderItem() {
  render(
    <ToastProvider>
      <DndContext>
        <SortableContext items={["s1"]}>
          <SuiteTreeItem
            suite={SUITE}
            selected={null}
            onSelect={vi.fn()}
            workspaceId="w"
            projectId="p"
          />
        </SortableContext>
      </DndContext>
    </ToastProvider>
  )
}

describe("SuiteTreeItem — keyboard-accessible actions", () => {
  it("exposes a focusable actions button that opens Rename/Delete", async () => {
    const user = userEvent.setup()
    renderItem()

    const actions = screen.getByRole("button", { name: /suite actions/i })
    // It must be focusable (a real keyboard path, not right-click only)
    act(() => actions.focus())
    expect(document.activeElement).toBe(actions)

    await act(async () => {
      await user.click(actions)
    })

    expect(screen.getByRole("menuitem", { name: /rename/i })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeDefined()
  })
})
