import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"
import { captureEvent } from "../lib/posthog.js"
import { safeFetch, SsrfError } from "../lib/ssrf.js"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

/** Block webhook URLs targeting private/internal networks (SSRF prevention) */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const hostname = url.hostname.toLowerCase()
    // Block localhost
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true
    // Block private IPv4 ranges
    if (/^10\./.test(hostname)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
    if (/^192\.168\./.test(hostname)) return true
    // Block link-local and metadata
    if (/^169\.254\./.test(hostname)) return true
    // Block non-HTTPS in production
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return true
    return false
  } catch {
    return true // invalid URL = block
  }
}

const VALID_EVENTS = ["run.completed", "run_item.failed"] as const
type WebhookEvent = (typeof VALID_EVENTS)[number]

function isValidEvent(value: string): value is WebhookEvent {
  return (VALID_EVENTS as readonly string[]).includes(value)
}

// ── Webhook CRUD routes ──────────────────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/projects/:projectId/webhooks
// All handlers require auth + workspace check + withWorkspace.
// reply.send() called AFTER withWorkspace completes (never inside).

const webhookRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ───────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /webhooks — create a webhook ────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { endpoint_url: string; events: string[] }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/webhooks",
    {
      schema: {
        body: {
          type: "object",
          required: ["endpoint_url", "events"],
          properties: {
            endpoint_url: { type: "string", format: "uri", minLength: 1 },
            events: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { endpoint_url, events } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      if (isPrivateUrl(endpoint_url)) {
        return reply.status(400).send({ error: "Webhook URL must be a public HTTPS endpoint" })
      }

      // Validate event types
      const invalidEvents = events.filter((e) => !isValidEvent(e))
      if (invalidEvents.length > 0) {
        return reply.status(400).send({
          error: `Invalid event types: ${invalidEvents.join(", ")}. Valid types: ${VALID_EVENTS.join(", ")}`,
        })
      }

      const webhookId = uuidv7()
      const secret = crypto.randomBytes(32).toString("hex")
      const createdBy = request.userId

      const webhook = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          INSERT INTO webhooks (id, workspace_id, project_id, endpoint_url, secret, events, active, created_by)
          VALUES (
            ${webhookId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${endpoint_url},
            ${secret},
            ${events}::text[],
            true,
            ${createdBy ?? null}::uuid
          )
          RETURNING id, workspace_id, project_id, endpoint_url, events, active, created_by, created_at
        `
        return rows[0] as Record<string, unknown>
      })

      captureEvent(request.userId as string, "webhook_created", {
        workspace_id: workspaceId,
        project_id: projectId,
        events,
      })

      // Return with secret — shown once
      return reply.status(201).send({ ...webhook, secret })
    }
  )

  // ── GET /webhooks — list webhooks (no secret) ────────────────────────────
  fastify.get<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/webhooks",
    async (request, reply) => {
      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      const webhooks = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT id, workspace_id, project_id, endpoint_url, events, active, created_by, created_at, updated_at
          FROM webhooks
          WHERE project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          ORDER BY created_at DESC
        `
      })

      return reply.send(webhooks)
    }
  )

  // ── PATCH /webhooks/:webhookId — update endpoint_url, events, active ─────
  fastify.patch<{
    Params: { workspaceId: string; projectId: string; webhookId: string }
    Body: { endpoint_url?: string; events?: string[]; active?: boolean }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/webhooks/:webhookId",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            endpoint_url: { type: "string", format: "uri", minLength: 1 },
            events: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
            },
            active: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId, webhookId } = request.params
      const { endpoint_url, events, active } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId) || !isUuid(webhookId)) {
        return reply.status(400).send({ error: "Invalid projectId or webhookId" })
      }

      // Validate events if provided
      if (events) {
        const invalidEvents = events.filter((e) => !isValidEvent(e))
        if (invalidEvents.length > 0) {
          return reply.status(400).send({
            error: `Invalid event types: ${invalidEvents.join(", ")}. Valid types: ${VALID_EVENTS.join(", ")}`,
          })
        }
      }

      if (endpoint_url === undefined && events === undefined && active === undefined) {
        return reply.status(400).send({ error: "No fields to update" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const urlFrag = endpoint_url !== undefined ? tx`endpoint_url = ${endpoint_url},` : tx``
        const eventsFrag = events !== undefined ? tx`events = ${events}::text[],` : tx``
        const activeFrag = active !== undefined ? tx`active = ${active},` : tx``

        const rows = await tx`
          UPDATE webhooks
          SET ${urlFrag} ${eventsFrag} ${activeFrag} updated_at = NOW()
          WHERE id = ${webhookId}::uuid
            AND project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id, workspace_id, project_id, endpoint_url, events, active, created_by, created_at, updated_at
        `
        return rows.length > 0 ? rows[0] as Record<string, unknown> : null
      })

      if (!result) {
        return reply.status(404).send({ error: "Webhook not found" })
      }

      return reply.send(result)
    }
  )

  // ── DELETE /webhooks/:webhookId — delete a webhook ───────────────────────
  fastify.delete<{
    Params: { workspaceId: string; projectId: string; webhookId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/webhooks/:webhookId",
    async (request, reply) => {
      const { workspaceId, projectId, webhookId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId) || !isUuid(webhookId)) {
        return reply.status(400).send({ error: "Invalid projectId or webhookId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          DELETE FROM webhooks
          WHERE id = ${webhookId}::uuid
            AND project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `
        return rows.length > 0 ? "deleted" as const : "not_found" as const
      })

      if (result === "not_found") {
        return reply.status(404).send({ error: "Webhook not found" })
      }

      return reply.status(204).send()
    }
  )

  // ── POST /webhooks/:webhookId/test — send test ping ──────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string; webhookId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/webhooks/:webhookId/test",
    async (request, reply) => {
      const { workspaceId, projectId, webhookId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId) || !isUuid(webhookId)) {
        return reply.status(400).send({ error: "Invalid projectId or webhookId" })
      }

      // Look up webhook
      const webhook = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT id, endpoint_url, secret
          FROM webhooks
          WHERE id = ${webhookId}::uuid
            AND project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `
        return rows.length > 0 ? rows[0] as unknown as { id: string; endpoint_url: string; secret: string } : null
      })

      if (!webhook) {
        return reply.status(404).send({ error: "Webhook not found" })
      }

      // Build test payload
      const testPayload = {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        webhook_id: webhookId,
      }

      const payloadStr = JSON.stringify(testPayload)
      const hmac = crypto
        .createHmac("sha256", webhook.secret)
        .update(payloadStr)
        .digest("hex")

      // POST with 10s timeout, SSRF-guarded (resolves + validates the target IPs
      // and refuses redirects — the stored URL passed isPrivateUrl() at creation
      // but could resolve to a private address by now)
      const startTime = Date.now()
      try {
        const response = await safeFetch(
          webhook.endpoint_url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Velo-Signature": `sha256=${hmac}`,
              "X-Velo-Event": "test.ping",
              "X-Velo-Delivery": `test-${webhookId}`,
            },
            body: payloadStr,
          },
          10_000
        )

        const responseTimeMs = Date.now() - startTime
        const success = response.status >= 200 && response.status < 300

        return reply.send({
          success,
          status_code: response.status,
          response_time_ms: responseTimeMs,
        })
      } catch (err) {
        const responseTimeMs = Date.now() - startTime
        const message = err instanceof Error ? err.message : "Unknown error"
        const friendly =
          err instanceof SsrfError
            ? message
            : message.includes("abort") || message.includes("timeout")
              ? "Timeout (10s)"
              : message
        return reply.send({
          success: false,
          status_code: null,
          response_time_ms: responseTimeMs,
          error: friendly,
        })
      }
    }
  )
}

export default webhookRoutes
