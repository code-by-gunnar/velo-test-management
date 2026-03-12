import { Worker } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import { sql } from "../db/client.js"
import type { LifecycleJobData } from "./lifecycle.queue.js"
import { lifecycleQueue } from "./lifecycle.queue.js"

export const lifecycleWorker = new Worker<LifecycleJobData>(
  "lifecycle",
  async (job) => {
    switch (job.data.type) {
      case "workspace-delete": {
        // Phase 2: implement full workspace data deletion
        console.log(
          `[lifecycle-worker] workspace-delete: workspaceId=${job.data.workspaceId} requestedBy=${job.data.requestedBy} (stub)`
        )
        break
      }
      case "user-erasure": {
        // Phase 2: implement full user data erasure
        console.log(
          `[lifecycle-worker] user-erasure: userId=${job.data.userId} workspaceId=${job.data.workspaceId} (stub)`
        )
        break
      }
      case "sweep-expired": {
        // Find workspaces past their scheduled deletion date
        const expiredWorkspaces = await sql<{ id: string }[]>`
          SELECT id FROM workspaces
          WHERE deletion_status = 'pending_deletion'
            AND deletion_scheduled_at < NOW()
        `

        // Find user erasure requests past their scheduled date
        const expiredErasures = await sql<
          { id: string; user_id: string; workspace_id: string }[]
        >`
          SELECT id, user_id, workspace_id FROM user_erasure_requests
          WHERE status = 'pending'
            AND scheduled_at < NOW()
        `

        // Enqueue workspace-delete jobs
        for (const ws of expiredWorkspaces) {
          await lifecycleQueue.add(
            "workspace-delete",
            { type: "workspace-delete", workspaceId: ws.id, requestedBy: "sweep" },
            { jobId: `ws-delete:${ws.id}` }
          )
        }

        // Enqueue user-erasure jobs
        for (const er of expiredErasures) {
          await lifecycleQueue.add(
            "user-erasure",
            { type: "user-erasure", userId: er.user_id, workspaceId: er.workspace_id },
            { jobId: `user-erase:${er.user_id}` }
          )
        }

        console.log(
          `[lifecycle-worker] sweep complete: ${expiredWorkspaces.length} workspaces, ${expiredErasures.length} erasures enqueued`
        )
        break
      }
      default: {
        console.log(`[lifecycle-worker] Unknown job type: ${String((job.data as Record<string, unknown>).type)}`)
      }
    }
  },
  {
    connection: getBullMQWorkerConnectionOptions(),
    concurrency: 1,
  }
)

lifecycleWorker.on("completed", (job) => {
  console.log(`[lifecycle-worker] Job ${job.id} completed`)
})

lifecycleWorker.on("failed", (job, err) => {
  console.error(`[lifecycle-worker] Job ${job?.id} failed:`, err.message)
})
