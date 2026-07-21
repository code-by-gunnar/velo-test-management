import { describe, it, expect, vi } from "vitest"
import type { Redis } from "iovalkey"
import { reportsCacheKey, invalidateReportsCache } from "../reports-cache.js"

// VEL-75: the reports payload is cached in Valkey for 60s; every result-changing
// mutation must bust `reports:{ws}:{proj}` so a refresh is immediately fresh.

describe("reportsCacheKey", () => {
  it("builds the per-project key", () => {
    expect(reportsCacheKey("ws1", "proj1")).toBe("reports:ws1:proj1")
  })
})

describe("invalidateReportsCache", () => {
  it("deletes the project's reports key", async () => {
    const del = vi.fn().mockResolvedValue(1)
    await invalidateReportsCache({ del } as unknown as Redis, "ws1", "proj1")
    expect(del).toHaveBeenCalledWith("reports:ws1:proj1")
  })

  it("no-ops when valkey is undefined (unit app without the decorator)", async () => {
    await expect(invalidateReportsCache(undefined, "ws1", "proj1")).resolves.toBeUndefined()
  })

  it("swallows a Valkey error (best-effort — must not fail the mutation)", async () => {
    const del = vi.fn().mockRejectedValue(new Error("valkey down"))
    await expect(
      invalidateReportsCache({ del } as unknown as Redis, "ws1", "proj1")
    ).resolves.toBeUndefined()
  })
})
