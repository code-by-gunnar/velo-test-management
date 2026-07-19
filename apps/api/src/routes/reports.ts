import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { captureEvent } from "../lib/posthog.js"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const reportsRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /reports — all report data in one call ────────────────────────────
  fastify.get<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/reports",
    async (request, reply) => {
      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!UUID_RE.test(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      // Analytics must count every view, not just cache misses (VEL-54). Fire
      // before the cache short-circuit below so repeat views within the 60s TTL
      // still register.
      captureEvent(request.userId as string, "report_viewed", {
        workspace_id: workspaceId,
        project_id: projectId,
      })

      // Check Valkey cache first (60-second TTL — reports are stale-tolerant)
      const cacheKey = `reports:${workspaceId}:${projectId}`
      const cached = await fastify.valkey.get(cacheKey)
      if (cached) {
        return reply.send(JSON.parse(cached))
      }

      const data = await withWorkspace(workspaceId, async (tx) => {
        // Run all 3 queries in parallel (independent, no data dependency)
        const [runTrend, fragileCases, recentRuns] = await Promise.all([
          tx`
            SELECT
              tr.id AS run_id, tr.name AS run_name,
              COALESCE(tr.completed_at, tr.created_at) AS completed_at,
              COUNT(ri.id)::int AS total,
              COUNT(ri.id) FILTER (WHERE ri.status = 'pass')::int AS pass,
              COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail,
              COUNT(ri.id) FILTER (WHERE ri.status = 'blocked')::int AS blocked,
              COUNT(ri.id) FILTER (WHERE ri.status = 'skipped')::int AS skipped
            FROM test_runs tr
            JOIN run_items ri ON ri.run_id = tr.id
            WHERE tr.project_id = ${projectId}::uuid
              AND tr.deleted_at IS NULL
              AND tr.status IN ('completed', 'aborted')
            GROUP BY tr.id
            ORDER BY COALESCE(tr.completed_at, tr.created_at) DESC
            LIMIT 20
          `,
          tx`
            SELECT
              tc.id AS case_id, tc.title AS case_title, s.name AS suite_name,
              COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail_count,
              COUNT(ri.id)::int AS total_executions,
              MAX(COALESCE(ri.executed_at, tr.completed_at, tr.created_at)) FILTER (WHERE ri.status = 'fail') AS last_failed_at
            FROM run_items ri
            JOIN test_cases tc ON tc.id = ri.test_case_id
            LEFT JOIN suites s ON s.id = tc.suite_id
            JOIN test_runs tr ON tr.id = ri.run_id
            WHERE tr.project_id = ${projectId}::uuid
              AND tr.deleted_at IS NULL
              -- CI-ingested items have executed_at = NULL; fall back to the run's
              -- completion time so pipeline failures still count as fragile (VEL-54).
              AND COALESCE(ri.executed_at, tr.completed_at, tr.created_at) > NOW() - INTERVAL '30 days'
              AND tc.deleted_at IS NULL
            GROUP BY tc.id, tc.title, s.name
            HAVING COUNT(ri.id) FILTER (WHERE ri.status = 'fail') > 0
            ORDER BY fail_count DESC
            LIMIT 10
          `,
          tx`
            SELECT
              tr.id, tr.name, tr.status, tr.created_at,
              COUNT(ri.id)::int AS total,
              COUNT(ri.id) FILTER (WHERE ri.status = 'pass')::int AS pass,
              COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail,
              COUNT(ri.id) FILTER (WHERE ri.status = 'blocked')::int AS blocked,
              COUNT(ri.id) FILTER (WHERE ri.status = 'skipped')::int AS skipped
            FROM test_runs tr
            JOIN run_items ri ON ri.run_id = tr.id
            WHERE tr.project_id = ${projectId}::uuid
              AND tr.deleted_at IS NULL
            GROUP BY tr.id
            ORDER BY tr.created_at DESC
            LIMIT 10
          `,
        ])

        return { runTrend, fragileCases, recentRuns }
      })

      // Compute pass_rate and fail_rate on the server
      const run_trend = (data.runTrend as unknown as Array<Record<string, unknown>>).reverse().map((r) => ({
        ...r,
        pass_rate: (r.total as number) > 0 ? Math.round(((r.pass as number) / (r.total as number)) * 100) : 0,
      }))

      const fragile_cases = (data.fragileCases as unknown as Array<Record<string, unknown>>).map((c) => ({
        ...c,
        fail_rate: (c.total_executions as number) > 0
          ? Math.round(((c.fail_count as number) / (c.total_executions as number)) * 100)
          : 0,
      }))

      const payload = { run_trend, fragile_cases, recent_runs: data.recentRuns }

      // Cache for 60 seconds
      await fastify.valkey.set(cacheKey, JSON.stringify(payload), "EX", 60).catch(() => {})

      return reply.send(payload)
    }
  )
}

export default reportsRoutes
