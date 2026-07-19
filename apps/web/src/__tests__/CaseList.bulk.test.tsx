/**
 * CaseList bulk-action feedback tests (P1a).
 *
 * The bulk delete/move/copy handlers all POST /cases/bulk. A failed request
 * must surface an error and must NOT clear the selection (so the user can
 * retry), and a successful one confirms with a toast. Exercised end-to-end
 * through the real BulkActionBar confirm gate.
 */

import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, afterEach } from "vitest"
import { ToastProvider } from "@/components/ui/toast"
import { CaseList } from "@/components/cases/CaseList"
import type { TestCase } from "@/hooks/useTestCases"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "editor" } }, status: "authenticated" }),
}))

const CASES: TestCase[] = [
  { id: "c1", suite_id: null, title: "Case one", preconditions: null, priority: "high", position: 1000, step_count: 2 },
  { id: "c2", suite_id: null, title: "Case two", preconditions: null, priority: "low", position: 2000, step_count: 1 },
]

function renderList(refetch = vi.fn()) {
  render(
    <ToastProvider>
      <CaseList
        cases={CASES}
        isLoading={false}
        selectedSuite={null}
        suites={[]}
        workspaceId="ws1"
        projectId="proj1"
        onNewCase={vi.fn()}
        onImport={vi.fn()}
        onOpenCase={vi.fn()}
        onCasesChange={vi.fn()}
        refetch={refetch}
      />
    </ToastProvider>
  )
  return { refetch }
}

async function selectAllThenDelete(user: ReturnType<typeof userEvent.setup>) {
  // The header "select all" checkbox is the first checkbox in the table head.
  const selectAll = screen.getAllByRole("checkbox")[0]!
  await act(async () => {
    await user.click(selectAll)
  })
  // BulkActionBar appears; open the confirm gate (trigger), then confirm.
  await act(async () => {
    await user.click(screen.getByRole("button", { name: /^delete 2$/i }))
  })
  await act(async () => {
    await user.click(screen.getByRole("button", { name: /^delete 2$/i }))
  })
}

describe("CaseList — bulk delete feedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("failed bulk delete shows an error toast and does not refetch", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    const { refetch } = renderList()

    await selectAllThenDelete(user)

    await waitFor(() => {
      expect(screen.getByText(/couldn['’]?t delete/i)).toBeDefined()
    })
    expect(refetch).not.toHaveBeenCalled()
  })

  it("successful bulk delete confirms with a toast and refetches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as Response))
    const user = userEvent.setup()
    const { refetch } = renderList()

    await selectAllThenDelete(user)

    await waitFor(() => {
      expect(screen.getByText(/deleted 2 cases/i)).toBeDefined()
    })
    expect(refetch).toHaveBeenCalled()
  })

  it("notifies the recycle-bin badge on delete (dispatches velo:recycle-bin-changed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as Response))
    const dispatched = vi.spyOn(window, "dispatchEvent")
    const user = userEvent.setup()
    renderList()

    await selectAllThenDelete(user)

    await waitFor(() =>
      expect(
        dispatched.mock.calls.some((c) => (c[0] as Event).type === "velo:recycle-bin-changed")
      ).toBe(true)
    )
    dispatched.mockRestore()
  })

  it("offers Undo after delete, which restores the deleted cases via the API", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderList()

    await selectAllThenDelete(user)

    const undo = await screen.findByRole("button", { name: "Undo" })
    await act(async () => {
      await user.click(undo)
    })

    // The last request must be a restore carrying exactly the deleted ids.
    const lastCall = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit]
    const body = JSON.parse(lastCall[1].body as string)
    expect(body.action).toBe("restore")
    expect(body.case_ids).toEqual(["c1", "c2"])
    await waitFor(() => expect(screen.getByText(/restored 2 cases/i)).toBeDefined())
  })
})
