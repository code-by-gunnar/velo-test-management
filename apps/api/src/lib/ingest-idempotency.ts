import type { Redis } from "iovalkey"

// VEL-79: dedupe retried CI uploads. When a caller sends an Idempotency-Key, a
// repeat within the TTL replays the first response instead of creating a
// duplicate run. Keyed per workspace+project so keys can't collide across
// tenants, and stored in Valkey (the ingestion path already depends on it for
// the per-key throttle).
//
// Guarantee is for SEQUENTIAL retries — the real case: the first upload finishes
// (or the client times out) and the runner retries the same key. Two genuinely
// concurrent identical uploads can still both miss the cache and each create a
// run; that's rare for CI and acceptable (a stricter SET-NX lock would trade it
// for 409s on the loser).

const TTL_SEC = Math.max(60, parseInt(process.env.INGEST_IDEMPOTENCY_TTL ?? "86400", 10) || 86400)

// Accept only a bounded, printable key; anything else is treated as "no key"
// (ignored, not rejected) so a malformed header never blocks a real ingest.
const KEY_RE = /^[\w.\-:]{1,255}$/

export interface IngestResult {
  ingestion_id: string
  run_id: string
  total_tests: number
  matched_tests: number
  unmatched_tests: number
}

/** Extract + validate the Idempotency-Key header. Returns null when absent/invalid. */
export function idempotencyKeyFromHeader(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw) return null
  const trimmed = raw.trim()
  return KEY_RE.test(trimmed) ? trimmed : null
}

export function idempotencyCacheKey(workspaceId: string, projectId: string, key: string): string {
  return `ingest:idem:${workspaceId}:${projectId}:${key}`
}

/** Look up a stored ingest result. Returns null on miss or any Valkey/parse error. */
export async function lookupIdempotentResult(valkey: Redis, cacheKey: string): Promise<IngestResult | null> {
  try {
    const raw = await valkey.get(cacheKey)
    return raw ? (JSON.parse(raw) as IngestResult) : null
  } catch {
    return null
  }
}

/** Store an ingest result under the idempotency key. Best-effort; never throws. */
export async function storeIdempotentResult(valkey: Redis, cacheKey: string, result: IngestResult): Promise<void> {
  try {
    await valkey.set(cacheKey, JSON.stringify(result), "EX", TTL_SEC)
  } catch {
    // best-effort — a failed store just means the next retry re-ingests
  }
}
