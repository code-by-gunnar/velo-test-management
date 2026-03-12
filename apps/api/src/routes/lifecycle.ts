import type { FastifyPluginAsync } from "fastify"
import { sql } from "../db/client.js"
import { lifecycleQueue } from "../queues/lifecycle.queue.js"
import { logAuditEvent } from "../lib/audit-log.js"

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
    const jobId = `ws-delete:${workspaceId}`

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

    return reply.send({
      deletion_status: "pending_deletion",
      deletion_requested_at: new Date().toISOString(),
      deletion_scheduled_at: scheduledAt.toISOString(),
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
