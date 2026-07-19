import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace, type WorkspaceSql } from "../db/tenant.js"
import { requireEditor } from "../plugins/require-editor.js"

// Recursively soft-delete suites: the given suites, all descendant suites, and
// every case within that subtree (VEL-31 — deleting a suite recycles its cases,
// restorable together). The recursive CTE walks parent_id regardless of
// deleted_at so it also covers already-partially-deleted subtrees.
async function softDeleteSuiteSubtree(
  tx: WorkspaceSql,
  projectId: string,
  ids: string[],
  deletedBy: string
): Promise<void> {
  await tx`
    WITH RECURSIVE subtree AS (
      SELECT id FROM suites
      WHERE id = ANY(${ids}::uuid[])
        AND project_id = ${projectId}::uuid
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
      UNION ALL
      SELECT s.id FROM suites s
      JOIN subtree ON s.parent_id = subtree.id
      WHERE s.workspace_id = current_setting('app.workspace_id', true)::uuid
    ),
    del_suites AS (
      UPDATE suites SET deleted_at = NOW(), deleted_by = ${deletedBy}::uuid
      WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL
      RETURNING id
    )
    UPDATE test_cases SET deleted_at = NOW(), deleted_by = ${deletedBy}::uuid
    WHERE suite_id IN (SELECT id FROM subtree) AND deleted_at IS NULL
  `
}

// Reverse of softDeleteSuiteSubtree — restore the subtree (powers Undo and, later,
// the recycle-bin restore).
async function restoreSuiteSubtree(tx: WorkspaceSql, projectId: string, ids: string[]): Promise<void> {
  await tx`
    WITH RECURSIVE subtree AS (
      SELECT id FROM suites
      WHERE id = ANY(${ids}::uuid[])
        AND project_id = ${projectId}::uuid
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
      UNION ALL
      SELECT s.id FROM suites s
      JOIN subtree ON s.parent_id = subtree.id
      WHERE s.workspace_id = current_setting('app.workspace_id', true)::uuid
    ),
    res_suites AS (
      UPDATE suites SET deleted_at = NULL
      WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NOT NULL
      RETURNING id
    )
    UPDATE test_cases SET deleted_at = NULL
    WHERE suite_id IN (SELECT id FROM subtree) AND deleted_at IS NOT NULL
  `
}

