import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { encrypt } from "../lib/encryption.js"
import {
  getAiStatus,
  validateProviderKey,
  setActiveProvider,
  invalidateAiClient,
  isAiProvider,
  type AiProvider,
} from "../lib/ai.js"
import { captureEvent } from "../lib/posthog.js"
import { requireAdmin } from "../plugins/require-admin.js"

// ── AI provider key management (per-workspace BYO Anthropic/OpenAI key) ───────
// Base path: /api/workspaces/:workspaceId/ai

const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /ai/status — active provider + per-provider configured state ──────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/ai/status",
    async (request, reply) => {
      const { workspaceId } = request.params
      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }
      return reply.send(await getAiStatus(workspaceId))
    }
  )

  // ── PUT /ai/keys/:provider — set (or rotate) a provider's key ─────────────
  fastify.put<{
    Params: { workspaceId: string; provider: string }
    Body: { api_key: string }
  }>(
    "/api/workspaces/:workspaceId/ai/keys/:provider",
    {
      // Setting a workspace-wide integration credential is admin-only.
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["api_key"],
          properties: { api_key: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, provider } = request.params
      const { api_key } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }
      if (!isAiProvider(provider)) {
        return reply.status(400).send({ error: "Unknown AI provider" })
      }

      const ok = await validateProviderKey(provider, api_key)
      if (!ok) {
        return reply.status(400).send({ error: `Invalid API key — could not authenticate with ${provider}` })
      }

      const enc = encrypt(api_key)
      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          INSERT INTO workspace_integration_secrets (workspace_id, provider, secret_enc, created_by, updated_at)
          VALUES (
            current_setting('app.workspace_id', true)::uuid,
            ${provider},
            ${enc},
            ${request.userId}::uuid,
            NOW()
          )
          ON CONFLICT (workspace_id, provider)
          DO UPDATE SET secret_enc = ${enc}, updated_at = NOW()
        `
      })

      invalidateAiClient(workspaceId)
      captureEvent(request.userId, "ai_key_configured", { workspace_id: workspaceId, provider })

      return reply.send(await getAiStatus(workspaceId))
    }
  )

  // ── DELETE /ai/keys/:provider — remove a provider's key ───────────────────
  fastify.delete<{ Params: { workspaceId: string; provider: string } }>(
    "/api/workspaces/:workspaceId/ai/keys/:provider",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { workspaceId, provider } = request.params
      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }
      if (!isAiProvider(provider)) {
        return reply.status(400).send({ error: "Unknown AI provider" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          DELETE FROM workspace_integration_secrets
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
            AND provider = ${provider}
        `
      })

      invalidateAiClient(workspaceId)
      return reply.send(await getAiStatus(workspaceId))
    }
  )

  // ── PUT /ai/provider — set the active provider ────────────────────────────
  fastify.put<{
    Params: { workspaceId: string }
    Body: { provider: string }
  }>(
    "/api/workspaces/:workspaceId/ai/provider",
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["provider"],
          properties: { provider: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const provider = request.body.provider as AiProvider

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }
      if (!isAiProvider(provider)) {
        return reply.status(400).send({ error: "Unknown AI provider" })
      }

      await setActiveProvider(workspaceId, provider)
      return reply.send(await getAiStatus(workspaceId))
    }
  )
}

export default aiRoutes
