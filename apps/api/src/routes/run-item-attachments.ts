import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { requireEditor } from "../plugins/require-editor.js"
import { storageEnabled, uploadObject, getPresignedUrl, deleteObjects, shouldProxyDownloads, getObjectStream } from "../lib/storage.js"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { captureEvent } from "../lib/posthog.js"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/csv", "application/json",
  "video/mp4", "video/webm",
])

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_ATTACHMENTS_PER_ITEM = 5

function fileExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(".", "")
  return ext || "bin"
}

const attachmentRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /run-items/:itemId/attachments — upload evidence ────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/attachments",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, itemId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!UUID_RE.test(itemId)) {
        return reply.status(400).send({ error: "Invalid itemId" })
      }

      if (!storageEnabled()) {
        return reply.status(503).send({ error: "File uploads not available in this environment" })
      }

      const data = await request.file({ limits: { fileSize: MAX_FILE_SIZE } })
      if (!data) {
        return reply.status(400).send({ error: "No file uploaded" })
      }

      if (!ALLOWED_TYPES.has(data.mimetype)) {
        return reply.status(400).send({
          error: `File type not allowed: ${data.mimetype}. Accepted: images, PDFs, text, video.`,
        })
      }

      const buffer = await data.toBuffer()

      if (buffer.byteLength > MAX_FILE_SIZE) {
        return reply.status(413).send({ error: "File exceeds 10MB limit" })
      }

      // Check attachment count limit
      const count = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT COUNT(*)::int AS n FROM run_item_attachments
          WHERE run_item_id = ${itemId}::uuid
        `
        return (rows[0] as unknown as { n: number }).n
      })

      if (count >= MAX_ATTACHMENTS_PER_ITEM) {
        return reply.status(409).send({ error: `Maximum ${MAX_ATTACHMENTS_PER_ITEM} attachments per test case` })
      }

      const safeFilename = path.basename(data.filename || "upload")
      const ext = fileExt(safeFilename)
      const fileId = randomUUID()
      const r2Key = `evidence/${workspaceId}/${itemId}/${fileId}.${ext}`

      await uploadObject(r2Key, buffer, data.mimetype)

      const attachment = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          INSERT INTO run_item_attachments (workspace_id, run_item_id, filename, r2_key, content_type, size_bytes, uploaded_by)
          VALUES (
            current_setting('app.workspace_id', true)::uuid,
            ${itemId}::uuid,
            ${safeFilename},
            ${r2Key},
            ${data.mimetype},
            ${buffer.byteLength},
            ${request.userId ?? null}::uuid
          )
          RETURNING id, filename, content_type, size_bytes, created_at
        `
        return rows[0] as Record<string, unknown>
      })

      captureEvent(request.userId as string, "evidence_uploaded", {
        workspace_id: workspaceId,
        content_type: data.mimetype,
      })

      return reply.status(201).send(attachment)
    }
  )

  // ── GET /run-items/:itemId/attachments — list with presigned URLs ────────
  fastify.get<{
    Params: { workspaceId: string; itemId: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/attachments",
    async (request, reply) => {
      const { workspaceId, itemId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!UUID_RE.test(itemId)) {
        return reply.status(400).send({ error: "Invalid itemId" })
      }

      const attachments = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT id, filename, r2_key, content_type, size_bytes, created_at
          FROM run_item_attachments
          WHERE run_item_id = ${itemId}::uuid
          ORDER BY created_at ASC
        `
      })

      // Resolve each attachment's browser URL (VEL-77): a same-origin proxy path
      // for private/bundled storage (works on any host, no config), or a presigned
      // URL for a public cloud endpoint. The `url` contract is unchanged, so the
      // frontend is untouched.
      const proxy = shouldProxyDownloads()
      const result = await Promise.all(
        (attachments as Array<Record<string, unknown>>).map(async (att) => {
          const r2Key = att.r2_key as string
          let url = ""
          if (storageEnabled()) {
            if (proxy) {
              url = `/api/backend/workspaces/${workspaceId}/run-items/${itemId}/attachments/${att.id as string}/download`
            } else {
              try {
                url = await getPresignedUrl(r2Key)
              } catch {
                // URL generation failed — return empty
              }
            }
          }
          return {
            id: att.id,
            filename: att.filename,
            content_type: att.content_type,
            size_bytes: att.size_bytes,
            url,
            created_at: att.created_at,
          }
        })
      )

      return reply.send(result)
    }
  )

  // ── GET /run-items/:itemId/attachments/:attachmentId/download ────────────
  // Same-origin evidence proxy (VEL-77): streams the object from internal storage
  // so the browser never needs a reachable storage host. Used when storage is
  // private/bundled (MinIO); public-cloud setups get a presigned URL from the
  // listing instead and never hit this. Session-authed (the plugin preHandler)
  // + tenant-scoped (the attachment must belong to this item AND workspace).
  fastify.get<{
    Params: { workspaceId: string; itemId: string; attachmentId: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/attachments/:attachmentId/download",
    async (request, reply) => {
      const { workspaceId, itemId, attachmentId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!UUID_RE.test(itemId) || !UUID_RE.test(attachmentId)) {
        return reply.status(400).send({ error: "Invalid ID" })
      }

      if (!storageEnabled()) {
        return reply.status(503).send({ error: "File storage not available" })
      }

      const att = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT r2_key, content_type, filename FROM run_item_attachments
          WHERE id = ${attachmentId}::uuid
            AND run_item_id = ${itemId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `
        return rows.length > 0
          ? (rows[0] as unknown as { r2_key: string; content_type: string | null; filename: string })
          : null
      })

      if (!att) {
        return reply.status(404).send({ error: "Attachment not found" })
      }

      let stream
      try {
        stream = await getObjectStream(att.r2_key)
      } catch {
        return reply.status(404).send({ error: "Object not found in storage" })
      }

      reply.header("Content-Type", att.content_type ?? stream.contentType ?? "application/octet-stream")
      if (stream.contentLength) reply.header("Content-Length", String(stream.contentLength))
      // inline so images/PDFs render in the tab (matches the old presigned behavior);
      // the filename is sanitized to a safe token to avoid header injection.
      const safeName = att.filename.replace(/[^\w.\-]/g, "_")
      reply.header("Content-Disposition", `inline; filename="${safeName}"`)
      reply.header("Cache-Control", "private, max-age=300")
      return reply.send(stream.body)
    }
  )

  // ── DELETE /run-items/:itemId/attachments/:attachmentId ──────────────────
  fastify.delete<{
    Params: { workspaceId: string; itemId: string; attachmentId: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/attachments/:attachmentId",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, itemId, attachmentId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!UUID_RE.test(itemId) || !UUID_RE.test(attachmentId)) {
        return reply.status(400).send({ error: "Invalid ID" })
      }

      const r2Key = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          DELETE FROM run_item_attachments
          WHERE id = ${attachmentId}::uuid
            AND run_item_id = ${itemId}::uuid
          RETURNING r2_key
        `
        return rows.length > 0 ? (rows[0] as unknown as { r2_key: string }).r2_key : null
      })

      if (!r2Key) {
        return reply.status(404).send({ error: "Attachment not found" })
      }

      // Best-effort R2 cleanup
      if (storageEnabled()) {
        try {
          await deleteObjects([r2Key])
        } catch {
          fastify.log.warn({ r2Key }, "Failed to delete R2 object")
        }
      }

      return reply.status(204).send()
    }
  )
}

export default attachmentRoutes
