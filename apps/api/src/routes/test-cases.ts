import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"

// Free tier limit (shared with workspaces.ts)
const FREE_TIER_MAX_TEST_CASES = 500

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

// ── Test case routes ──────────────────────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/projects/:projectId/cases
// All handlers:
//   1. Check session (401 if no userId)
//   2. Verify request.workspaceId matches :workspaceId param (403 if mismatch)
//   3. Use withWorkspace for every DB query — no bare sql on tenant tables

const testCasesRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ─────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /cases — list test cases (excludes soft-deleted) ──────────────────
  fastify.get<{
    Params: { workspaceId: string; projectId: string }
    Querystring: { suite_id?: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases",
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { suite_id } = request.query

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      if (suite_id !== undefined && !isUuid(suite_id)) {
        return reply.status(400).send({ error: "Invalid suite_id" })
      }

      const cases = await withWorkspace(workspaceId, async (tx) => {
        const suiteFilter = suite_id
          ? `AND tc.suite_id = '${suite_id}'`
          : ""

        return tx.unsafe(`
          SELECT tc.id, tc.suite_id, tc.title, tc.preconditions, tc.priority, tc.position,
                 COUNT(tcs.id)::int AS step_count
          FROM   test_cases tc
          LEFT JOIN test_case_steps tcs ON tcs.test_case_id = tc.id
          WHERE  tc.project_id = '${projectId}'
            AND  tc.deleted_at IS NULL
            ${suiteFilter}
          GROUP BY tc.id
          ORDER BY tc.position
          LIMIT  500
        `)
      })

      return reply.send(cases)
    }
  )

  // ── POST /cases — create test case + steps atomically ────────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: {
      suite_id?: string
      title: string
      preconditions?: string
      priority: string
      steps: Array<{ action: string; expected_result?: string }>
    }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "priority"],
          properties: {
            suite_id: { type: "string" },
            title: { type: "string", minLength: 1, maxLength: 500 },
            preconditions: { type: "string" },
            priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
            steps: {
              type: "array",
              items: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string" },
                  expected_result: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params
      const { suite_id, title, preconditions, priority, steps = [] } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      if (suite_id !== undefined && !isUuid(suite_id)) {
        return reply.status(400).send({ error: "Invalid suite_id" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        // 1. Check tier limit: count non-deleted cases in this project
        const countRows = await tx.unsafe(`
          SELECT COUNT(*)::int AS n
          FROM test_cases
          WHERE project_id = '${projectId}'
            AND deleted_at IS NULL
        `)
        const count = parseInt(String((countRows[0] as unknown as { n: number }).n ?? "0"))

        if (count >= FREE_TIER_MAX_TEST_CASES) {
          return null // signal tier limit exceeded
        }

        // 2. Compute position: MAX(position) in this project+suite + 1000
        const suiteFilter = suite_id ? `AND suite_id = '${suite_id}'` : `AND suite_id IS NULL`
        const maxRows = await tx.unsafe(`
          SELECT COALESCE(MAX(position), 0) AS max_pos
          FROM test_cases
          WHERE project_id = '${projectId}'
            ${suiteFilter}
            AND deleted_at IS NULL
        `)
        const maxPos = parseInt(String((maxRows[0] as unknown as { max_pos: number }).max_pos ?? "0"))
        const position = maxPos + 1000

        const caseId = uuidv7()
        const safeTitle = title.replace(/'/g, "''")
        const safePreconditions = preconditions ? preconditions.replace(/'/g, "''") : null

        // 3. INSERT test_cases row
        await tx.unsafe(`
          INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, preconditions, priority, position)
          VALUES (
            '${caseId}',
            current_setting('app.workspace_id', true)::uuid,
            '${projectId}',
            ${suite_id ? `'${suite_id}'` : "NULL"},
            '${safeTitle}',
            ${safePreconditions !== null ? `'${safePreconditions}'` : "NULL"},
            '${priority}',
            ${position}
          )
        `)

        // 4. INSERT steps (all in same transaction)
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!
          const stepId = uuidv7()
          const stepOrder = (i + 1) * 1000
          const safeAction = step.action.replace(/'/g, "''")
          const safeExpected = step.expected_result ? step.expected_result.replace(/'/g, "''") : null

          await tx.unsafe(`
            INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
            VALUES (
              '${stepId}',
              '${caseId}',
              ${stepOrder},
              '${safeAction}',
              ${safeExpected !== null ? `'${safeExpected}'` : "NULL"}
            )
          `)
        }

        return { caseId, stepCount: steps.length, position }
      })

      if (result === null) {
        return reply.status(403).send({
          error: `Free tier allows ${FREE_TIER_MAX_TEST_CASES} test cases. Upgrade to add more.`,
          code: "TIER_LIMIT_EXCEEDED",
          limit: "max_test_cases",
        })
      }

      return reply.status(201).send({
        id: result.caseId,
        workspace_id: workspaceId,
        project_id: projectId,
        suite_id: suite_id ?? null,
        title,
        preconditions: preconditions ?? null,
        priority,
        position: result.position,
        step_count: result.stepCount,
      })
    }
  )

  // ── GET /cases/:caseId — test case detail with steps ─────────────────────
  fastify.get<{
    Params: { workspaceId: string; projectId: string; caseId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/:caseId",
    async (request, reply) => {
      const { workspaceId, projectId, caseId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(caseId)) {
        return reply.status(400).send({ error: "Invalid caseId" })
      }

      const rows = await withWorkspace(workspaceId, async (tx) => {
        return tx.unsafe(`
          SELECT
            tc.id, tc.suite_id, tc.title, tc.preconditions, tc.priority, tc.position, tc.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', tcs.id,
                  'step_order', tcs.step_order,
                  'action', tcs.action,
                  'expected_result', tcs.expected_result
                ) ORDER BY tcs.step_order
              ) FILTER (WHERE tcs.id IS NOT NULL),
              '[]'
            ) AS steps
          FROM test_cases tc
          LEFT JOIN test_case_steps tcs ON tcs.test_case_id = tc.id
          WHERE tc.id = '${caseId}'
            AND tc.project_id = '${projectId}'
            AND tc.deleted_at IS NULL
            AND tc.workspace_id = current_setting('app.workspace_id', true)::uuid
          GROUP BY tc.id
        `)
      })

      if (rows.length === 0) return reply.status(404).send({ error: "Test case not found" })

      return reply.send(rows[0])
    }
  )

  // ── PUT /cases/:caseId — update case + replace steps ─────────────────────
  fastify.put<{
    Params: { workspaceId: string; projectId: string; caseId: string }
    Body: {
      suite_id?: string
      title: string
      preconditions?: string
      priority: string
      steps: Array<{ action: string; expected_result?: string }>
    }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/:caseId",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "priority"],
          properties: {
            suite_id: { type: "string" },
            title: { type: "string", minLength: 1, maxLength: 500 },
            preconditions: { type: "string" },
            priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
            steps: {
              type: "array",
              items: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string" },
                  expected_result: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId, caseId } = request.params
      const { suite_id, title, preconditions, priority, steps = [] } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(caseId)) {
        return reply.status(400).send({ error: "Invalid caseId" })
      }

      if (suite_id !== undefined && !isUuid(suite_id)) {
        return reply.status(400).send({ error: "Invalid suite_id" })
      }

      const updated = await withWorkspace(workspaceId, async (tx) => {
        const safeTitle = title.replace(/'/g, "''")
        const safePreconditions = preconditions ? preconditions.replace(/'/g, "''") : null

        // 1. UPDATE test_cases row
        const updateRows = await tx.unsafe(`
          UPDATE test_cases
          SET title = '${safeTitle}',
              preconditions = ${safePreconditions !== null ? `'${safePreconditions}'` : "NULL"},
              priority = '${priority}',
              suite_id = ${suite_id ? `'${suite_id}'` : "NULL"},
              updated_at = NOW()
          WHERE id = '${caseId}'
            AND project_id = '${projectId}'
            AND deleted_at IS NULL
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `)

        if (updateRows.length === 0) return null

        // 2. DELETE all existing steps for this case
        await tx.unsafe(`
          DELETE FROM test_case_steps WHERE test_case_id = '${caseId}'
        `)

        // 3. INSERT new steps
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!
          const stepId = uuidv7()
          const stepOrder = (i + 1) * 1000
          const safeAction = step.action.replace(/'/g, "''")
          const safeExpected = step.expected_result ? step.expected_result.replace(/'/g, "''") : null

          await tx.unsafe(`
            INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
            VALUES (
              '${stepId}',
              '${caseId}',
              ${stepOrder},
              '${safeAction}',
              ${safeExpected !== null ? `'${safeExpected}'` : "NULL"}
            )
          `)
        }

        return { caseId }
      })

      if (!updated) return reply.status(404).send({ error: "Test case not found" })

      return reply.send({
        id: caseId,
        title,
        preconditions: preconditions ?? null,
        priority,
        suite_id: suite_id ?? null,
        step_count: steps.length,
      })
    }
  )

  // ── DELETE /cases/:caseId — soft delete ───────────────────────────────────
  fastify.delete<{
    Params: { workspaceId: string; projectId: string; caseId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/:caseId",
    async (request, reply) => {
      const { workspaceId, projectId, caseId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(caseId)) {
        return reply.status(400).send({ error: "Invalid caseId" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx.unsafe(`
          UPDATE test_cases
          SET deleted_at = NOW()
          WHERE id = '${caseId}'
            AND project_id = '${projectId}'
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `)
      })

      return reply.status(204).send()
    }
  )

  // ── POST /cases/position placeholder (TC-04 in future plan) ──────────────
  // Registered before /cases/:caseId to avoid routing conflict.
  // Returns 404 until TC-04 is implemented.
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/position",
    async (_request, reply) => {
      return reply.status(404).send({ error: "Not implemented yet — see TC-04" })
    }
  )

  // ── POST /cases/bulk placeholder (TC-05 in future plan) ──────────────────
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/bulk",
    async (_request, reply) => {
      return reply.status(404).send({ error: "Not implemented yet — see TC-05" })
    }
  )
}

export default testCasesRoutes
