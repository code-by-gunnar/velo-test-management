import { Queue } from "bullmq"
import { getBullMQConnectionOptions } from "../lib/valkey.js"
import { sql } from "../db/client.js"

export interface WebhookJobData {
  webhookId: string
  endpointUrl: string
  secret: string
  event: string
  payload: Record<string, unknown>
}

/**
 * Webhook delivery queue — used to send event payloads to user-configured endpoints.
 * Processed by webhookWorker in webhook.worker.ts.
 * 5 attempts with exponential backoff (3s base).
 */
export const webhookQueue = new Queue<WebhookJobData>("webhook", {
  connection: getBullMQConnectionOptions(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})

/**
 * Fire-and-forget webhook event dispatcher.
 * Queries active webhooks for the project + workspace-level webhooks,
 * then enqueues one job per matching webhook.
 *
 * Uses bare sql (not withWorkspace) since this is called fire-and-forget
 * outside transactions, and we need cross-workspace lookup capability.
 */
export async function fireWebhookEvent(
  workspaceId: string,
  projectId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Query active webhooks matching the project + event, OR workspace-level (project_id IS NULL)
    const webhooks = await sql`
      SELECT id, endpoint_url, secret, events
      FROM webhooks
      WHERE workspace_id = ${workspaceId}
        AND active = true
        AND (project_id = ${projectId}::uuid OR project_id IS NULL)
        AND ${event} = ANY(events)
    `

    for (const wh of webhooks) {
      const webhook = wh as { id: string; endpoint_url: string; secret: string }
      await webhookQueue.add(`webhook:${event}`, {
        webhookId: webhook.id,
        endpointUrl: webhook.endpoint_url,
        secret: webhook.secret,
        event,
        payload,
      })
    }
  } catch {
    // Fire-and-forget — webhook dispatch failure must not affect caller
  }
}
