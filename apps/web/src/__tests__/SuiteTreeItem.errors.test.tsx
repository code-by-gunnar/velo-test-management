/**
 * SuiteTreeItem error-feedback test (P1).
 *
 * Suite mutations failed silently while case operations toast on failure — a
 * rejected rename would snap back on refetch with no explanation (reads as data
 * loss). A failed rename must surface an error toast, matching the case path.
 */

import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, afterEach } from "vitest"
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
          <SuiteTreeItem suite={SUITE} selected={null} onSelect={vi.fn()} workspaceId="w" projectId="p" />
        </SortableContext>
      </DndContext>
    </ToastProvider>
  )
}

describe("SuiteTreeItem — rename failure feedback", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("shows an error toast when a rename request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    const user = userEvent.setup()
    renderItem()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /suite actions/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("menuitem", { name: /rename/i }))
    })

    const input = screen.getByRole("textbox")
    await act(async () => {
      await user.type(input, "X")
      await user.keyboard("{Enter}")
    })

    await waitFor(() => {
      expect(screen.getByText(/couldn['’]?t rename/i)).toBeDefined()
    })
  })
})
