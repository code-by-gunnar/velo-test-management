/**
 * CaseListRow keyboard-open test (P1 a11y).
 *
 * Opening a case was mouse-only (row onClick + a plain <span> title), so a
 * keyboard/SR user could select, drag, and delete a case but never open one to
 * read or edit it (WCAG 2.1.1, Level A). The title must be a focusable control
 * that opens the editor on Enter — and must open exactly once (no double-fire
 * from the row's own click handler).
 */

import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ToastProvider } from "@/components/ui/toast"
import { CaseList } from "@/components/cases/CaseList"
import type { TestCase } from "@/hooks/useTestCases"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

const CASES: TestCase[] = [
  { id: "c1", suite_id: null, title: "Login works", preconditions: null, priority: "high", position: 1000, step_count: 2 },
]

function renderList(onOpenCase = vi.fn()) {
  render(
    <ToastProvider>
      <CaseList
        cases={CASES}
        isLoading={false}
        selectedSuite={null}
        suites={[]}
        workspaceId="w"
        projectId="p"
        onNewCase={vi.fn()}
        onImport={vi.fn()}
        onOpenCase={onOpenCase}
        onCasesChange={vi.fn()}
        refetch={vi.fn()}
      />
    </ToastProvider>
  )
  return { onOpenCase }
}

describe("CaseListRow — keyboard open", () => {
  it("the case title is a focusable button that opens the editor on Enter (exactly once)", async () => {
    const user = userEvent.setup()
    const { onOpenCase } = renderList()

    const title = screen.getByRole("button", { name: "Login works" })
    act(() => title.focus())
    expect(document.activeElement).toBe(title)

    await act(async () => {
      await user.keyboard("{Enter}")
    })

    expect(onOpenCase).toHaveBeenCalledTimes(1)
    expect(onOpenCase).toHaveBeenCalledWith("c1")
  })
})
