/**
 * run-stats.ts — Pure functions for computing run statistics and ETA.
 * No DB dependencies — accepts pre-fetched row arrays.
 */

export interface RunStats {
  pass: number
  fail: number
  blocked: number
  skipped: number
  untested: number
  total: number
  pass_rate: number // 0-100 percentage (executed items only)
}

/**
 * Compute run statistics from an array of run_item rows.
 *
 * pass_rate = pass / (total - untested) * 100, rounded to nearest integer.
 * Returns 0 when no items have been executed yet.
 */
export function computeRunStats(
  items: Array<{ status: string }>
): RunStats {
  let pass = 0
  let fail = 0
  let blocked = 0
  let skipped = 0
  let untested = 0

  for (const item of items) {
    switch (item.status) {
      case "pass":    pass++;    break
      case "fail":    fail++;    break
      case "blocked": blocked++; break
      case "skipped": skipped++; break
      default:        untested++ // 'untested' or unexpected value
    }
  }

  const total = items.length
  const executed = total - untested
  const pass_rate = executed > 0 ? Math.round((pass / executed) * 100) : 0

  return { pass, fail, blocked, skipped, untested, total, pass_rate }
}

/**
 * Estimate milliseconds remaining in a test run using Exponential Moving Average.
 *
 * Algorithm:
 *  1. Filter items that have executed_at, sort ascending.
 *  2. Compute inter-case durations between consecutive items.
 *  3. Exclude gaps > 5 minutes (300_000 ms) — tester breaks / context switches.
 *  4. Apply EMA (alpha=0.3) over included intervals.
 *  5. Multiply EMA by number of remaining (unexecuted) items.
 *
 * Returns null if fewer than 2 data points — not enough for a reliable estimate.
 * Returns 0 if all items are already executed.
 */
export function estimateTimeRemaining(
  items: Array<{ executed_at: string | null }>,
  totalItems: number
): number | null {
  // Filter executed items and sort by execution time
  const executed = items
    .filter((i) => i.executed_at !== null)
    .sort((a, b) => new Date(a.executed_at!).getTime() - new Date(b.executed_at!).getTime())

  const remaining = totalItems - executed.length
  if (remaining === 0) return 0

  if (executed.length < 2) return null

  // Compute inter-case durations, excluding gaps > 5 minutes
  const MAX_GAP_MS = 5 * 60 * 1000 // 300_000 ms
  const ALPHA = 0.3

  const durations: number[] = []
  for (let i = 1; i < executed.length; i++) {
    const prev = new Date(executed[i - 1]!.executed_at!).getTime()
    const curr = new Date(executed[i]!.executed_at!).getTime()
    const gap = curr - prev
    if (gap > 0 && gap <= MAX_GAP_MS) {
      durations.push(gap)
    }
  }

  if (durations.length === 0) return null

  // Exponential Moving Average
  let ema = durations[0]!
  for (let i = 1; i < durations.length; i++) {
    ema = ALPHA * durations[i]! + (1 - ALPHA) * ema
  }

  return Math.round(ema * remaining)
}