// Permanently delete a soft-deleted suite subtree and every soft-deleted case
// within it (VEL-31 purge). Run history is preserved: run_items that referenced
// a purged case are detached (test_case_id → NULL) rather than cascade-deleted,
// so their immutable case_snapshot/case_title keep the run intact. Done as
// separate statements (not one CTE) to avoid FK-trigger ordering hazards between
// deleting cases and the suite's ON DELETE SET NULL on test_cases.suite_id.
async function purgeSuiteSubtree(tx: WorkspaceSql, projectId: string, ids: string[]): Promise<void> {
  const subtree = await tx<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM suites
      WHERE id = ANY(${ids}::uuid[])
        AND project_id = ${projectId}::uuid
        AND deleted_at IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
      UNION ALL
      SELECT s.id FROM suites s
      JOIN subtree ON s.parent_id = subtree.id
      WHERE s.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
    SELECT id FROM subtree
  `
  const suiteIds = subtree.map((r) => r.id)
  if (suiteIds.length === 0) return

  // Detach run_items from the cases we're about to purge (keep their snapshots).
  await tx`
    UPDATE run_items SET test_case_id = NULL
    WHERE test_case_id IN (
      SELECT id FROM test_cases
      WHERE suite_id = ANY(${suiteIds}::uuid[]) AND deleted_at IS NOT NULL
    )
  `
  // Permanently remove the soft-deleted cases (their steps cascade).
  await tx`
    DELETE FROM test_cases
    WHERE suite_id = ANY(${suiteIds}::uuid[]) AND deleted_at IS NOT NULL
  `
  // Permanently remove the suites (self-ref parent_id carries no FK cascade).
  await tx`
    DELETE FROM suites WHERE id = ANY(${suiteIds}::uuid[]) AND deleted_at IS NOT NULL
  `
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
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
        return tx`
          WITH RECURSIVE suite_tree AS (
            SELECT id, name, description, parent_id, position, 0 AS depth
            FROM   suites
            WHERE  project_id = ${projectId}::uuid
              AND  parent_id IS NULL
              AND  deleted_at IS NULL
              AND  workspace_id = current_setting('app.workspace_id', true)::uuid

            UNION ALL

            SELECT s.id, s.name, s.description, s.parent_id, s.position, st.depth + 1
            FROM   suites s
            JOIN   suite_tree st ON s.parent_id = st.id
            WHERE  s.deleted_at IS NULL
              AND  s.workspace_id = current_setting('app.workspace_id', true)::uuid
          )
          SELECT * FROM suite_tree ORDER BY depth, position
        ` as unknown as { id: string; name: string; description: string | null; parent_id: string | null; position: number; depth: number }[]
      })

      return reply.send(suites)
    }
  )

  // ── POST /suites — create suite ───────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { name: string; description?: string; parent_id?: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites",
    {
      preHandler: [requireEditor],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            description: { type: "string", maxLength: 2000 },
            parent_id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { name, description, parent_id } = request.body

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
        const parentFilter = parent_id
          ? tx`parent_id = ${parent_id}::uuid`
          : tx`parent_id IS NULL`

        const maxRows = await tx`
          SELECT COALESCE(MAX(position), 0) AS max_pos
          FROM suites
          WHERE project_id = ${projectId}::uuid
            AND ${parentFilter}
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        ` as unknown as { max_pos: string | number }[]

        const maxPos = parseInt(String(maxRows[0]?.max_pos ?? "0"))
        const position = maxPos + 1000
        const id = uuidv7()

        const inserted = await tx`
          INSERT INTO suites (id, workspace_id, project_id, parent_id, name, description, position)
          VALUES (
            ${id}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${parent_id ?? null}::uuid,
            ${name},
            ${description ?? null},
            ${position}
          )
          RETURNING id, workspace_id, project_id, parent_id, name, description, position, created_at
        `

        return inserted[0]
      })

      return reply.status(201).send(suite)
    }
  )

  // ── PATCH /suites/:suiteId — update name and/or description ────────────────
  fastify.patch<{
    Params: { workspaceId: string; projectId: string; suiteId: string }
    Body: { name?: string; description?: string | null }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/:suiteId",
    {
      preHandler: [requireEditor],
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            description: { type: ["string", "null"], maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId, suiteId } = request.params
      const { name, description } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }
      if (!isUuid(suiteId)) {
        return reply.status(400).send({ error: "Invalid suiteId" })
      }
      if (name === undefined && description === undefined) {
        return reply.status(400).send({ error: "Nothing to update" })
      }

      const updated = await withWorkspace(workspaceId, async (tx) => {
        const setName = name !== undefined ? tx`name = ${name},` : tx``
        const setDesc = description !== undefined ? tx`description = ${description},` : tx``
        const rows = await tx`
          UPDATE suites
          SET ${setName} ${setDesc} updated_at = NOW()
          WHERE id = ${suiteId}::uuid
            AND project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id, name, description, position, parent_id
        `
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
      preHandler: [requireEditor],
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
        await withWorkspace(workspaceId, async (tx) => {
          const suiteRows = await tx`
            SELECT parent_id FROM suites
            WHERE id = ${suiteId}::uuid
              AND project_id = ${projectId}::uuid
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
          ` as unknown as { parent_id: string | null }[]
          if (suiteRows.length === 0) return

          const parentId: string | null = suiteRows[0]?.parent_id ?? null
          const parentFilter = parentId !== null
            ? tx`AND parent_id = ${parentId}::uuid`
            : tx`AND parent_id IS NULL`

          const siblings = await tx`
            SELECT id FROM suites
            WHERE project_id = ${projectId}::uuid
              ${parentFilter}
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
            ORDER BY position
          ` as unknown as { id: string }[]

          for (let i = 0; i < siblings.length; i++) {
            const row = siblings[i] as { id: string }
            const newPos = (i + 1) * 1000
            await tx`
              UPDATE suites SET position = ${newPos}
              WHERE id = ${row.id}::uuid
            `
          }
        })

        return reply.status(204).send()
      }

      const updated = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          UPDATE suites
          SET position = ${position}, updated_at = NOW()
          WHERE id = ${suiteId}::uuid
            AND project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id, name, position, parent_id
        `
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
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId, suiteId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(suiteId)) {
        return reply.status(400).send({ error: "Invalid suiteId" })
      }

      await withWorkspace(workspaceId, (tx) => softDeleteSuiteSubtree(tx, projectId, [suiteId], request.userId))

      return reply.status(204).send()
    }
  )
  // ── POST /suites/bulk-delete — soft-delete multiple suites at once ─────────
  // Body: { ids: string[] }
  // Recursively soft-deletes each suite's subtree (suites + their cases), VEL-31.
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { ids: string[] }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/bulk-delete",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { ids } = request.body ?? {}

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: "ids array is required" })
      }

      if (ids.some((id) => typeof id !== "string" || !isUuid(id))) {
        return reply.status(400).send({ error: "Invalid suite id in array" })
      }

      await withWorkspace(workspaceId, (tx) => softDeleteSuiteSubtree(tx, projectId, ids, request.userId))

      return reply.status(204).send()
    }
  )

  // ── POST /suites/bulk-restore — restore soft-deleted suites (Undo / recycle bin)
  // Body: { ids: string[] } — restores each suite's subtree (suites + their cases).
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { ids: string[] }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/bulk-restore",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { ids } = request.body ?? {}

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: "ids array is required" })
      }

      if (ids.some((id) => typeof id !== "string" || !isUuid(id))) {
        return reply.status(400).send({ error: "Invalid suite id in array" })
      }

      await withWorkspace(workspaceId, (tx) => restoreSuiteSubtree(tx, projectId, ids))

      return reply.status(204).send()
    }
  )

  // ── POST /suites/bulk-purge — permanently delete soft-deleted suites (VEL-31)
  // Body: { ids: string[] } — purges each suite's subtree (suites + their cases).
  // Only affects rows already in the recycle bin (deleted_at IS NOT NULL).
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { ids: string[] }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/suites/bulk-purge",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { ids } = request.body ?? {}

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: "ids array is required" })
      }

      if (ids.some((id) => typeof id !== "string" || !isUuid(id))) {
        return reply.status(400).send({ error: "Invalid suite id in array" })
      }

      await withWorkspace(workspaceId, (tx) => purgeSuiteSubtree(tx, projectId, ids))

      return reply.status(204).send()
    }
  )

  // ── GET /recycle-bin — soft-deleted items for the project (VEL-31) ───────────
  // Returns deleted suites and deleted cases. Cases recycled as part of a deleted
  // suite are omitted (they belong to the suite item, restored with it).
  fastify.get<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/recycle-bin",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const data = await withWorkspace(workspaceId, async (tx) => {
        const suites = await tx`
          SELECT s.id, s.name, s.deleted_at, u.name AS deleted_by_name
          FROM suites s
          LEFT JOIN users u ON u.id = s.deleted_by
          WHERE s.project_id = ${projectId}::uuid
            AND s.deleted_at IS NOT NULL
            AND s.workspace_id = current_setting('app.workspace_id', true)::uuid
          ORDER BY s.deleted_at DESC
        ` as unknown as { id: string; name: string; deleted_at: string; deleted_by_name: string | null }[]

        const cases = await tx`
          SELECT c.id, c.title, c.deleted_at, u.name AS deleted_by_name
          FROM test_cases c
          LEFT JOIN users u ON u.id = c.deleted_by
          WHERE c.project_id = ${projectId}::uuid
            AND c.deleted_at IS NOT NULL
            AND (c.suite_id IS NULL OR c.suite_id NOT IN (
              SELECT id FROM suites WHERE deleted_at IS NOT NULL
            ))
            AND c.workspace_id = current_setting('app.workspace_id', true)::uuid
          ORDER BY c.deleted_at DESC
        ` as unknown as { id: string; title: string; deleted_at: string; deleted_by_name: string | null }[]

        // Runs are an admin-only concern end-to-end (delete/restore/purge all
        // require admin), so only admins see them in the bin. Editors get none.
        const runs =
          request.userRole === "admin"
            ? ((await tx`
                SELECT r.id, r.name, r.deleted_at, u.name AS deleted_by_name
                FROM test_runs r
                LEFT JOIN users u ON u.id = r.deleted_by
                WHERE r.project_id = ${projectId}::uuid
                  AND r.deleted_at IS NOT NULL
                  AND r.workspace_id = current_setting('app.workspace_id', true)::uuid
                ORDER BY r.deleted_at DESC
              `) as unknown as { id: string; name: string; deleted_at: string; deleted_by_name: string | null }[])
            : []

        return { suites, cases, runs }
      })

      return reply.send(data)
    }
  )
}

export default suitesRoutes
