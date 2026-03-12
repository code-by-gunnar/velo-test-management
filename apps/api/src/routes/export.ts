import type { FastifyPluginAsync } from "fastify"
import archiver from "archiver"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"

const exportRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // GET /api/workspaces/:workspaceId/export?format=json|csv
  // WEX-01: Admin triggers full workspace export
  // WEX-02: Contains test cases w/ steps, suites, runs w/ results, settings
  // WEX-03: JSON preserves nesting, CSV flattens
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { format?: string }
  }>("/api/workspaces/:workspaceId/export", async (request, reply) => {
    const { workspaceId } = request.params
    const format = (request.query.format ?? "json") as "json" | "csv"

    if (format !== "json" && format !== "csv") {
      return reply.status(400).send({ error: "format must be 'json' or 'csv'" })
    }

    // Admin check
    const member = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${request.userId}::uuid
        AND is_active = true
    `
    if (member.length === 0 || member[0]?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" })
    }

    // Fetch all data inside withWorkspace for RLS
    const data = await withWorkspace(workspaceId, async (tx) => {
      // Workspace settings
      const [workspace] = await tx`
        SELECT id, name, slug, plan_tier, created_at FROM workspaces WHERE id = ${workspaceId}::uuid
      `

      // Suites with hierarchy
      const suites = await tx`
        SELECT id, name, parent_id, position, created_at
        FROM suites
        WHERE workspace_id = ${workspaceId}::uuid
        ORDER BY position
      `

      // Test cases with steps
      const cases = await tx`
        SELECT tc.id, tc.title, tc.priority, tc.suite_id, tc.position, tc.created_at,
               tc.created_by
        FROM test_cases tc
        WHERE tc.workspace_id = ${workspaceId}::uuid
          AND tc.deleted_at IS NULL
        ORDER BY tc.suite_id, tc.position
      `

      const caseIds = cases.map((c) => c.id as string)
      let steps: Record<string, unknown>[] = []
      if (caseIds.length > 0) {
        steps = await tx`
          SELECT case_id, step_order, action, expected_result
          FROM test_case_steps
          WHERE case_id = ANY(${caseIds}::uuid[])
          ORDER BY case_id, step_order
        `
      }

      // Test runs with items
      const runs = await tx`
        SELECT id, name, status, created_at, completed_at
        FROM test_runs
        WHERE workspace_id = ${workspaceId}::uuid
        ORDER BY created_at DESC
      `

      const runIds = runs.map((r) => r.id as string)
      let runItems: Record<string, unknown>[] = []
      if (runIds.length > 0) {
        runItems = await tx`
          SELECT ri.id, ri.run_id, ri.case_id, ri.case_title, ri.status, ri.executed_by, ri.executed_at
          FROM run_items ri
          WHERE ri.run_id = ANY(${runIds}::uuid[])
          ORDER BY ri.run_id
        `
      }

      return { workspace, suites, cases, steps, runs, runItems }
    })

    // Build ZIP
    const archive = archiver("zip", { zlib: { level: 9 } })
    const ext = format === "json" ? "json" : "csv"

    reply.raw.setHeader("Content-Type", "application/zip")
    reply.raw.setHeader("Content-Disposition", `attachment; filename="velo-export-${workspaceId.slice(0, 8)}.zip"`)
    archive.pipe(reply.raw)

    if (format === "json") {
      // JSON: each entity type as a separate file, nested where appropriate
      archive.append(JSON.stringify(data.workspace, null, 2), { name: `workspace.${ext}` })
      archive.append(JSON.stringify(data.suites, null, 2), { name: `suites.${ext}` })

      // Nest steps into cases
      const stepsMap = new Map<string, Record<string, unknown>[]>()
      for (const step of data.steps) {
        const caseId = step.case_id as string
        if (!stepsMap.has(caseId)) stepsMap.set(caseId, [])
        stepsMap.get(caseId)!.push(step)
      }
      const casesWithSteps = data.cases.map((c: Record<string, unknown>) => ({
        ...c,
        steps: stepsMap.get(c.id as string) ?? [],
      }))
      archive.append(JSON.stringify(casesWithSteps, null, 2), { name: `test_cases.${ext}` })

      // Nest items into runs
      const itemsMap = new Map<string, Record<string, unknown>[]>()
      for (const item of data.runItems) {
        const runId = item.run_id as string
        if (!itemsMap.has(runId)) itemsMap.set(runId, [])
        itemsMap.get(runId)!.push(item)
      }
      const runsWithItems = data.runs.map((r: Record<string, unknown>) => ({
        ...r,
        items: itemsMap.get(r.id as string) ?? [],
      }))
      archive.append(JSON.stringify(runsWithItems, null, 2), { name: `test_runs.${ext}` })

    } else {
      // CSV: flatten everything
      archive.append(toCsv(data.workspace ? [data.workspace] : []), { name: `workspace.${ext}` })
      archive.append(toCsv(data.suites), { name: `suites.${ext}` })

      // Flatten cases with steps inline
      const flatCases = data.cases.map((c: Record<string, unknown>) => {
        const caseSteps = data.steps.filter((s: Record<string, unknown>) => s.case_id === c.id)
        return {
          ...c,
          step_count: caseSteps.length,
          steps: caseSteps.map((s: Record<string, unknown>) =>
            `${s.step_order}: ${s.action ?? ""} -> ${s.expected_result ?? ""}`
          ).join(" | "),
        }
      })
      archive.append(toCsv(flatCases), { name: `test_cases.${ext}` })

      // Flatten runs with item counts
      const flatRuns = data.runs.map((r: Record<string, unknown>) => {
        const items = data.runItems.filter((i: Record<string, unknown>) => i.run_id === r.id)
        return {
          ...r,
          total_items: items.length,
          passed: items.filter((i: Record<string, unknown>) => i.status === "pass").length,
          failed: items.filter((i: Record<string, unknown>) => i.status === "fail").length,
        }
      })
      archive.append(toCsv(flatRuns), { name: `test_runs.${ext}` })
    }

    await archive.finalize()
    // Don't call reply.send() -- archive already piped to reply.raw
  })
}

// Simple CSV serializer -- handles any array of flat objects
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0]!)
  const escape = (val: unknown): string => {
    const str = val === null || val === undefined ? "" : String(val)
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }
  const lines = [
    headers.join(","),
    ...rows.map(row => headers.map(h => escape(row[h])).join(","))
  ]
  return lines.join("\n")
}

export default exportRoutes
