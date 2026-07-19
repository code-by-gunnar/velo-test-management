import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useRecycleBinCount } from "@/hooks/useRecycleBinCount"

function Probe() {
  const n = useRecycleBinCount("ws1", "PK")
  return <span>count:{n}</span>
}

describe("useRecycleBinCount", () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it("renders the cached count synchronously on mount (no flash to zero)", () => {
    sessionStorage.setItem("velo:recycle-bin-count:PK", "5")
    // A fetch that never resolves — the first render must already show 5 from cache.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})))
    render(<Probe />)
    expect(screen.getByText("count:5")).toBeDefined()
  })

  it("refreshes from the API and includes runs in the count", async () => {
    sessionStorage.setItem("velo:projects:ws1", JSON.stringify([{ id: "p1", project_key: "PK" }]))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ suites: [{}], cases: [{}, {}], runs: [{}] }),
      }) as Response)
    )
    render(<Probe />)
    await waitFor(() => expect(screen.getByText("count:4")).toBeDefined())
    expect(sessionStorage.getItem("velo:recycle-bin-count:PK")).toBe("4")
  })
})
