/**
 * RecycleBin component tests (VEL-31).
 *
 * The recycle bin lists soft-deleted suites and cases for a project and lets an
 * editor restore them. Restore routes to two different endpoints depending on
 * item type (suites → /suites/bulk-restore with { ids }, cases → /cases/bulk
 * with { action: "restore", case_ids }), so the branching is the thing worth
 * pinning down. A restored row leaves the list and a success toast confirms.
 */

import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, afterEach } from "vitest"
import { ToastProvider } from "@/components/ui/toast"
import { RecycleBin } from "@/components/recycle-bin/RecycleBin"

const DATA = {
  suites: [{ id: "s1", name: "Login suite", deleted_at: "2026-07-18T10:00:00Z", deleted_by_name: "Ada Lovelace" }],
  cases: [{ id: "c1", title: "Password reset", deleted_at: "2026-07-18T11:00:00Z", deleted_by_name: null, restores_to_root: true }],
  runs: [{ id: "r1", name: "Smoke run", deleted_at: "2026-07-18T12:00:00Z", deleted_by_name: "Ada Lovelace" }],
}

// Stateful fetch stub: GET returns the current server view; a successful
// restore/purge removes the affected ids so the post-mutation refetch reflects
// it (the component refetches to resync cross-item effects).
function stubFetch(over?: { post?: () => Response }) {
  const state = { suites: [...DATA.suites], cases: [...DATA.cases], runs: [...DATA.runs] }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === "GET") {
      return { ok: true, status: 200, json: async () => state } as Response
    }
    if (over?.post) return over.post()
    try {
      const body = JSON.parse(init.body as string) as { ids?: string[]; case_ids?: string[] }
      const idset = new Set(body.case_ids ?? body.ids ?? [])
      if (url.includes("/cases/")) state.cases = state.cases.filter((c) => !idset.has(c.id))
      else if (url.includes("/suites/")) state.suites = state.suites.filter((s) => !idset.has(s.id))
      else if (url.includes("/runs/")) state.runs = state.runs.filter((r) => !idset.has(r.id))
    } catch {
      // non-JSON body — ignore
    }
    return { ok: true, status: 200 } as Response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderBin() {
  render(
    <ToastProvider>
      <RecycleBin workspaceId="ws1" projectId="proj1" />
    </ToastProvider>
  )
}

describe("RecycleBin", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists deleted suites and cases", async () => {
    stubFetch()
    renderBin()
    expect(await screen.findByText("Login suite")).toBeDefined()
    expect(screen.getByText("Password reset")).toBeDefined()
  })

  it("flags a case that will restore to root (its suite is also deleted)", async () => {
    stubFetch()
    renderBin()
    expect(await screen.findByText(/restores to root/i)).toBeDefined()
  })

  it("attributes an item to whoever deleted it", async () => {
    stubFetch()
    renderBin()
    // Suite + run were deleted by a known user → both show "by Ada Lovelace";
    // the case's deleter is unknown (null) → no dangling "by" (so exactly 2).
    const attributed = await screen.findAllByText(/by Ada Lovelace/i)
    expect(attributed).toHaveLength(2)
  })

  it("shows an empty state when nothing is deleted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ suites: [], cases: [] }) }) as Response)
    )
    renderBin()
    expect(await screen.findByText(/recycle bin is empty/i)).toBeDefined()
  })

  it("restores a case via /cases/bulk with action=restore and removes the row", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const restoreCase = await screen.findByRole("button", { name: /restore password reset/i })
    await act(async () => {
      await user.click(restoreCase)
    })

    const call = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/cases/bulk")
    ) as unknown as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body.action).toBe("restore")
    expect(body.case_ids).toEqual(["c1"])
    await waitFor(() => expect(screen.queryByText("Password reset")).toBeNull())
  })

  it("restores a suite via /suites/bulk-restore with its id", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const restoreSuite = await screen.findByRole("button", { name: /restore login suite/i })
    await act(async () => {
      await user.click(restoreSuite)
    })

    const call = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/suites/bulk-restore")
    ) as unknown as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body.ids).toEqual(["s1"])
  })

  it("purges a case via /cases/bulk action=purge after confirming, then removes the row", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const purgeCase = await screen.findByRole("button", { name: /delete password reset permanently/i })
    await act(async () => {
      await user.click(purgeCase)
    })
    // A confirm dialog stands between the click and the destructive call.
    const confirm = await screen.findByRole("button", { name: /^delete permanently$/i })
    await act(async () => {
      await user.click(confirm)
    })

    const call = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/cases/bulk")
    ) as unknown as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body.action).toBe("purge")
    expect(body.case_ids).toEqual(["c1"])
    await waitFor(() => expect(screen.queryByText("Password reset")).toBeNull())
  })

  it("purges a suite via /suites/bulk-purge after confirming", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const purgeSuite = await screen.findByRole("button", { name: /delete login suite permanently/i })
    await act(async () => {
      await user.click(purgeSuite)
    })
    const confirm = await screen.findByRole("button", { name: /^delete permanently$/i })
    await act(async () => {
      await user.click(confirm)
    })

    const call = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/suites/bulk-purge")
    ) as unknown as [string, RequestInit]
    const body = JSON.parse(call[1].body as string)
    expect(body.ids).toEqual(["s1"])
  })

  it("does not purge when the confirm dialog is cancelled", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const purgeCase = await screen.findByRole("button", { name: /delete password reset permanently/i })
    await act(async () => {
      await user.click(purgeCase)
    })
    const cancel = await screen.findByRole("button", { name: /^cancel$/i })
    await act(async () => {
      await user.click(cancel)
    })
    expect(
      fetchMock.mock.calls.some((c) => typeof c[0] === "string" && (c[0] as string).endsWith("/cases/bulk"))
    ).toBe(false)
    expect(screen.getByText("Password reset")).toBeDefined()
  })

  it("restores a run via the workspace-scoped /runs/bulk-restore", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const restoreRun = await screen.findByRole("button", { name: /restore smoke run/i })
    await act(async () => {
      await user.click(restoreRun)
    })

    const call = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/runs/bulk-restore")
    ) as unknown as [string, RequestInit]
    expect(call[0]).toContain("/workspaces/ws1/runs/bulk-restore")
    expect(JSON.parse(call[1].body as string).ids).toEqual(["r1"])
  })

  it("purges a run via /runs/bulk-purge after confirming", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    renderBin()
    const purgeRun = await screen.findByRole("button", { name: /delete smoke run permanently/i })
    await act(async () => {
      await user.click(purgeRun)
    })
    const confirm = await screen.findByRole("button", { name: /^delete permanently$/i })
    await act(async () => {
      await user.click(confirm)
    })

    const call = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/runs/bulk-purge")
    ) as unknown as [string, RequestInit]
    expect(JSON.parse(call[1].body as string).ids).toEqual(["r1"])
  })

  it("keeps the row and shows an error toast when restore fails", async () => {
    stubFetch({ post: () => ({ ok: false, status: 500 }) as Response })
    const user = userEvent.setup()
    renderBin()
    const restoreCase = await screen.findByRole("button", { name: /restore password reset/i })
    await act(async () => {
      await user.click(restoreCase)
    })
    await waitFor(() => expect(screen.getByText(/couldn['’]?t restore/i)).toBeDefined())
    expect(screen.getByText("Password reset")).toBeDefined()
  })
})
