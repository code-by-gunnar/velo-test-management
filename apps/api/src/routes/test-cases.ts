import type { FastifyPluginAsync } from "fastify"
import { uuidv7 } from "uuidv7"
import { withWorkspace } from "../db/tenant.js"
import { parseImportBuffer, type TestCaseImport, type ExplicitColumnMapping } from "../lib/import-parser.js"
import { requireEditor } from "../plugins/require-editor.js"

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
          ? tx`AND tc.suite_id = ${suite_id}::uuid`
          : tx``

        return tx`
          SELECT tc.id, tc.suite_id, tc.title, tc.preconditions, tc.priority, tc.position,
                 COUNT(tcs.id)::int AS step_count
          FROM   test_cases tc
          LEFT JOIN test_case_steps tcs ON tcs.test_case_id = tc.id
          WHERE  tc.project_id = ${projectId}::uuid
            AND  tc.deleted_at IS NULL
            ${suiteFilter}
          GROUP BY tc.id
          ORDER BY tc.position
          LIMIT  500
        `
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
      preHandler: [requireEditor],
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
        const countRows = await tx`
          SELECT COUNT(*)::int AS n
          FROM test_cases
          WHERE project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        `
        const count = parseInt(String((countRows[0] as unknown as { n: number }).n ?? "0"))

        if (count >= FREE_TIER_MAX_TEST_CASES) {
          return null
        }

        const suiteFilter = suite_id ? tx`AND suite_id = ${suite_id}::uuid` : tx`AND suite_id IS NULL`
        const maxRows = await tx`
          SELECT COALESCE(MAX(position), 0) AS max_pos
          FROM test_cases
          WHERE project_id = ${projectId}::uuid
            ${suiteFilter}
            AND deleted_at IS NULL
        `
        const maxPos = parseInt(String((maxRows[0] as unknown as { max_pos: number }).max_pos ?? "0"))
        const position = maxPos + 1000

        const caseId = uuidv7()

        await tx`
          INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, preconditions, priority, position)
          VALUES (
            ${caseId}::uuid,
            current_setting('app.workspace_id', true)::uuid,
            ${projectId}::uuid,
            ${suite_id ?? null}::uuid,
            ${title},
            ${preconditions ?? null},
            ${priority},
            ${position}
          )
        `

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!
          const stepId = uuidv7()
          const stepOrder = (i + 1) * 1000

          await tx`
            INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
            VALUES (
              ${stepId}::uuid,
              ${caseId}::uuid,
              ${stepOrder},
              ${step.action},
              ${step.expected_result ?? null}
            )
          `
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
        return tx`
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
          WHERE tc.id = ${caseId}::uuid
            AND tc.project_id = ${projectId}::uuid
            AND tc.deleted_at IS NULL
            AND tc.workspace_id = current_setting('app.workspace_id', true)::uuid
          GROUP BY tc.id
        `
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
      preHandler: [requireEditor],
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
        const updateRows = await tx`
          UPDATE test_cases
          SET title = ${title},
              preconditions = ${preconditions ?? null},
              priority = ${priority},
              suite_id = ${suite_id ?? null}::uuid,
              updated_at = NOW()
          WHERE id = ${caseId}::uuid
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `

        if (updateRows.length === 0) return null

        await tx`
          DELETE FROM test_case_steps WHERE test_case_id = ${caseId}::uuid
        `

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!
          const stepId = uuidv7()
          const stepOrder = (i + 1) * 1000

          await tx`
            INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
            VALUES (
              ${stepId}::uuid,
              ${caseId}::uuid,
              ${stepOrder},
              ${step.action},
              ${step.expected_result ?? null}
            )
          `
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
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId, caseId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(caseId)) {
        return reply.status(400).send({ error: "Invalid caseId" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          UPDATE test_cases
          SET deleted_at = NOW()
          WHERE id = ${caseId}::uuid
            AND project_id = ${projectId}::uuid
            AND workspace_id = current_setting('app.workspace_id', true)::uuid
        `
      })

      return reply.status(204).send()
    }
  )

  // ── PATCH /cases/:caseId/position — reorder case (TC-04) ─────────────────
  // Registered BEFORE the /cases/:caseId wildcard handler to avoid routing conflict.
  // Body: { position: number }
  //   position >= 0 : single-row UPDATE (gap-based midpoint from UI)
  //   position === -1 : gap collapsed signal → renumber all sibling cases at 1000, 2000, ...
  fastify.patch<{
    Params: { workspaceId: string; projectId: string; caseId: string }
    Body: { position: number }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/:caseId/position",
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
      const { workspaceId, projectId, caseId } = request.params
      const { position } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(caseId)) {
        return reply.status(400).send({ error: "Invalid caseId" })
      }

      if (!Number.isInteger(position) || (position < -1)) {
        return reply.status(400).send({ error: "position must be -1 or a non-negative integer" })
      }

      await withWorkspace(workspaceId, async (tx) => {
        if (position === -1) {
          const tcRows = await tx`
            SELECT suite_id FROM test_cases
            WHERE id = ${caseId}::uuid
              AND project_id = ${projectId}::uuid
              AND deleted_at IS NULL
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
          `
          if (tcRows.length === 0) return

          const suiteId: string | null = (tcRows[0] as unknown as { suite_id: string | null }).suite_id ?? null
          const suiteFilter = suiteId !== null
            ? tx`AND suite_id = ${suiteId}::uuid`
            : tx`AND suite_id IS NULL`

          const cases = await tx`
            SELECT id FROM test_cases
            WHERE project_id = ${projectId}::uuid
              ${suiteFilter}
              AND deleted_at IS NULL
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
            ORDER BY position
          `

          for (let i = 0; i < cases.length; i++) {
            const row = cases[i] as unknown as { id: string }
            await tx`
              UPDATE test_cases SET position = ${(i + 1) * 1000}
              WHERE id = ${row.id}::uuid
            `
          }
        } else {
          await tx`
            UPDATE test_cases
            SET position = ${position}, updated_at = NOW()
            WHERE id = ${caseId}::uuid
              AND project_id = ${projectId}::uuid
              AND deleted_at IS NULL
              AND workspace_id = current_setting('app.workspace_id', true)::uuid
          `
        }
      })

      return reply.status(204).send()
    }
  )

  // ── POST /cases/position placeholder (TC-04 path guard) ───────────────────
  // Registered before /cases/:caseId to avoid routing conflict on static segment.
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/position",
    async (_request, reply) => {
      return reply.status(404).send({ error: "Not implemented" })
    }
  )

  // ── POST /cases/bulk — bulk move, copy, delete (TC-05) ───────────────────
  // IMPORTANT: registered BEFORE /cases/:caseId wildcard to avoid routing conflict.
  // Body: { action: "move" | "copy" | "delete", case_ids: string[], target_suite_id?: string | null }
  // move:   UPDATE suite_id for all case_ids → 204 No Content
  // copy:   duplicate each case + steps with new UUIDs → 201 { created: number }
  // delete: soft-delete all case_ids → 204 No Content
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Body: { action: string; case_ids: string[]; target_suite_id?: string | null }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/bulk",
    {
      preHandler: [requireEditor],
      schema: {
        body: {
          type: "object",
          required: ["action", "case_ids"],
          properties: {
            action: { type: "string", enum: ["move", "copy", "delete"] },
            case_ids: { type: "array", items: { type: "string" }, minItems: 1 },
            target_suite_id: { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const { action, case_ids, target_suite_id } = request.body

      if (!case_ids || case_ids.length === 0) {
        return reply.status(400).send({ error: "case_ids required" })
      }

      if ((action === "move" || action === "copy") && target_suite_id === undefined) {
        return reply.status(400).send({ error: "target_suite_id required for move/copy" })
      }

      if (!case_ids.every(isUuid)) {
        return reply.status(400).send({ error: "Invalid case_id format" })
      }

      if (action === "move") {
        const targetSuite = target_suite_id ?? null
        await withWorkspace(workspaceId, async (tx) => {
          await tx`
            UPDATE test_cases
            SET suite_id = ${targetSuite}::uuid,
                updated_at = NOW()
            WHERE id = ANY(${case_ids}::uuid[])
              AND project_id = ${projectId}::uuid
          `
        })
        return reply.status(204).send()
      }

      if (action === "copy") {
        let created = 0
        await withWorkspace(workspaceId, async (tx) => {
          for (const caseId of case_ids) {
            const srcRows = await tx`
              SELECT id, title, preconditions, priority, position
              FROM test_cases
              WHERE id = ${caseId}::uuid
                AND deleted_at IS NULL
                AND workspace_id = current_setting('app.workspace_id', true)::uuid
            `
            if (srcRows.length === 0) continue
            const src = srcRows[0] as unknown as {
              id: string
              title: string
              preconditions: string | null
              priority: string
              position: number
            }

            const steps = await tx`
              SELECT step_order, action, expected_result
              FROM test_case_steps
              WHERE test_case_id = ${caseId}::uuid
              ORDER BY step_order
            `

            const newCaseId = uuidv7()
            const targetSuite = target_suite_id ?? null

            await tx`
              INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, preconditions, priority, position, created_by)
              VALUES (
                ${newCaseId}::uuid,
                current_setting('app.workspace_id', true)::uuid,
                ${projectId}::uuid,
                ${targetSuite}::uuid,
                ${src.title},
                ${src.preconditions ?? null},
                ${src.priority},
                ${src.position},
                ${request.userId ?? null}::uuid
              )
            `

            for (const step of steps) {
              const s = step as unknown as {
                step_order: number
                action: string
                expected_result: string | null
              }

              await tx`
                INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
                VALUES (
                  ${uuidv7()}::uuid,
                  ${newCaseId}::uuid,
                  ${s.step_order},
                  ${s.action},
                  ${s.expected_result ?? null}
                )
              `
            }

            created++
          }
        })
        return reply.status(201).send({ created })
      }

      if (action === "delete") {
        await withWorkspace(workspaceId, async (tx) => {
          await tx`
            UPDATE test_cases
            SET deleted_at = NOW()
            WHERE id = ANY(${case_ids}::uuid[])
              AND project_id = ${projectId}::uuid
          `
        })
        return reply.status(204).send()
      }

      return reply.status(400).send({ error: "Invalid action" })
    }
  )

  // ── POST /cases/import — CSV file upload (TC-06) ────────────────────────
  // IMPORTANT: registered BEFORE /cases/:caseId wildcard to avoid routing conflict.
  // Accepts multipart/form-data with a "file" field (.csv only).
  // Parses server-side with parseImportBuffer (pure function).
  // Inserts test cases + steps atomically per case.
  fastify.post<{
    Params: { workspaceId: string; projectId: string }
    Querystring: {
      colTitle?: string
      colAction?: string
      colExpected?: string
      colPreconditions?: string
      colPriority?: string
      colSuite?: string
    }
  }>(
    "/api/workspaces/:workspaceId/projects/:projectId/cases/import",
    { preHandler: [requireEditor] },
    async (request, reply) => {
      const { workspaceId, projectId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      if (!isUuid(projectId)) {
        return reply.status(400).send({ error: "Invalid projectId" })
      }

      const data = await request.file()
      if (!data) return reply.status(400).send({ error: "No file uploaded" })

      const buffer = await data.toBuffer()

      const { colTitle, colAction, colExpected, colPreconditions, colPriority, colSuite } = request.query
      let explicit: ExplicitColumnMapping | undefined
      if (colTitle ?? colAction ?? colSuite) {
        explicit = {}
        if (colTitle) explicit.title = colTitle
        if (colAction) explicit.action = colAction
        if (colExpected) explicit.expected = colExpected
        if (colPreconditions) explicit.preconditions = colPreconditions
        if (colPriority) explicit.priority = colPriority
        if (colSuite) explicit.suite = colSuite
      }

      let parsed: TestCaseImport[]
      try {
        parsed = await parseImportBuffer(buffer, data.filename, explicit)
      } catch (err: unknown) {
        return reply
          .status(422)
          .send({ error: err instanceof Error ? err.message : "Parse error" })
      }

      let importedCount = 0

      await withWorkspace(workspaceId, async (tx) => {
        // Suite name → UUID cache (find-or-create during import)
        const suiteCache = new Map<string, string>()

        for (const tc of parsed) {
          const countRows = await tx`
            SELECT COUNT(*)::int AS n
            FROM test_cases
            WHERE project_id = ${projectId}::uuid
              AND deleted_at IS NULL
          `
          const count = parseInt(
            String((countRows[0] as unknown as { n: number }).n ?? "0")
          )

          if (count >= FREE_TIER_MAX_TEST_CASES) break

          // Resolve suite_id from suite name (find-or-create)
          let suiteId: string | null = null
          if (tc.suite) {
            const cached = suiteCache.get(tc.suite)
            if (cached) {
              suiteId = cached
            } else {
              // Look up existing suite by name (case-insensitive)
              const existing = await tx`
                SELECT id FROM suites
                WHERE project_id = ${projectId}::uuid
                  AND LOWER(name) = LOWER(${tc.suite})
                LIMIT 1
              `
              if (existing.length > 0) {
                suiteId = (existing[0] as unknown as { id: string }).id
              } else {
                // Create new suite
                suiteId = uuidv7()
                const suiteMaxRows = await tx`
                  SELECT COALESCE(MAX(position), 0) AS max_pos
                  FROM suites
                  WHERE project_id = ${projectId}::uuid
                    AND parent_id IS NULL
                `
                const suiteMaxPos = parseInt(
                  String((suiteMaxRows[0] as unknown as { max_pos: number }).max_pos ?? "0")
                )
                await tx`
                  INSERT INTO suites (id, workspace_id, project_id, parent_id, name, position)
                  VALUES (
                    ${suiteId}::uuid,
                    current_setting('app.workspace_id', true)::uuid,
                    ${projectId}::uuid,
                    NULL,
                    ${tc.suite},
                    ${suiteMaxPos + 1000}
                  )
                `
              }
              suiteCache.set(tc.suite, suiteId)
            }
          }

          const maxRows = await tx`
            SELECT COALESCE(MAX(position), 0) AS max_pos
            FROM test_cases
            WHERE project_id = ${projectId}::uuid
              AND suite_id ${suiteId ? tx`= ${suiteId}::uuid` : tx`IS NULL`}
              AND deleted_at IS NULL
          `
          const maxPos = parseInt(
            String((maxRows[0] as unknown as { max_pos: number }).max_pos ?? "0")
          )
          const position = maxPos + 1000

          const newCaseId = uuidv7()
          const priority = tc.priority ?? "medium"

          await tx`
            INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, preconditions, priority, position, created_by)
            VALUES (
              ${newCaseId}::uuid,
              current_setting('app.workspace_id', true)::uuid,
              ${projectId}::uuid,
              ${suiteId},
              ${tc.title},
              ${tc.preconditions ?? null},
              ${priority},
              ${position},
              ${request.userId ?? null}::uuid
            )
          `

          for (let i = 0; i < tc.steps.length; i++) {
            const step = tc.steps[i]!
            const stepId = uuidv7()
            const stepOrder = (i + 1) * 1000

            await tx`
              INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
              VALUES (
                ${stepId}::uuid,
                ${newCaseId}::uuid,
                ${stepOrder},
                ${step.action},
                ${step.expected_result ?? null}
              )
            `
          }

          importedCount++
        }
      })

      return reply.status(201).send({ imported: importedCount })
    }
  )
}

export default testCasesRoutes
