import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import { sql } from "../db/client.js"

// ── Linear Inbound Webhook Receiver ──────────────────────────────────────────
// PUBLIC endpoint — no auth required. Linear calls this directly.
// Signature verification via HMAC-SHA256 replaces session auth.
// Must be registered OUTSIDE auth-guarded plugins.

const linearWebhookRoutes: FastifyPluginAsync = async (fastify) => {

  // Capture the raw request bytes so the HMAC is verified against exactly what
  // Linear signed. Re-serializing the parsed body (JSON.stringify) does not
  // reproduce the original key order/whitespace/escaping and breaks verification.
  // Scoped to this encapsulated plugin, so other routes keep the default parser.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      ;(req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer
      try {
        const buf = body as Buffer
        done(null, buf.length ? JSON.parse(buf.toString("utf8")) : {})
      } catch (err) {
        ;(err as Error & { statusCode?: number }).statusCode = 400
        done(err as Error, undefined)
      }
    }
  )

  // ── POST /api/webhooks/linear — receive Linear webhook events ────────────
  fastify.post<{
    Body: Record<string, unknown>
  }>(
    "/api/webhooks/linear",
    async (request, reply) => {
      const signature = request.headers["linear-signature"] as string | undefined

      if (!signature) {
        return reply.status(400).send({ error: "Missing Linear-Signature header" })
      }

      // Raw request bytes captured by the content-type parser above — HMAC must
      // be over exactly what Linear signed, not a re-serialization of the body.
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0)

      // Extract organization ID from payload to look up the signing secret
      const payload = request.body as {
        action?: string
        type?: string
        organizationId?: string
        webhookId?: string
        deliveryId?: string
        data?: Record<string, unknown>
      }

      if (!payload.organizationId) {
        return reply.status(400).send({ error: "Missing organizationId in payload" })
      }

      // Look up the linear_connections row by org ID (bare sql — no RLS context needed)
      const connections = await sql`
        SELECT id, workspace_id, webhook_signing_secret
        FROM linear_connections
        WHERE linear_org_id = ${payload.organizationId}
      `

      if (connections.length === 0 || !connections[0]) {
        // No connection found — return 200 to avoid leaking info
        return reply.status(200).send({ ok: true })
      }

      const connection = connections[0] as {
        id: string
        workspace_id: string
        webhook_signing_secret: string | null
      }

      if (!connection.webhook_signing_secret) {
        // No signing secret stored — reject instead of silently accepting
        fastify.log.warn({ orgId: payload.organizationId }, "Linear webhook rejected — no signing secret stored")
        return reply.status(401).send({ error: "Webhook not configured" })
      }

      // Verify HMAC-SHA256 signature
      const expectedSignature = crypto
        .createHmac("sha256", connection.webhook_signing_secret)
        .update(rawBody)
        .digest("hex")

      // Length-guard before timingSafeEqual — it throws RangeError (→ 500) on
      // buffers of differing length, which a malformed/short signature triggers.
      const sigBuf = Buffer.from(signature)
      const expBuf = Buffer.from(expectedSignature)
      const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)

      if (!isValid) {
        return reply.status(400).send({ error: "Invalid signature" })
      }

      // Idempotency check — prevent duplicate processing
      const deliveryKey = payload.webhookId && payload.deliveryId
        ? `linear:webhook:${payload.webhookId}:${payload.deliveryId}`
        : null

      if (deliveryKey) {
        const alreadySeen = await fastify.valkey.get(deliveryKey)
        if (alreadySeen) {
          return reply.status(200).send({ ok: true })
        }
        // Mark as seen with 24h TTL
        await fastify.valkey.set(deliveryKey, "1", "EX", 86400)
      }

      // Handle Issue updates
      if (payload.type === "Issue" && payload.action === "update") {
        const data = payload.data as {
          id?: string
          state?: { name?: string }
        } | undefined

        if (data?.id && data?.state?.name) {
          const externalId = data.id
          const newStatus = data.state.name

          // Find the defect by external_id scoped to the workspace that owns this connection
          const defects = await sql`
            UPDATE defects
            SET external_status = ${newStatus}, updated_at = NOW()
            WHERE external_id = ${externalId}
              AND workspace_id = ${connection.workspace_id}::uuid
            RETURNING id, run_item_id
          `

          // If defect found and linked to a run_item, publish SSE update
          if (defects.length > 0 && defects[0]) {
            const defect = defects[0] as { id: string; run_item_id: string | null }
            if (defect.run_item_id) {
              // Find the run_id for this run_item to publish SSE
              const runItems = await sql`
                SELECT run_id FROM run_items WHERE id = ${defect.run_item_id}
              `
              if (runItems.length > 0 && runItems[0]) {
                const runId = (runItems[0] as { run_id: string }).run_id
                fastify.valkey
                  .publish(
                    `run:${runId}`,
                    JSON.stringify({
                      type: "defect_status_update",
                      defectId: defect.id,
                      externalStatus: newStatus,
                      runItemId: defect.run_item_id,
                    })
                  )
                  .catch(() => {})
              }
            }
          }
        }
      }

      // Handle Issue deletion
      if (payload.type === "Issue" && payload.action === "remove") {
        const data = payload.data as { id?: string } | undefined

        if (data?.id) {
          await sql`
            UPDATE defects
            SET external_status = 'Deleted', updated_at = NOW()
            WHERE external_id = ${data.id}
              AND workspace_id = ${connection.workspace_id}::uuid
          `
        }
      }

      return reply.status(200).send({ ok: true })
    }
  )
}

export default linearWebhookRoutes
