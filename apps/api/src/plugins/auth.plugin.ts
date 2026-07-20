import fp from "fastify-plugin"
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify"
import { verifyApiKey } from "../routes/api-keys.js"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"

// Extend FastifyRequest with apiKeyId for rate limiting and audit
declare module "fastify" {
  interface FastifyRequest {
    apiKeyId: string | null
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * Auth plugin — provides `fastify.requireAuth` preHandler.
 *
 * Auth resolution order:
 * 1. If session plugin already populated userId (Auth.js JWE) — pass through.
 * 2. If Authorization: Bearer velo_* header — verify API key, populate request fields.
 * 3. Neither — return 401.
 *
 * This plugin does NOT replace the session plugin. The session plugin runs as a
 * global hook and handles JWE decryption. This plugin adds API key support on top
 * and is opt-in via `{ preHandler: fastify.requireAuth }`.
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with apiKeyId (default null)
  fastify.decorateRequest("apiKeyId", null)

  async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // 1. Session auth already succeeded (session plugin ran as global hook)
    if (request.userId) {
      return
    }

    // 2. Try API key auth
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith("Bearer velo_")) {
      const rawKey = authHeader.slice(7)
      const verified = await verifyApiKey(rawKey)

      if (verified) {
        // Look up the created_by user for this API key
        const keyRows = await sql`
          SELECT created_by FROM api_keys
          WHERE id = ${verified.keyId}
            AND revoked_at IS NULL
        `
        const createdBy = keyRows.length > 0
          ? (keyRows[0] as { created_by: string | null }).created_by
          : null

        // The key acts with its CREATOR's LIVE workspace role — NOT a blanket
        // "api_key" role (VEL-63). The old constant slipped past requireEditor
        // (which only blocked the literal "viewer"), so a viewer could mint a
        // key and gain write access. Resolve the real role from the membership
        // row (same source of truth session.plugin.ts uses); if the creator is
        // null or no longer an active member, role stays null and the allowlist
        // in requireEditor/requireAdmin fails closed.
        let role: string | null = null
        if (createdBy) {
          const roleRows = await withWorkspace(verified.workspaceId, async (tx) => tx`
            SELECT role FROM workspace_members
            WHERE workspace_id = ${verified.workspaceId}::uuid
              AND user_id = ${createdBy}::uuid
              AND is_active = true
          `)
          role = roleRows.length > 0 ? (roleRows[0] as { role: string }).role : null
        }

        request.userId = createdBy ?? verified.keyId // fallback to keyId if no created_by
        request.workspaceId = verified.workspaceId
        request.userRole = role
        request.apiKeyId = verified.keyId
        return
      }

      // API key provided but invalid
      return reply.status(401).send({ error: "Invalid API key" })
    }

    // 3. Neither session nor API key
    return reply.status(401).send({ error: "Authentication required" })
  }

  fastify.decorate("requireAuth", requireAuth)
}

export default fp(authPlugin, {
  name: "auth",
  dependencies: ["session"],
})
