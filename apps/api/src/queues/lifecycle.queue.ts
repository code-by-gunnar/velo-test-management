import { Queue } from "bullmq"
import { getBullMQConnectionOptions } from "../lib/valkey.js"

export type LifecycleJobData =
  | { type: "workspace-delete"; workspaceId: string; requestedBy: string }
  | { type: "user-erasure"; userId: string; workspaceId: string }
  | { type: "sweep-expired" }
  | { type: "lifecycle-warning"; warningType: "workspace-deletion" | "user-erasure"; entityId: string }

/**
 * Lifecycle queue — handles workspace deletion, user erasure, and daily sweep
 * of expired deletion/erasure requests. Processed by lifecycleWorker.
 */
export const lifecycleQueue = new Queue<LifecycleJobData>("lifecycle", {
  connection: getBullMQConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
})

/**
 * Register a repeatable sweep job that runs daily at 3 AM UTC.
 * Idempotent — BullMQ deduplicates by jobId.
 */
export async function registerSweepJob(): Promise<void> {
  await lifecycleQueue.add(
    "sweep-expired",
    { type: "sweep-expired" },
    {
      repeat: { pattern: "0 3 * * *" },
      jobId: "sweep-expired",
    }
  )
}
