import type { FastifyRequest, FastifyReply } from "fastify"
import type { Redis } from "iovalkey"

interface RateLimiterOptions {
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number
  /** Max requests per window (default: 100) */
  max?: number
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
  const windowSec = Math.ceil(windowMs / 1000)

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Only rate-limit API key requests
    if (!request.apiKeyId) return

    const windowId = Math.floor(Date.now() / windowMs)
    const key = `ratelimit:${request.apiKeyId}:${windowId}`

    try {
      const count = await valkey.incr(key)

      // Set expiry on first increment (TTL = window size + 1s buffer)
      if (count === 1) {
        await valkey.expire(key, windowSec + 1)
      }

      const remaining = Math.max(0, max - count)

      // Always set rate limit headers on API key responses
      reply.header("X-RateLimit-Limit", String(max))
      reply.header("X-RateLimit-Remaining", String(remaining))

      if (count > max) {
        // Calculate seconds until current window resets
        const windowStart = windowId * windowMs
        const windowEnd = windowStart + windowMs
        const retryAfter = Math.ceil((windowEnd - Date.now()) / 1000)

        reply.header("Retry-After", String(Math.max(1, retryAfter)))
        return reply.status(429).send({
          error: "Rate limit exceeded",
          retry_after: Math.max(1, retryAfter),
        })
      }
    } catch {
      // Valkey error — fail open (allow request through)
      // Rate limiting is non-critical; don't block requests on Valkey failure
      request.log.warn("Rate limiter Valkey error — failing open")
    }
  }
}
