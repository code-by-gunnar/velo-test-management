import { Worker } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import { valkey } from "../lib/valkey.js"
import { sql } from "../db/client.js"
import { logAuditEvent } from "../lib/audit-log.js"
import { r2Enabled, listR2Objects, deleteR2Objects } from "../lib/r2.js"
import type { LifecycleJobData } from "./lifecycle.queue.js"
import { lifecycleQueue } from "./lifecycle.queue.js"

export const lifecycleWorker = new Worker<LifecycleJobData>(
  "lifecycle",
  async (job) => {
    switch (job.data.type) {
      case "workspace-delete": {
        const { workspaceId, requestedBy } = job.data

        // Atomic status claim — prevents duplicate processing
        const claimed = await sql<{ id: string }[]>`
          UPDATE workspaces SET deletion_status = 'processing'
          WHERE id = ${workspaceId}::uuid
            AND deletion_status = 'pending_deletion'
          RETURNING id
        `
        if (claimed.length === 0) {
          console.log(`[lifecycle-worker] workspace-delete: ${workspaceId} already processing or not pending`)
          break
        }

        await logAuditEvent("workspace", workspaceId, "processing", { requestedBy })

        let r2ObjectsDeleted = 0

        if (r2Enabled()) {
          // Avatar keys for users who ONLY belong to this workspace
          const avatarRows = await sql<{ avatar_url: string }[]>`
            SELECT u.avatar_url FROM users u
            WHERE u.avatar_url IS NOT NULL
              AND u.id IN (
                SELECT wm.user_id FROM workspace_members wm
                WHERE wm.workspace_id = ${workspaceId}::uuid
              )
              AND NOT EXISTS (
                SELECT 1 FROM workspace_members wm2
                WHERE wm2.user_id = u.id
                  AND wm2.workspace_id != ${workspaceId}::uuid
                  AND wm2.is_active = true
              )
          `
          const avatarKeys = avatarRows.map((r) => r.avatar_url)

          // Ingestion payload keys
          const ingestionKeys = await listR2Objects(`ingestion/${workspaceId}/`)

          const allKeys = [...avatarKeys, ...ingestionKeys]
          r2ObjectsDeleted = await deleteR2Objects(allKeys)
        }

        // Valkey cleanup — remove cached role and deactivation keys
        const roleKeys = await valkey.keys(`member_role:${workspaceId}:*`)
        const deactivatedKeys = await valkey.keys(`deactivated:${workspaceId}:*`)
        const allValkeyKeys = [...roleKeys, ...deactivatedKeys]
        if (allValkeyKeys.length > 0) {
          await valkey.del(...allValkeyKeys)
        }

        // Hard-delete workspace (cascades to members, test data, etc.)
        await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`

        await logAuditEvent("workspace", workspaceId, "completed", {
          r2_objects_deleted: r2ObjectsDeleted,
        })

        console.log(
          `[lifecycle-worker] workspace-delete completed: ${workspaceId} (${r2ObjectsDeleted} R2 objects deleted)`
        )
        break
      }
      case "user-erasure": {
        const { userId } = job.data

        // Atomic status claim
        const claimedErasure = await sql<{ id: string }[]>`
          UPDATE user_erasure_requests SET status = 'processing'
          WHERE user_id = ${userId}::uuid
            AND status = 'pending'
          RETURNING id
        `
        if (claimedErasure.length === 0) {
          console.log(`[lifecycle-worker] user-erasure: ${userId} already processing or not pending`)
          break
        }

        const erasureRequestId = claimedErasure[0]!.id
        await logAuditEvent("user", userId, "processing")

        // R2 avatar cleanup
        if (r2Enabled()) {
          const userRow = await sql<{ avatar_url: string | null }[]>`
            SELECT avatar_url FROM users WHERE id = ${userId}::uuid
          `
          const avatar = userRow[0]?.avatar_url
          if (avatar) {
            await deleteR2Objects([avatar])
          }
        }

        // PII anonymization
        const anonEmail = `deleted-${erasureRequestId}@deleted.invalid`
        await sql`
          UPDATE users SET
            name = 'Deleted User',
            email = ${anonEmail},
            password_hash = NULL,
            avatar_url = NULL,
            pending_email = NULL,
            updated_at = NOW()
          WHERE id = ${userId}::uuid
        `

        // Mark erasure request completed
        await sql`
          UPDATE user_erasure_requests SET status = 'completed', completed_at = NOW()
          WHERE id = ${erasureRequestId}::uuid
        `

        // Valkey cleanup — remove deactivation keys for this user across all workspaces
        const userDeactivatedKeys = await valkey.keys(`deactivated:*:${userId}`)
        if (userDeactivatedKeys.length > 0) {
          await valkey.del(...userDeactivatedKeys)
        }

        await logAuditEvent("user", userId, "completed", {
          erasure_request_id: erasureRequestId,
        })

        console.log(`[lifecycle-worker] user-erasure completed: ${userId}`)
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
