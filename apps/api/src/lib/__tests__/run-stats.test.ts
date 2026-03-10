import { describe, it, expect } from "vitest"
import { computeRunStats, estimateTimeRemaining } from "../../lib/run-stats.js"

// DA-02: Stats computation — pass rate, time-to-complete estimate
describe("computeRunStats", () => {
  it("calculates correct pass/fail/blocked/skipped/untested counts", () => {
    const items = [
      { status: "pass" },
      { status: "pass" },
      { status: "pass" },
      { status: "fail" },
      { status: "fail" },
      { status: "blocked" },
      { status: "skipped" },
      { status: "untested" },
      { status: "untested" },
      { status: "untested" },
    ]
    const stats = computeRunStats(items)
    expect(stats.pass).toBe(3)
    expect(stats.fail).toBe(2)
    expect(stats.blocked).toBe(1)
    expect(stats.skipped).toBe(1)
    expect(stats.untested).toBe(3)
    expect(stats.total).toBe(10)
    // executed = 10 - 3 = 7, pass_rate = round(3/7*100) = 43
    expect(stats.pass_rate).toBe(43)
  })

  it("calculates pass rate as pass / (total - untested) * 100", () => {
    const items = [
      { status: "pass" },
      { status: "fail" },
      { status: "untested" },
    ]
    const stats = computeRunStats(items)
    // executed = 2, pass_rate = round(1/2*100) = 50
    expect(stats.pass_rate).toBe(50)
  })

  it("returns 0 pass rate when no items have been executed", () => {
    const items = [
      { status: "untested" },
      { status: "untested" },
    ]
    const stats = computeRunStats(items)
    expect(stats.pass_rate).toBe(0)
    expect(stats.untested).toBe(2)
    expect(stats.total).toBe(2)
  })

  it("returns pass rate of 100 when all items pass", () => {
    const items = [
      { status: "pass" },
      { status: "pass" },
      { status: "pass" },
    ]
    const stats = computeRunStats(items)
    expect(stats.pass_rate).toBe(100)
    expect(stats.pass).toBe(3)
    expect(stats.untested).toBe(0)
  })

  it("returns all zeros for empty array", () => {
    const stats = computeRunStats([])
    expect(stats.pass).toBe(0)
    expect(stats.fail).toBe(0)
    expect(stats.blocked).toBe(0)
    expect(stats.skipped).toBe(0)
    expect(stats.untested).toBe(0)
    expect(stats.total).toBe(0)
    expect(stats.pass_rate).toBe(0)
  })
})

describe("estimateTimeRemaining", () => {
  it("returns null when no items have been executed", () => {
    const items = [
      { executed_at: null },
      { executed_at: null },
      { executed_at: null },
    ]
    expect(estimateTimeRemaining(items, 10)).toBeNull()
  })

  it("returns null when fewer than 2 items have been executed (only 1)", () => {
    const items = [
      { executed_at: "2024-01-01T10:00:00.000Z" },
      { executed_at: null },
      { executed_at: null },
    ]
    expect(estimateTimeRemaining(items, 5)).toBeNull()
  })

  it("returns approximately correct estimate with 3 items at 10s intervals", () => {
    // 3 executed items spaced 10 seconds apart, 7 remaining
    const t0 = new Date("2024-01-01T10:00:00.000Z").getTime()
    const items = [
      { executed_at: new Date(t0).toISOString() },
      { executed_at: new Date(t0 + 10_000).toISOString() },
      { executed_at: new Date(t0 + 20_000).toISOString() },
    ]
    // EMA with alpha=0.3:
    //   ema after [10s, 10s]: ema_0=10000, ema_1 = 0.3*10000 + 0.7*10000 = 10000
    // remaining = 10 - 3 = 7
    // estimate = 10000 * 7 = 70000 ms
    const result = estimateTimeRemaining(items, 10)
    expect(result).not.toBeNull()
    // Should be approximately 70s (allow ±5s for floating point)
    expect(result!).toBeGreaterThan(65_000)
    expect(result!).toBeLessThan(75_000)
  })

  it("excludes gaps > 5 minutes from the average (tester breaks)", () => {
    // Two close items (10s apart) then a 6-minute break, then close again
    const t0 = new Date("2024-01-01T10:00:00.000Z").getTime()
    const items = [
      { executed_at: new Date(t0).toISOString() },
      { executed_at: new Date(t0 + 10_000).toISOString() },
      // 6-minute gap here — should be excluded
      { executed_at: new Date(t0 + 10_000 + 360_000).toISOString() },
      { executed_at: new Date(t0 + 10_000 + 360_000 + 10_000).toISOString() },
    ]
    // Gaps: [10s, 360s(excluded), 10s]
    // EMA over [10000, 10000]: ema_0=10000, ema_1=0.3*10000+0.7*10000=10000
    // remaining = 10 - 4 = 6
    // estimate = 10000 * 6 = 60000 ms
    const result = estimateTimeRemaining(items, 10)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(55_000)
    expect(result!).toBeLessThan(65_000)
  })

  it("returns 0 when all items are completed", () => {
    const t0 = new Date("2024-01-01T10:00:00.000Z").getTime()
    const items = [
      { executed_at: new Date(t0).toISOString() },
      { executed_at: new Date(t0 + 10_000).toISOString() },
      { executed_at: new Date(t0 + 20_000).toISOString() },
    ]
    // totalItems = 3, executed = 3, remaining = 0
    expect(estimateTimeRemaining(items, 3)).toBe(0)
  })
})
