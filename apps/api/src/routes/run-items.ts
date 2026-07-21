import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"
import { fireWebhookEvent } from "../queues/webhook.queue.js"
import { requireEditor } from "../plugins/require-editor.js"
import { captureEvent } from "../lib/posthog.js"
import { invalidateReportsCache } from "../lib/reports-cache.js"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

const VALID_VERDICT_STATUSES = ["pass", "fail", "blocked", "skipped"] as const
type VerdictStatus = (typeof VALID_VERDICT_STATUSES)[number]

function isVerdictStatus(value: string): value is VerdictStatus {
  return (VALID_VERDICT_STATUSES as readonly string[]).includes(value)
}

// ── Run Items routes ──────────────────────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/run-items
// All handlers:
//   1. Check session (401 if no userId)
//   2. Verify request.workspaceId matches :workspaceId param (403 if mismatch)
//   3. Use withWorkspace for every DB query — no bare sql on tenant tables
//   4. reply.send() called AFTER withWorkspace completes (never inside)

const runItemsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ─────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── PATCH /run-items/:itemId — execute item (TR-02) ───────────────────────
  // Body: { status: "pass" | "fail" | "blocked" | "skipped" }
  // Updates status, executed_by, executed_at; recomputes run status; publishes to Valkey.
  fastify.patch<{
    Params: { workspaceId: string; itemId: string }
    Body: { status: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId",
    {
      preHandler: [requireEditor],
      schema: {
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["pass", "fail", "blocked", "skipped"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, itemId } = request.params
      const { status } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(itemId)) {
        return reply.status(400).send({ error: "Invalid itemId" })
      }

      if (!isVerdictStatus(status)) {
        return reply.status(400).send({ error: "status must be pass, fail, blocked, or skipped" })
      }

      const executedBy = request.userId

      const result = await withWorkspace(workspaceId, async (tx) => {
        // 1. Update item status
        const updateRows = await tx`
          UPDATE run_items
          SET status = ${status},
              executed_by = ${executedBy}::uuid,
              executed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${itemId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING run_id, case_title, executed_at
        ` as unknown as { run_id: string; case_title: string | null; executed_at: string | null }[]

        if (updateRows.length === 0) return null

        const updated = updateRows[0]!
        const runId = updated.run_id
        const caseTitle = updated.case_title
        const executedAt = updated.executed_at

        // 2. Lock the parent run row FOR UPDATE (VEL-44 / audit #7). This
        // serializes concurrent item verdicts on the same run through the
        // completion recompute below. Without it, two testers finishing the
        // last two items each run the COUNT under READ COMMITTED before the
        // other commits — both see untested > 0, both write 'active', and the
        // run is left active forever (the run.completed webhook never fires).
        // Taking the lock here (after the item update) means the second
        // transaction blocks until the first commits, then its COUNT below sees
        // a fresh snapshot including the first item's verdict. Also fetches the
        // project_id + name needed for webhook payloads in the same round trip.
        const runRows = await tx`
          SELECT project_id, name FROM test_runs
          WHERE id = ${runId}::uuid
          FOR UPDATE
        ` as unknown as { project_id: string; name: string }[]
        if (runRows.length === 0) return null
        const run = runRows[0]!

        // 3. Compute stats for this run (now under the run lock)
        const statsRows = await tx`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pass')::int AS pass,
            COUNT(*) FILTER (WHERE status = 'fail')::int AS fail,
            COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
            COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
            COUNT(*) FILTER (WHERE status = 'untested')::int AS untested
          FROM run_items
          WHERE run_id = ${runId}::uuid
        ` as unknown as {
          total: number
          pass: number
          fail: number
          blocked: number
          skipped: number
          untested: number
        }[]

        const stats = statsRows[0]!

        // 4. Recompute run status using already-computed stats (no redundant subqueries)
        const isComplete = stats.untested === 0
        await tx`
          UPDATE test_runs
          SET status = ${isComplete ? "completed" : "active"}::run_status,
              completed_at = ${isComplete ? tx`NOW()` : tx`NULL`},
              updated_at = NOW()
          WHERE id = ${runId}::uuid
        `

        return { itemId, status, runId, caseTitle, executedAt, stats, projectId: run.project_id, runName: run.name, isComplete }
      })

      if (result === null) {
        return reply.status(404).send({ error: "Run item not found" })
      }

      // Bust the reports cache so the Reports view reflects this verdict on the
      // next load instead of waiting out the 60s TTL (VEL-75). Fire-and-forget.
      void invalidateReportsCache(fastify.valkey, workspaceId, result.projectId)

      // 4. Fire-and-forget Valkey publish after transaction commits
      // Do NOT await — client response must not be blocked by Valkey
      fastify.valkey
        .publish(
          `run:${result.runId}`,
          JSON.stringify({
            type: "run_update",
            runId: result.runId,
            stats: result.stats,
            updatedItem: {
              id: result.itemId,
              status: result.status,
              caseTitle: result.caseTitle,
              executedAt: result.executedAt,
            },
          })
        )
        .catch(() => {
          // Valkey publish failure must not affect response
        })

      // 5. Fire webhook events (fire-and-forget — do not await)
      // run_item.failed: fires on every fail verdict
      if (result.status === "fail") {
        fireWebhookEvent(workspaceId, result.projectId, "run_item.failed", {
          run_id: result.runId,
          run_item_id: result.itemId,
          test_case_title: result.caseTitle,
          verdict: "fail",
          executed_by: executedBy,
          timestamp: new Date().toISOString(),
        }).catch(() => {})
      }

      // run.completed: fires when all items have verdicts (no untested remaining)
      if (result.isComplete) {
        fireWebhookEvent(workspaceId, result.projectId, "run.completed", {
          run_id: result.runId,
          run_name: result.runName,
          total: result.stats.total,
          passed: result.stats.pass,
          failed: result.stats.fail,
          blocked: result.stats.blocked,
          skipped: result.stats.skipped,
          completed_at: new Date().toISOString(),
        }).catch(() => {})
      }

      captureEvent(executedBy as string, "run_item_status_changed", {
        workspace_id: workspaceId,
        run_id: result.runId,
        status: result.status,
      })

      return reply.send(result)
    }
  )

  // ── PATCH /run-items/:itemId/comment — set case-level comment (TR-04) ─────
  // Body: { comment: string }
  fastify.patch<{
    Params: { workspaceId: string; itemId: string }
    Body: { comment: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/comment",
    {
      preHandler: [requireEditor],
      schema: {
        body: {
          type: "object",
          required: ["comment"],
          properties: {
            comment: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, itemId } = request.params
      const { comment } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(itemId)) {
        return reply.status(400).send({ error: "Invalid itemId" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          UPDATE run_items
          SET comment = ${comment}, updated_at = NOW()
          WHERE id = ${itemId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `
      })

      return reply.status(204).send()
    }
  )

  // ── POST /run-items/:itemId/step-comments — add step annotation (TR-04) ───
  // Body: { step_order: number, comment: string }
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { step_order: number; comment: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/step-comments",
    {
      preHandler: [requireEditor],
      schema: {
        body: {
          type: "object",
          required: ["step_order", "comment"],
          properties: {
            step_order: { type: "integer", minimum: 1 },
            comment: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, itemId } = request.params
      const { step_order, comment } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(itemId)) {
        return reply.status(400).send({ error: "Invalid itemId" })
      }

      if (!Number.isInteger(step_order) || step_order < 1) {
        return reply.status(400).send({ error: "step_order must be a positive integer" })
      }

      if (!comment || comment.trim().length === 0) {
        return reply.status(400).send({ error: "comment must not be empty" })
      }

      const commentId = uuidv7()
      const createdBy = request.userId

      const created = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          INSERT INTO run_item_step_comments
            (id, workspace_id, run_item_id, step_order, comment, created_by)
          VALUES (
            ${commentId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${itemId}::uuid,
            ${step_order},
            ${comment},
            ${createdBy ?? null}
          )
          RETURNING id, workspace_id, run_item_id, step_order, comment, created_by, created_at
        `

        return rows[0]
      })

      return reply.status(201).send(created)
    }
  )

  // ── GET /run-items/:itemId/step-comments — list step annotations (TR-04) ──
  fastify.get<{
    Params: { workspaceId: string; itemId: string }
  }>(
    "/api/workspaces/:workspaceId/run-items/:itemId/step-comments",
    async (request, reply) => {
      const { workspaceId, itemId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(itemId)) {
        return reply.status(400).send({ error: "Invalid itemId" })
      }

      const comments = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT id, workspace_id, run_item_id, step_order, comment, created_by, created_at
          FROM run_item_step_comments
          WHERE run_item_id = ${itemId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          ORDER BY step_order, created_at
        `
      })

      return reply.send(comments)
    }
  )
}

export default runItemsRoutes
