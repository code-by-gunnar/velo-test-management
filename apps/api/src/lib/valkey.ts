import { Redis as Valkey } from "iovalkey"
import type { Redis } from "iovalkey"

if (!process.env.VALKEY_URL) {
  throw new Error("VALKEY_URL environment variable is required")
}

/**
 * Shared Valkey connection for general use (pub, get/set, rate limiting).
 * Do NOT use this connection for BullMQ Workers — Workers require a dedicated
 * connection with maxRetriesPerRequest: null.
 */
export const valkey = new Valkey(process.env.VALKEY_URL, {
  lazyConnect: false,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) {
      // Give up after 10 retries — let the process restart
      return null
    }
    return Math.min(times * 100, 3000) // exponential backoff, max 3s
  },
})

valkey.on("connect", () => {
  console.log("[valkey] connected")
})

valkey.on("error", (err: Error) => {
  console.error("[valkey] connection error:", err.message)
})

/**
 * Create a new Valkey connection suitable for BullMQ Workers.
 * Workers use a blocking connection (BRPOP) — maxRetriesPerRequest MUST be null.
 * Call this once per Worker, not shared.
 */
export function createWorkerConnection(): Redis {
  return new Valkey(process.env.VALKEY_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}

/**
 * BullMQ connection options (URL-based).
 * BullMQ uses ioredis types internally; passing a URL avoids the type mismatch
 * between iovalkey and ioredis instance types.
 */
export function getBullMQConnectionOptions(): { url: string } {
  return { url: process.env.VALKEY_URL! }
}

/**
 * BullMQ worker connection options — maxRetriesPerRequest must be null
 * for Workers that use blocking commands (BRPOP).
 */
export function getBullMQWorkerConnectionOptions(): {
  url: string
  maxRetriesPerRequest: null
  enableReadyCheck: false
} {
  return {
    url: process.env.VALKEY_URL!,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
}
