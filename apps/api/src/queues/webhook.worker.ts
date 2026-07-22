import { Worker } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import { deliverWebhook } from "../lib/webhook-delivery.js"
import type { WebhookJobData } from "./webhook.queue.js"

// Delivery logic (HMAC signing, SSRF-safe fetch, retry decision) lives in
// lib/webhook-delivery.ts so it's unit-testable without starting this Worker.
export const webhookWorker = new Worker<WebhookJobData>(
  "webhook",
  (job) => deliverWebhook(job),
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
