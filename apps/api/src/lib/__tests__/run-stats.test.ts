import { describe, it } from "vitest"

// DA-02: Stats computation — pass rate, time-to-complete estimate
describe("computeRunStats", () => {
  it.todo("calculates correct pass/fail/blocked/skipped/untested counts")
  it.todo("calculates pass rate as pass / (total - untested) * 100")
  it.todo("returns 0 pass rate when no items have been executed")
})

describe("estimateTimeRemaining", () => {
  it.todo("returns null when fewer than 2 items have been executed")
  it.todo("uses EMA with alpha=0.3 for inter-case duration")
  it.todo("excludes gaps > 5 minutes from the average (tester breaks)")
  it.todo("returns 0 when all items are completed")
})
