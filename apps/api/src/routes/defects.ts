import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

// ── Defects routes ────────────────────────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/defects
// All handlers:
//   1. Check session (401 if no userId)
//   2. Verify request.workspaceId matches :workspaceId param (403 if mismatch)
//   3. Use withWorkspace for every DB query — no bare sql on tenant tables
//   4. reply.send() called AFTER withWorkspace completes (never inside)
//
// Note: external_id and external_url are NULL at creation — Linear integration is Phase 5.

const defectsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ─────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /defects — file a defect linked to a run item (TR-05) ────────────
  // Body: { run_item_id: string, title: string, description?: string }
  fastify.post<{
    Params: { workspaceId: string }
    Body: { run_item_id: string; title: string; description?: string }
  }>(
    "/api/workspaces/:workspaceId/defects",
    {
      schema: {
        body: {
          type: "object",
          required: ["run_item_id", "title"],
          properties: {
            run_item_id: { type: "string" },
            title: { type: "string", minLength: 1, maxLength: 500 },
            description: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { run_item_id, title } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(run_item_id)) {
        return reply.status(400).send({ error: "run_item_id must be a valid UUID" })
      }

      const defectId = uuidv7()
      const safeTitle = title.replace(/'/g, "''")
      const createdBy = request.userId

      const defect = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx.unsafe(`
          INSERT INTO defects (id, workspace_id, run_item_id, title, created_by)
          VALUES (
            '${defectId}',
            current_setting('app.workspace_id', true)::uuid,
            '${run_item_id}',
            '${safeTitle}',
            ${createdBy ? `'${createdBy}'` : "NULL"}
          )
          RETURNING id, workspace_id, run_item_id, external_id, external_url, title, created_by, created_at, updated_at
        `)

        return rows[0]
      })

      return reply.status(201).send(defect)
    }
  )

  // ── GET /defects — list defects for the workspace (TR-05) ─────────────────
  // Query params: run_item_id? for filtering
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { run_item_id?: string }
  }>(
    "/api/workspaces/:workspaceId/defects",
    async (request, reply) => {
      const { workspaceId } = request.params
      const { run_item_id } = request.query

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (run_item_id !== undefined && !isUuid(run_item_id)) {
        return reply.status(400).send({ error: "run_item_id must be a valid UUID" })
      }

      const defects = await withWorkspace(workspaceId, async (tx) => {
        const itemFilter = run_item_id ? `AND d.run_item_id = '${run_item_id}'` : ""

        return tx.unsafe(`
          SELECT
            d.id, d.workspace_id, d.run_item_id, d.external_id, d.external_url,
            d.title, d.created_by, d.created_at, d.updated_at
          FROM defects d
          WHERE d.workspace_id = current_setting('app.workspace_id', true)::uuid
            ${itemFilter}
          ORDER BY d.created_at DESC
          LIMIT 200
        `)
      })

      return reply.send(defects)
    }
  )
}

export default defectsRoutes
