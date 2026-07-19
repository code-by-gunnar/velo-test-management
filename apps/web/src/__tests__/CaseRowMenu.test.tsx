/**
 * Per-row case actions (kebab menu) — Move / Copy / Duplicate.
 *
 * These operations already existed behind multi-select; the kebab surfaces them
 * for a single case (which is why users felt they were missing). Exercised
 * end-to-end through CaseList so the wiring — kebab → menu → /cases/bulk — is
 * what's pinned down:
 *   - Duplicate posts action=duplicate with just the row's id (no target).
 *   - Move opens the suite picker and posts action=move with the chosen target.
 *   - A viewer sees no kebab at all (editor-gated).
 */

import { render, screen, act, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, afterEach } from "vitest"
import { ToastProvider } from "@/components/ui/toast"
import { CaseList } from "@/components/cases/CaseList"
import type { TestCase } from "@/hooks/useTestCases"
import type { Suite } from "@/hooks/useSuiteTree"

let role = "editor"
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role } }, status: "authenticated" }),
}))

const CASES: TestCase[] = [
  { id: "c1", suite_id: null, title: "Login works", preconditions: null, priority: "high", position: 1000, step_count: 2 },
]

const SUITES: Suite[] = [
  { id: "s1", parent_id: null, name: "Regression", description: null, position: 1000, depth: 0, children: [] },
]

function renderList(refetch = vi.fn()) {
  render(
    <ToastProvider>
      <CaseList
        cases={CASES}
        isLoading={false}
        selectedSuite={null}
        suites={SUITES}
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

function lastBulkCall(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(
    (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/cases/bulk")
  ) as unknown as [string, RequestInit]
  return JSON.parse(call[1].body as string) as { action: string; case_ids: string[]; target_suite_id?: string | null }
}

describe("CaseRowMenu — per-row actions", () => {
  afterEach(() => {
    role = "editor"
    vi.unstubAllGlobals()
  })

  it("Duplicate posts action=duplicate for just that row's id", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ created: 1 }) }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderList()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /case actions for login works/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("menuitem", { name: /duplicate/i }))
    })

    const body = lastBulkCall(fetchMock)
    expect(body.action).toBe("duplicate")
    expect(body.case_ids).toEqual(["c1"])
    expect(body.target_suite_id).toBeUndefined()
    await waitFor(() => expect(screen.getByText(/duplicated 1 case/i)).toBeDefined())
  })

  it("Move to… opens the suite picker and posts action=move with the chosen suite", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderList()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /case actions for login works/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("menuitem", { name: /move to/i }))
    })
    // The suite picker replaces the menu items.
    await act(async () => {
      await user.click(await screen.findByRole("button", { name: "Regression" }))
    })

    const body = lastBulkCall(fetchMock)
    expect(body.action).toBe("move")
    expect(body.case_ids).toEqual(["c1"])
    expect(body.target_suite_id).toBe("s1")
  })

  it("Copy to… Root posts action=copy with a null target suite", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ created: 1 }) }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderList()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /case actions for login works/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("menuitem", { name: /copy to/i }))
    })
    await act(async () => {
      await user.click(await screen.findByRole("button", { name: /root \(no suite\)/i }))
    })

    const body = lastBulkCall(fetchMock)
    expect(body.action).toBe("copy")
    expect(body.case_ids).toEqual(["c1"])
    expect(body.target_suite_id).toBeNull()
  })

  it("keeps the menu open when the suite list scrolls, but closes on an outside scroll", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 204 }) as Response))
    const user = userEvent.setup()
    renderList()

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /case actions for login works/i }))
    })
    await act(async () => {
      await user.click(screen.getByRole("menuitem", { name: /move to/i }))
    })
    const search = await screen.findByLabelText("Search suites")

    // Scrolling the picker's own list (target inside the menu) must NOT dismiss it.
    await act(async () => {
      fireEvent.scroll(search)
    })
    expect(screen.getByRole("button", { name: "Regression" })).toBeDefined()

    // Scrolling an ancestor (the table/page) should dismiss it.
    await act(async () => {
      fireEvent.scroll(document.body)
    })
    await waitFor(() => expect(screen.queryByRole("button", { name: "Regression" })).toBeNull())
  })

  it("hides the kebab for viewers (editor-gated)", () => {
    role = "viewer"
    renderList()
    expect(screen.queryByRole("button", { name: /case actions for login works/i })).toBeNull()
  })
})
