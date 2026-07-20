import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"
import { sql } from "../db/client.js"
import { captureEvent } from "../lib/posthog.js"
import { requireAdmin } from "../plugins/require-admin.js"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

// ── verifyApiKey ──────────────────────────────────────────────────────────────
//
// Standalone function (not inside the plugin) used by ingestion routes.
// Extracts prefix (first 8 chars) and computes SHA-256 hash, then looks up
// an active key matching both. Returns workspaceId + keyId or null.
//
// Safe to call without withWorkspace — api_keys lookup is non-tenant (uses
// bare sql with workspace_id as a filter, not RLS).

export async function verifyApiKey(
  rawKey: string
): Promise<{ workspaceId: string; keyId: string } | null> {
  if (!rawKey || rawKey.length < 8) return null

  const prefix = rawKey.slice(0, 8)
  const hash = crypto.createHash("sha256").update(rawKey).digest("hex")

  // Use the shared sql connection (not RLS-scoped — api_keys lookup is non-tenant)
  const rows = await sql`
    SELECT id, workspace_id
    FROM api_keys
    WHERE key_prefix = ${prefix}
      AND key_hash = ${hash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  `

  if (rows.length === 0) return null

  const row = rows[0] as { id: string; workspace_id: string }
  return { workspaceId: row.workspace_id, keyId: row.id }
}

// ── API Key routes ─────────────────────────────────────────────────────────────

const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  // Session auth guard — all routes in this plugin require a logged-in user
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /api-keys — create API key ────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string }
    Body: { name: string }
  }>(
    "/api/workspaces/:workspaceId/api-keys",
    {
      // API keys are long-lived workspace credentials — creation is admin-only
      // (VEL-63). Combined with keys inheriting their creator's role, this stops
      // a viewer minting a key and writing through /api/v1.
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { name } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      // Generate raw key: "velo_" + 32 random bytes (hex = 64 chars) => 69 chars total
      const rawKey = "velo_" + crypto.randomBytes(32).toString("hex")
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex")
      const keyPrefix = rawKey.slice(0, 8) // "velo_xxx" — first 8 chars

      const keyId = uuidv7()

      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, created_by)
          VALUES (
            ${keyId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${name},
            ${keyPrefix},
            ${keyHash},
            ${request.userId ?? null}::uuid
          )
        `
      })

      captureEvent(request.userId as string, "api_key_created", { workspace_id: workspaceId })

      return reply.status(201).send({
        id: keyId,
        name,
        key: rawKey, // raw key returned ONLY at creation time
        prefix: keyPrefix,
      })
    }
  )

  // ── GET /api-keys — list keys (no hash) ─────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/api-keys",
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const keys = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT id, name, key_prefix AS prefix, created_at, expires_at, revoked_at
          FROM api_keys
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          ORDER BY created_at DESC
        `
      })

      return reply.send(keys)
    }
  )

  // ── DELETE /api-keys/:keyId — revoke key ─────────────────────────────────────
  fastify.delete<{
    Params: { workspaceId: string; keyId: string }
  }>(
    "/api/workspaces/:workspaceId/api-keys/:keyId",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { workspaceId, keyId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(keyId)) {
        return reply.status(400).send({ error: "Invalid keyId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT id FROM api_keys
          WHERE id = ${keyId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
            AND revoked_at IS NULL
        `
        if (rows.length === 0) return "not_found"

        await tx`
          UPDATE api_keys
          SET revoked_at = NOW()
          WHERE id = ${keyId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `
        return "ok"
      })

      if (result === "not_found") {
        return reply.status(404).send({ error: "API key not found or already revoked" })
      }

      return reply.status(204).send()
    }
  )
}

export default apiKeyRoutes
