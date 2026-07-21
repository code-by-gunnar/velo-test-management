import type { Redis } from "iovalkey"

// Single source of truth for the reports cache key + invalidation (VEL-75).
//
// The reports endpoint caches its aggregate payload in Valkey for 60s. That made
// a just-recorded result take up to a minute to appear — even after a manual
// refresh. Every route that changes a project's run results must bust this key
// so the next Reports view is fresh. Keep the key construction in ONE place so a
// producer (reports.ts) and the invalidators can never drift.

export function reportsCacheKey(workspaceId: string, projectId: string): string {
  return `reports:${workspaceId}:${projectId}`
}

/**
 * Drop the cached reports payload for a project. Fire-and-forget safe: a Valkey
 * hiccup must never fail the mutation that triggered it (worst case the view is
 * stale for up to the 60s TTL, exactly the pre-VEL-75 behavior).
 */
export async function invalidateReportsCache(
  valkey: Redis | undefined,
  workspaceId: string,
  projectId: string
): Promise<void> {
  // Best-effort and fire-and-forget: a missing/partial client or a Valkey error
  // must never throw into the caller's void path. Worst case the Reports view
  // stays stale for the 60s TTL (the pre-VEL-75 behavior).
  if (!valkey) return
  try {
    await valkey.del(reportsCacheKey(workspaceId, projectId))
  } catch {
    // ignore
  }
}
