import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { encrypt } from "../lib/encryption.js"
import {
  resolveAnthropicKey,
  validateAnthropicKey,
  invalidateAnthropicClient,
} from "../lib/anthropic.js"
import { captureEvent } from "../lib/posthog.js"

// ── AI provider key management (per-workspace BYO Anthropic key) ──────────────
// Base path: /api/workspaces/:workspaceId/ai

const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /ai/status — is a Claude key configured, and where from? ──────────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/ai/status",
    async (request, reply) => {
      const { workspaceId } = request.params
      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const resolved = await resolveAnthropicKey(workspaceId)
      return reply.send({
        configured: resolved !== null,
        source: resolved?.source ?? null,
      })
    }
  )

  // ── PUT /ai/api-key — set (or rotate) the workspace's Claude key ───────────
  fastify.put<{
    Params: { workspaceId: string }
    Body: { api_key: string }
  }>(
    "/api/workspaces/:workspaceId/ai/api-key",
    {
      schema: {
        body: {
          type: "object",
          required: ["api_key"],
          properties: { api_key: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { api_key } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      // Validate with a no-token models.list() call before storing.
      const ok = await validateAnthropicKey(api_key)
      if (!ok) {
        return reply.status(400).send({ error: "Invalid API key — could not authenticate with Anthropic" })
      }

      const enc = encrypt(api_key)

      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          INSERT INTO workspace_integration_secrets (workspace_id, provider, secret_enc, created_by, updated_at)
          VALUES (
            current_setting('app.workspace_id', true)::uuid,
            'anthropic',
            ${enc},
            ${request.userId}::uuid,
            NOW()
          )
          ON CONFLICT (workspace_id, provider)
          DO UPDATE SET secret_enc = ${enc}, updated_at = NOW()
        `
      })

      invalidateAnthropicClient(workspaceId)
      captureEvent(request.userId, "ai_key_configured", { workspace_id: workspaceId })

      return reply.send({ saved: true, configured: true, source: "workspace" })
    }
  )

  // ── DELETE /ai/api-key — remove the workspace key (env fallback may remain) ─
  fastify.delete<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/ai/api-key",
    async (request, reply) => {
      const { workspaceId } = request.params
      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          DELETE FROM workspace_integration_secrets
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
            AND provider = 'anthropic'
        `
      })

      invalidateAnthropicClient(workspaceId)

      // Report whether the instance env key still provides coverage.
      const resolved = await resolveAnthropicKey(workspaceId)
      return reply.send({
        removed: true,
        configured: resolved !== null,
        source: resolved?.source ?? null,
      })
    }
  )
}

export default aiRoutes
