import { PostHog } from "posthog-node"

// Lazy singleton — created on first call to getPostHogClient().
// This avoids crashing at module load time when env vars are not configured
// (local dev without analytics, CI test runs).
let _client: PostHog | null = null

/**
 * Returns the shared PostHog client instance, creating it on first call.
 * Returns null if POSTHOG_KEY is not configured (analytics silently disabled).
 */
export function getPostHogClient(): PostHog | null {
  if (_client) return _client

  const key = process.env["POSTHOG_KEY"]
  const host = process.env["POSTHOG_HOST"]

  if (!key || !host) return null

  _client = new PostHog(key, {
    host,
    flushAt: 20,
    flushInterval: 10000,
  })

  return _client
}

/**
 * Capture a server-side analytics event.
 * Safe to call even when PostHog is not configured — does nothing in that case.
 *
 * @param distinctId - User ID or workspace ID to associate the event with
 * @param event      - Event name (snake_case)
 * @param properties - Optional event properties
 */
export function captureEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): void {
  const client = getPostHogClient()
  if (!client) return
  client.capture({ distinctId, event, ...(properties ? { properties } : {}) })
}

/**
 * Shut down the PostHog client gracefully, flushing any queued events.
 * Call this when the server is shutting down.
 */
export async function shutdownPostHog(): Promise<void> {
  if (_client) {
    await _client.shutdown()
    _client = null
  }
}
