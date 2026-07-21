import type { FastifyRequest, FastifyReply } from "fastify"
import type { Redis } from "iovalkey"

interface RateLimiterOptions {
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number
  /** Max requests per window (default: 100) */
  max?: number
}

export interface RateLimitResult {
  /** false once the window count exceeds `max` */
  allowed: boolean
  /** current count in this window */
  count: number
  /** requests left before throttling (0 when over) */
  remaining: number
  /** seconds until the current window resets */
  retryAfter: number
}

/**
 * Fixed-window counter in Valkey — the shared core behind both the V1 API
 * limiter and the ingestion throttle (VEL-60). `bucket` is the identity being
 * limited (e.g. an apiKeyId or `ingest:{keyId}`); it is namespaced under
 * `ratelimit:`. Throws on Valkey failure so callers can decide how to fail
 * (both current callers fail CLOSED).
 */
export async function enforceRateLimit(
  valkey: Redis,
  bucket: string,
  opts: RateLimiterOptions = {}
): Promise<RateLimitResult> {
  const windowMs = opts.windowMs ?? 60_000
  const max = opts.max ?? 100
  const windowSec = Math.ceil(windowMs / 1000)

  const windowId = Math.floor(Date.now() / windowMs)
  const key = `ratelimit:${bucket}:${windowId}`

  const count = await valkey.incr(key)
  if (count === 1) {
    // Set expiry on first increment (TTL = window size + 1s buffer)
    await valkey.expire(key, windowSec + 1)
  }

  const windowStart = windowId * windowMs
  const windowEnd = windowStart + windowMs
  const retryAfter = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000))

  return {
    allowed: count <= max,
    count,
    remaining: Math.max(0, max - count),
    retryAfter,
  }
}

/**
 * Creates a Fastify preHandler that rate-limits API key requests using a
 * fixed-window counter in Valkey.
 *
 * Only API key requests are rate-limited (request.apiKeyId is set).
 * Session-based requests pass through without rate limiting.
 *
 * Key format: `ratelimit:{apiKeyId}:{windowId}`
 * where windowId = Math.floor(Date.now() / windowMs)
 */
export function createRateLimiter(
  valkey: Redis,
  opts: RateLimiterOptions = {}
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const windowMs = opts.windowMs ?? 60_000
  const max = opts.max ?? 100

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Only rate-limit API key requests
    if (!request.apiKeyId) return

    try {
      const rl = await enforceRateLimit(valkey, request.apiKeyId, { windowMs, max })

      // Always set rate limit headers on API key responses
      reply.header("X-RateLimit-Limit", String(max))
      reply.header("X-RateLimit-Remaining", String(rl.remaining))

      if (!rl.allowed) {
        reply.header("Retry-After", String(rl.retryAfter))
        return reply.status(429).send({
          error: "Rate limit exceeded",
          retry_after: rl.retryAfter,
        })
      }
    } catch (err) {
      // Valkey error — fail CLOSED (VEL-54). Admitting the request would let an
      // attacker bypass all rate limits simply by disrupting Valkey, and leaves the
      // backend unthrottled precisely when the system is already fragile. Return 503
      // (infra unavailable, retryable) not 429 — the client didn't exceed its quota;
      // the limiter did. A short Retry-After tells well-behaved clients to back off.
      request.log.error({ err }, "Rate limiter Valkey error — failing closed (503)")
      reply.header("Retry-After", "5")
      return reply.status(503).send({
        error: "Rate limiter temporarily unavailable",
        retry_after: 5,
      })
    }
  }
}
