import { describe, it, expect, beforeAll, afterAll } from "vitest"

// valkey.ts throws at import if VALKEY_URL is unset — provide the same default the suite uses.
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

const { valkey, scanKeys } = await import("../valkey.js")

describe("scanKeys", () => {
  const prefix = `scan-test:${Date.now()}:`
  const keys = [`${prefix}a`, `${prefix}b`, `${prefix}c`]

  beforeAll(async () => {
    await Promise.all(keys.map((k) => valkey.set(k, "1")))
  })

  afterAll(async () => {
    await valkey.del(...keys)
  })

  it("returns every key matching the pattern (non-blocking SCAN, not KEYS)", async () => {
    const found = await scanKeys(valkey, `${prefix}*`)
    expect(found.sort()).toEqual([...keys].sort())
  })

  it("returns an empty array when nothing matches", async () => {
    const found = await scanKeys(valkey, `no-such-prefix:${Date.now()}:*`)
    expect(found).toEqual([])
  })
})
