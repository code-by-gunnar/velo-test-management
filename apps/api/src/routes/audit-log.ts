import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { requireAdmin } from "../plugins/require-admin.js"

// ── Security audit trail — admin read view (VEL-72) ──────────────────────────
// The recording half (recordAudit + the append-only audit_log table) shipped
// with migration 0025; this is the admin-facing reader. Workspace-scoped (RLS),
// admin-only, keyset-paginated by created_at. Actor/target UUIDs are resolved to
// names via joins so the UI shows "Ada changed a role", not raw ids.

const auditLogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { limit?: string; before?: string }
  }>(
    "/api/workspaces/:workspaceId/audit-log",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { workspaceId } = request.params
      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50))
      const before = request.query.before // ISO created_at cursor for "load more"

      const entries = await withWorkspace(workspaceId, async (tx) => tx`
        SELECT
          al.id,
          al.action,
          al.target_type,
          al.target_id,
          al.metadata,
          al.created_at,
          al.actor_user_id,
          u.name       AS actor_user_name,
          u.email      AS actor_user_email,
          al.actor_api_key_id,
          k.name       AS actor_api_key_name
        FROM audit_log al
        LEFT JOIN users u    ON u.id = al.actor_user_id
        LEFT JOIN api_keys k ON k.id = al.actor_api_key_id
        WHERE al.workspace_id = current_setting('app.workspace_id', true)::uuid
          ${before ? tx`AND al.created_at < ${before}::timestamptz` : tx``}
        ORDER BY al.created_at DESC
        LIMIT ${limit}
      `)

      // Cursor for the next page: the oldest created_at in this batch. Null when
      // fewer than `limit` rows came back (no more pages).
      const nextBefore = entries.length === limit
        ? (entries[entries.length - 1] as { created_at: string }).created_at
        : null

      return reply.send({ entries, next_before: nextBefore })
    }
  )
}

export default auditLogRoutes
