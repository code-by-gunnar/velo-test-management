import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

// ── Runs routes ───────────────────────────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/runs
// All handlers:
//   1. Check session (401 if no userId)
//   2. Verify request.workspaceId matches :workspaceId param (403 if mismatch)
//   3. Use withWorkspace for every DB query — no bare sql on tenant tables
//   4. reply.send() called AFTER withWorkspace completes (never inside)

const runsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ─────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /runs — create run with case snapshot (TR-01) ────────────────────
  fastify.post<{
    Params: { workspaceId: string }
    Body: {
      name: string
      project_id: string
      suite_ids?: string[]
      assigned_to?: string
    }
  }>(
    "/api/workspaces/:workspaceId/runs",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "project_id"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            project_id: { type: "string" },
            suite_ids: { type: "array", items: { type: "string" } },
            assigned_to: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { name, project_id, suite_ids, assigned_to } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(project_id)) {
        return reply.status(400).send({ error: "Invalid project_id" })
      }

      if (assigned_to !== undefined && !isUuid(assigned_to)) {
        return reply.status(400).send({ error: "Invalid assigned_to" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        // 1. Get matching test cases — scoped or all project cases
        const hasSuiteFilter = suite_ids !== undefined && suite_ids.length > 0

        let cases: Array<{ id: string; title: string }>

        if (hasSuiteFilter) {
          const suiteList = suite_ids!.map((id) => `'${id}'`).join(",")
          cases = (await tx.unsafe(`
            SELECT id, title FROM test_cases
            WHERE project_id = '${project_id}'
              AND suite_id = ANY(ARRAY[${suiteList}]::uuid[])
              AND deleted_at IS NULL
            ORDER BY suite_id, position
          `)) as Array<{ id: string; title: string }>
        } else {
          cases = (await tx.unsafe(`
            SELECT id, title FROM test_cases
            WHERE project_id = '${project_id}'
              AND deleted_at IS NULL
            ORDER BY suite_id NULLS LAST, position
          `)) as Array<{ id: string; title: string }>
        }

        // 2. If 0 cases, signal 400
        if (cases.length === 0) {
          return null
        }

        // 3. INSERT test_runs
        const runId = uuidv7()
        const safeName = name.replace(/'/g, "''")
        const assignedToVal = assigned_to ? `'${assigned_to}'` : "NULL"
        const createdByVal = request.userId ? `'${request.userId}'` : "NULL"

        await tx.unsafe(`
          INSERT INTO test_runs (id, workspace_id, project_id, name, status, assigned_to, created_by, started_at)
          VALUES (
            '${runId}',
            current_setting('app.workspace_id', true)::uuid,
            '${project_id}',
            '${safeName}',
            'active',
            ${assignedToVal},
            ${createdByVal},
            NOW()
          )
        `)

        // 4. Batch INSERT run_items with case_title snapshot
        for (const tc of cases) {
          const itemId = uuidv7()
          const safeTitle = tc.title.replace(/'/g, "''")
          await tx.unsafe(`
            INSERT INTO run_items (id, workspace_id, run_id, test_case_id, case_title, status)
            VALUES (
              '${itemId}',
              current_setting('app.workspace_id', true)::uuid,
              '${runId}',
              '${tc.id}',
              '${safeTitle}',
              'untested'
            )
          `)
        }

        return { runId, item_count: cases.length }
      })

      if (result === null) {
        return reply.status(400).send({ error: "No test cases match the selected scope" })
      }

      return reply.status(201).send({
        id: result.runId,
        workspace_id: workspaceId,
        project_id,
        name,
        status: "active",
        assigned_to: assigned_to ?? null,
        item_count: result.item_count,
      })
    }
  )

  // ── GET /runs — list runs with filters (DA-03) ────────────────────────────
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { project_id: string; status?: string; assigned_to?: string }
  }>(
    "/api/workspaces/:workspaceId/runs",
    async (request, reply) => {
      const { workspaceId } = request.params
      const { project_id, status, assigned_to } = request.query

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!project_id || !isUuid(project_id)) {
        return reply.status(400).send({ error: "project_id (UUID) is required" })
      }

      const statusFilter = status ? `AND tr.status = '${status}'` : ""
      const assignedFilter = assigned_to && isUuid(assigned_to)
        ? `AND tr.assigned_to = '${assigned_to}'::uuid`
        : ""

      const runs = await withWorkspace(workspaceId, async (tx) => {
        return tx.unsafe(`
          SELECT
            tr.id, tr.name, tr.status, tr.project_id, tr.assigned_to,
            tr.created_by, tr.started_at, tr.completed_at, tr.created_at, tr.updated_at,
            COUNT(ri.id)::int AS total_items,
            COUNT(ri.id) FILTER (WHERE ri.status = 'pass')::int AS pass_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'blocked')::int AS blocked_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'skipped')::int AS skipped_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'untested')::int AS untested_count,
            u_assigned.name AS assigned_to_name,
            u_created.name AS created_by_name
          FROM test_runs tr
          LEFT JOIN run_items ri ON ri.run_id = tr.id
          LEFT JOIN users u_assigned ON u_assigned.id = tr.assigned_to
          LEFT JOIN users u_created ON u_created.id = tr.created_by
          WHERE tr.project_id = '${project_id}'
            ${statusFilter}
            ${assignedFilter}
          GROUP BY tr.id, u_assigned.name, u_created.name
          ORDER BY tr.created_at DESC
          LIMIT 100
        `)
      })

      return reply.send(runs)
    }
  )

  // ── GET /runs/:runId — run detail with stats and items ────────────────────
  fastify.get<{
    Params: { workspaceId: string; runId: string }
  }>(
    "/api/workspaces/:workspaceId/runs/:runId",
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        // Run metadata with stats
        const runRows = await tx.unsafe(`
          SELECT
            tr.id, tr.name, tr.status, tr.project_id, tr.assigned_to,
            tr.created_by, tr.started_at, tr.completed_at, tr.created_at, tr.updated_at,
            COUNT(ri.id)::int AS total_items,
            COUNT(ri.id) FILTER (WHERE ri.status = 'pass')::int AS pass_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'blocked')::int AS blocked_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'skipped')::int AS skipped_count,
            COUNT(ri.id) FILTER (WHERE ri.status = 'untested')::int AS untested_count
          FROM test_runs tr
          LEFT JOIN run_items ri ON ri.run_id = tr.id
          WHERE tr.id = '${runId}'
            AND tr.workspace_id = current_setting('app.workspace_id', true)::uuid
          GROUP BY tr.id
        `)

        if (runRows.length === 0) return null

        const run = runRows[0]

        // Run items with defect info
        const items = await tx.unsafe(`
          SELECT
            ri.id, ri.test_case_id, ri.case_title, ri.status,
            ri.comment, ri.executed_by, ri.executed_at, ri.created_at,
            d.id AS defect_id, d.title AS defect_title,
            d.external_id AS defect_external_id, d.external_url AS defect_external_url
          FROM run_items ri
          LEFT JOIN defects d ON d.run_item_id = ri.id
          WHERE ri.run_id = '${runId}'
          ORDER BY ri.created_at
        `)

        return { run, items }
      })

      if (result === null) return reply.status(404).send({ error: "Run not found" })

      return reply.send(result)
    }
  )

  // ── PATCH /runs/:runId/abort — abort active run ───────────────────────────
  fastify.patch<{
    Params: { workspaceId: string; runId: string }
  }>(
    "/api/workspaces/:workspaceId/runs/:runId/abort",
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        // Check current status
        const rows = await tx.unsafe(`
          SELECT status FROM test_runs
          WHERE id = '${runId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `)

        if (rows.length === 0) return "not_found"

        const current = (rows[0] as unknown as { status: string }).status
        if (current !== "active") return "not_active"

        await tx.unsafe(`
          UPDATE test_runs
          SET status = 'aborted', completed_at = NOW(), updated_at = NOW()
          WHERE id = '${runId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `)

        return "ok"
      })

      if (result === "not_found") return reply.status(404).send({ error: "Run not found" })
      if (result === "not_active") return reply.status(400).send({ error: "Run is not active" })

      return reply.send({ status: "aborted" })
    }
  )

  // ── POST /runs/:runId/rerun-failures — rerun failed items (TR-07) ─────────
  fastify.post<{
    Params: { workspaceId: string; runId: string }
  }>(
    "/api/workspaces/:workspaceId/runs/:runId/rerun-failures",
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        // Get failed items from source run
        const failedItems = (await tx.unsafe(`
          SELECT ri.test_case_id, tc.title AS case_title
          FROM run_items ri
          LEFT JOIN test_cases tc ON tc.id = ri.test_case_id
          WHERE ri.run_id = '${runId}'
            AND ri.status = 'fail'
        `)) as Array<{ test_case_id: string; case_title: string | null }>

        if (failedItems.length === 0) return null

        // Get source run metadata
        const sourceRows = (await tx.unsafe(`
          SELECT name, project_id FROM test_runs
          WHERE id = '${runId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `)) as Array<{ name: string; project_id: string }>

        if (sourceRows.length === 0) return null

        const sourceRun = sourceRows[0]!
        const newRunId = uuidv7()
        const rerunName = `Rerun: ${sourceRun.name}`.replace(/'/g, "''")
        const createdByVal = request.userId ? `'${request.userId}'` : "NULL"

        // Create new run
        await tx.unsafe(`
          INSERT INTO test_runs (id, workspace_id, project_id, name, status, created_by, started_at)
          VALUES (
            '${newRunId}',
            current_setting('app.workspace_id', true)::uuid,
            '${sourceRun.project_id}',
            '${rerunName}',
            'active',
            ${createdByVal},
            NOW()
          )
        `)

        // Snapshot failed cases into new run_items
        for (const fi of failedItems) {
          const itemId = uuidv7()
          const titleVal = fi.case_title ? `'${fi.case_title.replace(/'/g, "''")}'` : "NULL"
          await tx.unsafe(`
            INSERT INTO run_items (id, workspace_id, run_id, test_case_id, case_title, status)
            VALUES (
              '${itemId}',
              current_setting('app.workspace_id', true)::uuid,
              '${newRunId}',
              '${fi.test_case_id}',
              ${titleVal},
              'untested'
            )
          `)
        }

        return { newRunId, item_count: failedItems.length }
      })

      if (result === null) {
        return reply.status(400).send({ error: "No failed items to rerun" })
      }

      return reply.status(201).send({
        id: result.newRunId,
        workspace_id: workspaceId,
        status: "active",
        item_count: result.item_count,
      })
    }
  )

  // ── GET /test-cases/:caseId/history — execution history (TR-06) ──────────
  fastify.get<{
    Params: { workspaceId: string; caseId: string }
  }>(
    "/api/workspaces/:workspaceId/test-cases/:caseId/history",
    async (request, reply) => {
      const { workspaceId, caseId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(caseId)) {
        return reply.status(400).send({ error: "Invalid caseId" })
      }

      const history = await withWorkspace(workspaceId, async (tx) => {
        return tx.unsafe(`
          SELECT
            ri.id AS run_item_id,
            ri.status,
            ri.comment,
            ri.executed_at,
            tr.id AS run_id,
            tr.name AS run_name,
            tr.created_at AS run_created_at,
            u.name AS executed_by_name
          FROM run_items ri
          JOIN test_runs tr ON tr.id = ri.run_id
          LEFT JOIN users u ON u.id = ri.executed_by
          WHERE ri.test_case_id = '${caseId}'
          ORDER BY ri.executed_at DESC NULLS LAST
          LIMIT 50
        `)
      })

      return reply.send(history)
    }
  )
}

export default runsRoutes
