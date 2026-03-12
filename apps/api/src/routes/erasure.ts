import type { FastifyPluginAsync } from "fastify"
import { sql } from "../db/client.js"
import { valkey } from "../lib/valkey.js"
import { lifecycleQueue } from "../queues/lifecycle.queue.js"
import { logAuditEvent } from "../lib/audit-log.js"

const erasureRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /api/me/request-erasure ────────────────────────────────────────
  // Request account erasure with 7-day grace period.
  // Immediately blocklists the user across all workspaces (UER-04).
  fastify.post("/api/me/request-erasure", async (request, reply) => {
    const userId = request.userId

    // Check for existing pending erasure request
    const [existing] = await sql`
      SELECT id FROM user_erasure_requests
      WHERE user_id = ${userId}::uuid AND status = 'pending'
    `
    if (existing) {
      return reply.status(409).send({ error: "Erasure request already pending" })
    }

    const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const jobId = `user-erase:${userId}`

    // Insert erasure request
    const [row] = await sql`
      INSERT INTO user_erasure_requests (user_id, scheduled_at, job_id)
      VALUES (${userId}::uuid, ${scheduledAt}, ${jobId})
      RETURNING id
    `

    // Enqueue delayed job for actual erasure after 7 days
    await lifecycleQueue.add(
      "user-erasure",
      { type: "user-erasure", userId, workspaceId: "" },
      { delay: 7 * 24 * 60 * 60 * 1000, jobId }
    )

    // UER-04 CRITICAL: Immediately blocklist user across ALL workspaces
    const workspaces = await sql`
      SELECT workspace_id FROM workspace_members
      WHERE user_id = ${userId}::uuid AND is_active = true
    `

    if (workspaces.length > 0) {
      const pipeline = valkey.pipeline()
      for (const ws of workspaces) {
        pipeline.set(`deactivated:${ws.workspace_id}:${userId}`, "1")
      }
      await pipeline.exec()
    }

    await logAuditEvent("user", userId, "requested", {
      scheduled_at: scheduledAt.toISOString(),
      workspaces_blocked: workspaces.length,
    })

    return reply.status(201).send({
      erasure_request_id: (row as { id: string }).id,
      status: "pending",
      scheduled_at: scheduledAt.toISOString(),
    })
  })

  // ── POST /api/me/cancel-erasure ─────────────────────────────────────────
  // Cancel a pending erasure request and remove session blocklist entries.
  fastify.post("/api/me/cancel-erasure", async (request, reply) => {
    const userId = request.userId

    // Find the most recent pending erasure request
    const [pending] = await sql`
      SELECT id, job_id FROM user_erasure_requests
      WHERE user_id = ${userId}::uuid AND status = 'pending'
      ORDER BY requested_at DESC
      LIMIT 1
    `

    if (!pending) {
      return reply.status(404).send({ error: "No pending erasure request" })
    }

    // Remove the delayed BullMQ job
    const jobId = pending.job_id as string
    try {
      const job = await lifecycleQueue.getJob(jobId)
      if (job) await job.remove()
    } catch {
      // Job may have already been processed or removed — not critical
    }

    // Mark request as cancelled
    await sql`
      UPDATE user_erasure_requests
      SET status = 'cancelled'
      WHERE id = ${(pending as { id: string }).id}::uuid
    `

    // Remove Valkey blocklist entries for all workspaces
    const workspaces = await sql`
      SELECT workspace_id FROM workspace_members
      WHERE user_id = ${userId}::uuid AND is_active = true
    `

    if (workspaces.length > 0) {
      const pipeline = valkey.pipeline()
      for (const ws of workspaces) {
        pipeline.del(`deactivated:${ws.workspace_id}:${userId}`)
      }
      await pipeline.exec()
    }

    await logAuditEvent("user", userId, "cancelled")

    return reply.send({ status: "cancelled" })
  })

  // ── GET /api/me/erasure-status ──────────────────────────────────────────
  // Check if the current user has a pending or processing erasure request.
  fastify.get("/api/me/erasure-status", async (request, reply) => {
    const userId = request.userId

    const [row] = await sql`
      SELECT id, status, requested_at, scheduled_at
      FROM user_erasure_requests
      WHERE user_id = ${userId}::uuid AND status IN ('pending', 'processing')
      ORDER BY requested_at DESC
      LIMIT 1
    `

    if (!row) {
      return reply.send({ has_pending_erasure: false })
    }

    return reply.send({
      has_pending_erasure: true,
      erasure_request_id: (row as { id: string }).id,
      status: (row as { status: string }).status,
      requested_at: (row as { requested_at: string }).requested_at,
      scheduled_at: (row as { scheduled_at: string }).scheduled_at,
    })
  })
}

export default erasureRoutes
