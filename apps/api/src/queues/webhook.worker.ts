import crypto from "node:crypto"
import { Worker, UnrecoverableError } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import { safeFetch, SsrfError } from "../lib/ssrf.js"
import type { WebhookJobData } from "./webhook.queue.js"

export const webhookWorker = new Worker<WebhookJobData>(
  "webhook",
  async (job) => {
    const { endpointUrl, secret, event, payload } = job.data

    const payloadStr = JSON.stringify(payload)

    // Compute HMAC-SHA256 signature
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(payloadStr)
      .digest("hex")

    try {
      // safeFetch re-validates the resolved IPs at delivery time (SSRF: a
      // hostname can re-point to a private address after creation) and refuses
      // to follow redirects (a public endpoint could 302 to the metadata IP).
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
        // Blocked target — retrying won't help; fail permanently so BullMQ
        // stops retrying this delivery.
        throw new UnrecoverableError(`Webhook delivery blocked: ${err.message}`)
      }
      throw err // transient — BullMQ will retry
    }
  },
  {
    connection: getBullMQWorkerConnectionOptions(),
    concurrency: 10,
  }
)

webhookWorker.on("completed", (job) => {
  console.log(`[webhook-worker] Job ${job.id} completed`)
})

webhookWorker.on("failed", (job, err) => {
  console.error(`[webhook-worker] Job ${job?.id} failed:`, err.message)
})
