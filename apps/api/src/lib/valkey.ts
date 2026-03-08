import Valkey from "iovalkey"

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
  retryStrategy(times) {
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

valkey.on("error", (err) => {
  console.error("[valkey] connection error:", err.message)
})

/**
 * Create a new Valkey connection suitable for BullMQ Workers.
 * Workers use a blocking connection (BRPOP) — maxRetriesPerRequest MUST be null.
 * Call this once per Worker, not shared.
 */
export function createWorkerConnection(): Valkey {
  return new Valkey(process.env.VALKEY_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}
