import { describe, it, expect, beforeEach, vi } from "vitest"
import { notifyRecycleBinChanged, RECYCLE_BIN_CHANGED_EVENT } from "@/lib/recycle-bin-events"

describe("notifyRecycleBinChanged", () => {
  beforeEach(() => sessionStorage.clear())

  it("clears the bin list snapshot so the next visit fetches fresh, keeps the count cache, and dispatches the event", () => {
    sessionStorage.setItem("velo:recycle-bin:proj1", JSON.stringify([{ id: "x" }]))
    sessionStorage.setItem("velo:recycle-bin-count:proj1", "3")
    sessionStorage.setItem("velo:projects:ws1", "keep")
    const spy = vi.spyOn(window, "dispatchEvent")

    notifyRecycleBinChanged()

    // Stale list snapshot dropped …
    expect(sessionStorage.getItem("velo:recycle-bin:proj1")).toBeNull()
    // … but the count cache (different prefix) and unrelated caches survive.
    expect(sessionStorage.getItem("velo:recycle-bin-count:proj1")).toBe("3")
    expect(sessionStorage.getItem("velo:projects:ws1")).toBe("keep")
    expect(spy.mock.calls.some((c) => (c[0] as Event).type === RECYCLE_BIN_CHANGED_EVENT)).toBe(true)
    spy.mockRestore()
  })
})
