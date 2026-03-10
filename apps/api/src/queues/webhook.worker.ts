import crypto from "node:crypto"
import { Worker } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
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

    // 10s timeout per attempt
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Velo-Signature": `sha256=${hmac}`,
          "X-Velo-Event": event,
          "X-Velo-Delivery": job.id ?? "unknown",
        },
        body: payloadStr,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.status >= 400) {
        throw new Error(`Webhook delivery failed: HTTP ${response.status}`)
      }

      // 2xx or 3xx = success
    } catch (err) {
      clearTimeout(timeout)
      throw err // BullMQ will retry
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
