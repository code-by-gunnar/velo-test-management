import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { Redis as Valkey } from "iovalkey"
import { withWorkspace } from "../db/tenant.js"
import { writeSSEEvent, startHeartbeat } from "../lib/sse.js"
import { computeRunStats, estimateTimeRemaining } from "../lib/run-stats.js"
import { fireWebhookEvent } from "../queues/webhook.queue.js"
import { requireEditor } from "../plugins/require-editor.js"
import { requireAdmin } from "../plugins/require-admin.js"

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
      preHandler: [requireEditor],
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
        const hasSuiteFilter = suite_ids !== undefined && suite_ids.length > 0

        let cases: Array<{ id: string; title: string }>

        if (hasSuiteFilter) {
          cases = await tx`
            SELECT id, title FROM test_cases
            WHERE project_id = ${project_id}::uuid
              AND suite_id = ANY(${suite_ids!}::uuid[])
              AND deleted_at IS NULL
            ORDER BY suite_id, position
          ` as unknown as Array<{ id: string; title: string }>
        } else {
          cases = await tx`
            SELECT id, title FROM test_cases
            WHERE project_id = ${project_id}::uuid
              AND deleted_at IS NULL
            ORDER BY suite_id NULLS LAST, position
          ` as unknown as Array<{ id: string; title: string }>
        }

        if (cases.length === 0) {
          return null
        }

        const runId = uuidv7()

        await tx`
          INSERT INTO test_runs (id, workspace_id, project_id, name, status, assigned_to, created_by, started_at)
          VALUES (
            ${runId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${project_id}::uuid,
            ${name},
            'active',
            ${assigned_to ?? null}::uuid,
            ${request.userId ?? null}::uuid,
            NOW()
          )
        `

        for (const tc of cases) {
          const itemId = uuidv7()
          await tx`
            INSERT INTO run_items (id, workspace_id, run_id, test_case_id, case_title, status)
            VALUES (
              ${itemId}::uuid,
              current_setting('app.workspace_id', true)::uuid,
              ${runId}::uuid,
              ${tc.id}::uuid,
              ${tc.title},
              'untested'
            )
          `
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

      const runs = await withWorkspace(workspaceId, async (tx) => {
        return tx`
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
          WHERE tr.project_id = ${project_id}::uuid
            ${status ? tx`AND tr.status = ${status}` : tx``}
            ${assigned_to && isUuid(assigned_to) ? tx`AND tr.assigned_to = ${assigned_to}::uuid` : tx``}
          GROUP BY tr.id, u_assigned.name, u_created.name
          ORDER BY tr.created_at DESC
          LIMIT 100
        `
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
        const runRows = await tx`
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
          WHERE tr.id = ${runId}::uuid
            AND tr.workspace_id = current_setting('app.workspace_id', true)::uuid
          GROUP BY tr.id
        ` as unknown as Array<Record<string, unknown>>

        if (runRows.length === 0) return null

        const run = runRows[0]

        const items = await tx`
          SELECT
            ri.id, ri.test_case_id, ri.case_title, ri.status,
            ri.comment, ri.executed_by, ri.executed_at, ri.created_at,
            d.id AS defect_id, d.title AS defect_title,
            d.external_id AS defect_external_id, d.external_url AS defect_external_url,
            d.external_status AS defect_external_status
          FROM run_items ri
          LEFT JOIN defects d ON d.run_item_id = ri.id
          WHERE ri.run_id = ${runId}::uuid
          ORDER BY ri.created_at
        `

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
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT status, project_id, name FROM test_runs
          WHERE id = ${runId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        ` as unknown as Array<{ status: string; project_id: string; name: string }>

        if (rows.length === 0) return { outcome: "not_found" as const }

        const run = rows[0]!
        if (run.status !== "active") return { outcome: "not_active" as const }

        await tx`
          UPDATE test_runs
          SET status = 'aborted', completed_at = NOW(), updated_at = NOW()
          WHERE id = ${runId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `

        const statsRows = await tx`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pass')::int AS pass,
            COUNT(*) FILTER (WHERE status = 'fail')::int AS fail,
            COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
            COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped
          FROM run_items
          WHERE run_id = ${runId}::uuid
        ` as unknown as Array<{
          total: number; pass: number; fail: number; blocked: number; skipped: number
        }>

        const stats = statsRows[0]!

        return {
          outcome: "ok" as const,
          projectId: run.project_id,
          runName: run.name,
          stats,
        }
      })

      if (result.outcome === "not_found") return reply.status(404).send({ error: "Run not found" })
      if (result.outcome === "not_active") return reply.status(400).send({ error: "Run is not active" })

      // Fire run.completed webhook on abort (fire-and-forget)
      if (result.outcome === "ok") {
        fireWebhookEvent(workspaceId, result.projectId, "run.completed", {
          run_id: runId,
          run_name: result.runName,
          total: result.stats.total,
          passed: result.stats.pass,
          failed: result.stats.fail,
          blocked: result.stats.blocked,
          skipped: result.stats.skipped,
          completed_at: new Date().toISOString(),
          aborted: true,
        }).catch(() => {})
      }

      return reply.send({ status: "aborted" })
    }
  )

  // ── POST /runs/:runId/rerun-failures — rerun failed items (TR-07) ─────────
  fastify.post<{
    Params: { workspaceId: string; runId: string }
  }>(
    "/api/workspaces/:workspaceId/runs/:runId/rerun-failures",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const failedItems = await tx`
          SELECT ri.test_case_id, tc.title AS case_title
          FROM run_items ri
          LEFT JOIN test_cases tc ON tc.id = ri.test_case_id
          WHERE ri.run_id = ${runId}::uuid
            AND ri.status = 'fail'
        ` as unknown as Array<{ test_case_id: string; case_title: string | null }>

        if (failedItems.length === 0) return null

        const sourceRows = await tx`
          SELECT name, project_id FROM test_runs
          WHERE id = ${runId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        ` as unknown as Array<{ name: string; project_id: string }>

        if (sourceRows.length === 0) return null

        const sourceRun = sourceRows[0]!
        const newRunId = uuidv7()
        const rerunName = `Rerun: ${sourceRun.name}`

        await tx`
          INSERT INTO test_runs (id, workspace_id, project_id, name, status, created_by, started_at)
          VALUES (
            ${newRunId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${sourceRun.project_id}::uuid,
            ${rerunName},
            'active',
            ${request.userId ?? null}::uuid,
            NOW()
          )
        `

        for (const fi of failedItems) {
          const itemId = uuidv7()
          await tx`
            INSERT INTO run_items (id, workspace_id, run_id, test_case_id, case_title, status)
            VALUES (
              ${itemId}::uuid,
              current_setting('app.workspace_id', true)::uuid,
              ${newRunId}::uuid,
              ${fi.test_case_id}::uuid,
              ${fi.case_title ?? null},
              'untested'
            )
          `
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
        return tx`
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
          WHERE ri.test_case_id = ${caseId}::uuid
          ORDER BY ri.executed_at DESC NULLS LAST
          LIMIT 50
        `
      })

      return reply.send(history)
    }
  )
  // ── GET /runs/:runId/stream — SSE real-time updates (DA-01, DA-02) ─────────
  fastify.get<{
    Params: { workspaceId: string; runId: string }
  }>(
    "/api/workspaces/:workspaceId/runs/:runId/stream",
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      const res = reply.raw

      // SSE headers — X-Accel-Buffering: no prevents Railway/nginx from buffering
      // CORS headers must be set manually because reply.hijack() bypasses Fastify plugins
      const origin = request.headers.origin
      const allowedOrigins = [process.env.WEB_URL ?? "http://localhost:3000", "http://localhost:3000"]
      const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Credentials": "true",
      })

      // Fetch current run items and send initial stats event
      const initialItems = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT status, executed_at FROM run_items WHERE run_id = ${runId}::uuid
        ` as unknown as Array<{ status: string; executed_at: string | null }>
      })
      const stats = computeRunStats(initialItems)
      const eta = estimateTimeRemaining(initialItems, initialItems.length)
      writeSSEEvent(res, { type: "run_update", runId, stats, eta })

      // Dedicated subscriber connection — iovalkey enters subscriber mode on subscribe(),
      // which locks the connection for pub/sub only. Must NOT reuse the shared valkey instance.
      const sub = new Valkey(process.env.VALKEY_URL!, {
        lazyConnect: false,
        maxRetriesPerRequest: 3,
      })

      const channel = `run:${runId}`
      await sub.subscribe(channel)

      // Forward Valkey pub/sub messages as SSE data events
      sub.on("message", (_ch: string, message: string) => {
        res.write(`data: ${message}\n\n`)
      })

      // 20s heartbeat comment keeps Railway proxy from closing idle connections
      const heartbeat = startHeartbeat(res, 20_000)

      // Cleanup when the browser disconnects
      request.raw.on("close", () => {
        clearInterval(heartbeat)
        sub.unsubscribe(channel).then(() => sub.quit()).catch(() => {})
      })

      // Tell Fastify we are managing the response ourselves
      reply.hijack()
    }
  )
  // ── DELETE /runs/:runId — hard delete run + items (admin only) ────────────
  fastify.delete<{
    Params: { workspaceId: string; runId: string }
  }>(
    "/api/workspaces/:workspaceId/runs/:runId",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { workspaceId, runId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(runId)) {
        return reply.status(400).send({ error: "Invalid runId" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        // Delete step comments, defects, run items, then the run itself
        await tx`DELETE FROM run_item_step_comments WHERE run_item_id IN (
          SELECT id FROM run_items WHERE run_id = ${runId}::uuid
        )`
        await tx`DELETE FROM defects WHERE run_item_id IN (
          SELECT id FROM run_items WHERE run_id = ${runId}::uuid
        )`
        await tx`DELETE FROM run_items WHERE run_id = ${runId}::uuid`
        await tx`DELETE FROM test_runs WHERE id = ${runId}::uuid
          AND workspace_id = current_setting('app.workspace_id', true)::uuid`
      })

      return reply.status(204).send()
    }
  )
}

export default runsRoutes
