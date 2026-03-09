import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"

// UUID v7 validation regex (matches uuidv7 format)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Also accept UUID v4 for existing data compatibility
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value) || UUID_ANY_RE.test(value)
}

// ── Suite routes ──────────────────────────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/projects/:projectId/suites
// All handlers:
//   1. Check session (userId must be set — 401 if not)
//   2. Verify request.workspaceId matches :workspaceId param — 403 if mismatch
//   3. Use withWorkspace(workspaceId, fn) for every DB query — no bare sql

const suitesRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ─────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /suites — recursive CTE flat tree with depth ──────────────────────
  fastify.get<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites",
    async (request, reply) => {
      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      const suites = await withWorkspace(workspaceId, async (tx) => {
        // Recursive CTE: workspace_id filter on BOTH anchor AND recursive branch.
        // Uses tx.unsafe because:
        //  - current_setting() is a PostgreSQL function reference (not parameterizable)
        //  - projectId is UUID-validated above before interpolation
        //  - withWorkspace has already validated workspaceId as UUID
        return tx.unsafe(`
          WITH RECURSIVE suite_tree AS (
            SELECT id, name, parent_id, position, 0 AS depth
            FROM   suites
            WHERE  project_id = '${projectId}'
              AND  parent_id IS NULL
              AND  workspace_id = current_setting('app.workspace_id', true)::uuid

            UNION ALL

            SELECT s.id, s.name, s.parent_id, s.position, st.depth + 1
            FROM   suites s
            JOIN   suite_tree st ON s.parent_id = st.id
            WHERE  s.workspace_id = current_setting('app.workspace_id', true)::uuid
          )
          SELECT * FROM suite_tree ORDER BY depth, position
        `)
      })

      return reply.send(suites)
    }
  )

  // ── POST /suites — create suite ───────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { name: string; parent_id?: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            parent_id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { name, parent_id } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      if (parent_id !== undefined && !isUuid(parent_id)) {
        return reply.status(400).send({ error: "Invalid parent_id" })
      }

      const suite = await withWorkspace(workspaceId, async (tx) => {
        // Compute position: MAX(position) among siblings + 1000, or 1000 if no siblings
        const parentFilter = parent_id
          ? `parent_id = '${parent_id}'`
          : `parent_id IS NULL`

        const maxRows = await tx.unsafe(`
          SELECT COALESCE(MAX(position), 0) AS max_pos
          FROM suites
          WHERE project_id = '${projectId}'
            AND ${parentFilter}
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `)

        const maxPos = parseInt(String((maxRows[0] as unknown as { max_pos: string | number }).max_pos ?? "0"))
        const position = maxPos + 1000
        const id = uuidv7()

        // Escape single quotes in name to prevent SQL injection
        const safeName = name.replace(/'/g, "''")

        const inserted = await tx.unsafe(`
          INSERT INTO suites (id, workspace_id, project_id, parent_id, name, position)
          VALUES (
            '${id}',
            current_setting('app.workspace_id', true)::uuid,
            '${projectId}',
            ${parent_id ? `'${parent_id}'` : "NULL"},
            '${safeName}',
            ${position}
          )
          RETURNING id, workspace_id, project_id, parent_id, name, position, created_at
        `)

        return inserted[0]
      })

      return reply.status(201).send(suite)
    }
  )

  // ── PATCH /suites/:suiteId — rename ───────────────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string; projectId: string; suiteId: string }
    Body: { name: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/:suiteId",
    {
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
      const { workspaceId, projectId, suiteId } = request.params
      const { name } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(suiteId)) {
        return reply.status(400).send({ error: "Invalid suiteId" })
      }

      const safeName = name.replace(/'/g, "''")

      const updated = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx.unsafe(`
          UPDATE suites
          SET name = '${safeName}', updated_at = NOW()
          WHERE id = '${suiteId}'
            AND project_id = '${projectId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id, name, position, parent_id
        `)
        return rows[0]
      })

      if (!updated) return reply.status(404).send({ error: "Suite not found" })

      return reply.send(updated)
    }
  )

  // ── PATCH /suites/:suiteId/position — reorder (TC-04) ────────────────────
  // Body: { position: number }
  //   position >= 0 : single-row UPDATE (gap-based midpoint from UI)
  //   position === -1 : gap collapsed signal → renumber all sibling suites at 1000, 2000, ...
  fastify.patch<{
    Params: { workspaceId: string; projectId: string; suiteId: string }
    Body: { position: number }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/:suiteId/position",
    {
      schema: {
        body: {
          type: "object",
          required: ["position"],
          properties: {
            position: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId, suiteId } = request.params
      const { position } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(suiteId)) {
        return reply.status(400).send({ error: "Invalid suiteId" })
      }

      if (!Number.isInteger(position) || (position < -1)) {
        return reply.status(400).send({ error: "position must be -1 or a non-negative integer" })
      }

      if (position === -1) {
        // Gap collapsed — renumber all siblings under same parent_id
        await withWorkspace(workspaceId, async (tx) => {
          // 1. Get this suite's parent_id
          const suiteRows = await tx.unsafe(`
            SELECT parent_id FROM suites
            WHERE id = '${suiteId}'
              AND project_id = '${projectId}'
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
          `)
          if (suiteRows.length === 0) return

          const parentId: string | null = (suiteRows[0] as unknown as { parent_id: string | null }).parent_id ?? null
          const parentFilter = parentId !== null
            ? `AND parent_id = '${parentId}'`
            : "AND parent_id IS NULL"

          // 2. Fetch all siblings ordered by current position
          const siblings = await tx.unsafe(`
            SELECT id FROM suites
            WHERE project_id = '${projectId}'
              ${parentFilter}
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
            ORDER BY position
          `)

          // 3. Renumber each at 1000-increments
          for (let i = 0; i < siblings.length; i++) {
            const row = siblings[i] as unknown as { id: string }
            await tx.unsafe(`
              UPDATE suites SET position = ${(i + 1) * 1000}
              WHERE id = '${row.id}'
            `)
          }
        })

        return reply.status(204).send()
      }

      // Single-row update — common path (O(1) query)
      const updated = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx.unsafe(`
          UPDATE suites
          SET position = ${position}, updated_at = NOW()
          WHERE id = '${suiteId}'
            AND project_id = '${projectId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id, name, position, parent_id
        `)
        return rows[0]
      })

      if (!updated) return reply.status(404).send({ error: "Suite not found" })

      return reply.send(updated)
    }
  )

  // ── DELETE /suites/:suiteId — hard delete ─────────────────────────────────
  // test_cases.suite_id is ON DELETE SET NULL — cases are unparented, not deleted
  fastify.delete<{
    Params: { workspaceId: string; projectId: string; suiteId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/:suiteId",
    async (request, reply) => {
      const { workspaceId, projectId, suiteId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(suiteId)) {
        return reply.status(400).send({ error: "Invalid suiteId" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx.unsafe(`
          DELETE FROM suites
          WHERE id = '${suiteId}'
            AND project_id = '${projectId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `)
      })

      return reply.status(204).send()
    }
  )
}

export default suitesRoutes
