import type { FastifyPluginAsync } from "fastify"
import { sql } from "../db/client.js"
import { lifecycleQueue } from "../queues/lifecycle.queue.js"
import { logAuditEvent } from "../lib/audit-log.js"
import { sendLifecycleEmails } from "../lib/email.js"
import { captureEvent } from "../lib/posthog.js"

const lifecycleRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard: all lifecycle routes require a valid session ─────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /api/workspaces/:workspaceId/lifecycle/request-deletion ────────
  // Admin-only. Schedules workspace for deletion after 30-day grace period.
  fastify.post<{
    Params: { workspaceId: string }
  }>("/api/workspaces/:workspaceId/lifecycle/request-deletion", async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params

    // Verify user is admin of this workspace
    const member = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND is_active = true
    `
    if (member.length === 0 || member[0]?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" })
    }

    // Check workspace exists and is not already pending deletion
    const workspace = await sql`
      SELECT id, deletion_status FROM workspaces WHERE id = ${workspaceId}::uuid
    `
    if (workspace.length === 0) {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    if (workspace[0]?.deletion_status !== null) {
      return reply.status(409).send({ error: "Workspace already has a pending deletion request" })
    }

    const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const jobId = `ws-delete-${workspaceId}`

    await sql`
      UPDATE workspaces
      SET deletion_requested_at = NOW(),
          deletion_scheduled_at = ${scheduledAt.toISOString()}::timestamptz,
          deletion_requested_by = ${userId}::uuid,
          deletion_job_id = ${jobId},
          deletion_status = 'pending_deletion',
          updated_at = NOW()
      WHERE id = ${workspaceId}::uuid
    `

    await lifecycleQueue.add(
      "workspace-delete",
      { type: "workspace-delete", workspaceId, requestedBy: userId },
      { delay: 30 * 24 * 60 * 60 * 1000, jobId }
    )

    await logAuditEvent("workspace", workspaceId, "requested", {
      requested_by: userId,
      scheduled_at: scheduledAt.toISOString(),
    })

    captureEvent(userId as string, "workspace_deletion_requested", {
      workspace_id: workspaceId,
      scheduled_at: scheduledAt.toISOString(),
    })

    void reply.send({
      deletion_status: "pending_deletion",
      deletion_requested_at: new Date().toISOString(),
      deletion_scheduled_at: scheduledAt.toISOString(),
    })

    // ── WLC-05: Notify all active workspace members ────────────────────────
    const WEB_URL = process.env.WEB_URL ?? "https://runvelo.app"
    const exportUrl = `${WEB_URL}/workspace/settings`

    // Query member emails (fire-and-forget — don't block the response)
    void (async () => {
      try {
        const members = await sql<{ email: string }[]>`
          SELECT u.email FROM users u
          INNER JOIN workspace_members wm ON wm.user_id = u.id
          WHERE wm.workspace_id = ${workspaceId}::uuid AND wm.is_active = true
        `
        const emails = members.map((m) => m.email)
        if (emails.length === 0) return

        // Fetch workspace name for email content
        const [ws] = await sql<{ name: string }[]>`SELECT name FROM workspaces WHERE id = ${workspaceId}::uuid`
        const workspaceName = ws?.name ?? "your workspace"
        const formattedDate = scheduledAt.toLocaleDateString("en-GB", {
          day: "numeric", month: "long", year: "numeric",
        })

        await sendLifecycleEmails(
          emails,
          `${workspaceName} scheduled for deletion`,
          "workspace-deletion-requested",
          { workspaceName, scheduledDate: formattedDate, exportUrl }
        )
      } catch (err) {
        console.error("[lifecycle] Failed to send deletion notification emails:", err)
      }
    })()

    // ── TRN-03: Enqueue warning email 3 days before expiry ──────────────
    const warningDelay = (30 - 3) * 24 * 60 * 60 * 1000 // 27 days
    void lifecycleQueue.add(
      "lifecycle-warning",
      { type: "lifecycle-warning", warningType: "workspace-deletion", entityId: workspaceId },
      { delay: warningDelay, jobId: `ws-delete-${workspaceId}-warning` }
    ).catch((err: unknown) => {
      console.error("[lifecycle] Failed to enqueue deletion warning job:", err)
    })
  })

  // ── POST /api/workspaces/:workspaceId/lifecycle/cancel-deletion ─────────
  // Admin-only. Cancels a pending workspace deletion.
  fastify.post<{
    Params: { workspaceId: string }
  }>("/api/workspaces/:workspaceId/lifecycle/cancel-deletion", async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params

    // Verify user is admin of this workspace
    const member = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND is_active = true
    `
    if (member.length === 0 || member[0]?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" })
    }

    // Check workspace is actually pending deletion
    const workspace = await sql`
      SELECT deletion_status, deletion_job_id FROM workspaces WHERE id = ${workspaceId}::uuid
    `
    if (workspace.length === 0) {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    if (workspace[0]?.deletion_status !== "pending_deletion") {
      return reply.status(409).send({ error: "Workspace is not pending deletion" })
    }

    // Remove the BullMQ delayed job
    const jobId = workspace[0].deletion_job_id as string
    if (jobId) {
      const job = await lifecycleQueue.getJob(jobId)
      if (job) {
        await job.remove()
      }
    }

    // Also remove the warning job
    try {
      const warningJob = await lifecycleQueue.getJob(`ws-delete-${workspaceId}-warning`)
      if (warningJob) await warningJob.remove()
    } catch {
      // Warning job may not exist or already processed — not critical
    }

    // Clear all deletion columns
    await sql`
      UPDATE workspaces
      SET deletion_requested_at = NULL,
          deletion_scheduled_at = NULL,
          deletion_requested_by = NULL,
          deletion_job_id = NULL,
          deletion_status = NULL,
          updated_at = NOW()
      WHERE id = ${workspaceId}::uuid
    `

    await logAuditEvent("workspace", workspaceId, "cancelled", {
      cancelled_by: userId,
    })

    return reply.send({ deletion_status: null })
  })

  // ── GET /api/workspaces/:workspaceId/lifecycle/status ───────────────────
  // Any workspace member can view deletion status.
  fastify.get<{
    Params: { workspaceId: string }
  }>("/api/workspaces/:workspaceId/lifecycle/status", async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params

    // Verify user is a member of this workspace
    const member = await sql`
      SELECT id FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND is_active = true
    `
    if (member.length === 0) {
      return reply.status(403).send({ error: "Access denied" })
    }

    const workspace = await sql`
      SELECT deletion_status, deletion_requested_at, deletion_scheduled_at, deletion_requested_by
      FROM workspaces
      WHERE id = ${workspaceId}::uuid
    `
    if (workspace.length === 0) {
      return reply.status(404).send({ error: "Workspace not found" })
    }

    const row = workspace[0]!
    return reply.send({
      deletion_status: row.deletion_status ?? null,
      deletion_requested_at: row.deletion_requested_at ?? null,
      deletion_scheduled_at: row.deletion_scheduled_at ?? null,
      deletion_requested_by: row.deletion_requested_by ?? null,
    })
  })
}

export default lifecycleRoutes
