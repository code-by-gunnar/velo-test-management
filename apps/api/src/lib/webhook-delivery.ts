import crypto from "node:crypto"
import { UnrecoverableError } from "bullmq"
import { safeFetch, SsrfError } from "./ssrf.js"
import type { WebhookJobData } from "../queues/webhook.queue.js"

// Extracted from webhook.worker.ts so the delivery contract (HMAC signing,
// SSRF-safe fetch, retry-vs-permanent-fail decision) is unit-testable WITHOUT
// spinning up a BullMQ Worker (importing the worker module starts a real Valkey
// poller). The worker is now a thin `(job) => deliverWebhook(job)` wrapper.

/** The minimal shape of the BullMQ job we consume (Job satisfies it structurally). */
export interface WebhookDeliveryJob {
  data: WebhookJobData
  id?: string | undefined
}

/**
 * Deliver one webhook event. Signs the JSON body with HMAC-SHA256 over the
 * webhook's secret (`X-Velo-Signature: sha256=<hex>`), POSTs it through
 * `safeFetch` (re-resolves the host + refuses redirects — SSRF), and decides
 * retry semantics: an SSRF-blocked target is a permanent failure (BullMQ stops
 * retrying); a transient error / 4xx-5xx response is rethrown so BullMQ retries
 * with the queue's exponential backoff.
 */
export async function deliverWebhook(job: WebhookDeliveryJob): Promise<void> {
  const { endpointUrl, secret, event, payload } = job.data
  const payloadStr = JSON.stringify(payload)

  const hmac = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex")

  try {
    const response = await safeFetch(
      endpointUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Velo-Signature": `sha256=${hmac}`,
          "X-Velo-Event": event,
          "X-Velo-Delivery": job.id ?? "unknown",
        },
        body: payloadStr,
      },
      10_000
    )

    if (response.status >= 400) {
      throw new Error(`Webhook delivery failed: HTTP ${response.status}`)
    }
    // 2xx = success
  } catch (err) {
    if (err instanceof SsrfError) {
      // Blocked target — retrying won't help; fail permanently.
      throw new UnrecoverableError(`Webhook delivery blocked: ${err.message}`)
    }
    throw err // transient — BullMQ will retry
  }
}
