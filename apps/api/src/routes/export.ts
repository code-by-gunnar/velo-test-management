import type { FastifyPluginAsync } from "fastify"
import archiver from "archiver"
import { withWorkspace } from "../db/tenant.js"

// Cap the number of rows a single synchronous export may materialize (VEL-70).
// The export buffers every row in memory and compresses in-process, so a very
// large tenant could exhaust memory/CPU. Above this, return 413 and point at the
// (future) async/background export. Tunable via env. Counted across the heaviest
// tables (cases + steps + runs + run_items).
const EXPORT_MAX_ROWS = Math.max(1000, parseInt(process.env.EXPORT_MAX_ROWS ?? "100000", 10) || 100_000)

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

    // Admin check — workspace_members is RLS-scoped (VEL-43), run under withWorkspace
    const member = await withWorkspace(workspaceId, async (tx) => tx`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${request.userId}::uuid
        AND is_active = true
    `)
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
          SELECT test_case_id, step_order, action, expected_result
          FROM test_case_steps
          WHERE test_case_id = ANY(${caseIds}::uuid[])
          ORDER BY test_case_id, step_order
        `
      }

      // Test runs with items
      const runs = await tx`
        SELECT id, name, status, created_at, completed_at
        FROM test_runs
        WHERE workspace_id = ${workspaceId}::uuid
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `

      const runIds = runs.map((r) => r.id as string)
      let runItems: Record<string, unknown>[] = []
      if (runIds.length > 0) {
        runItems = await tx`
          SELECT ri.id, ri.run_id, ri.test_case_id, ri.case_title, ri.status, ri.executed_by, ri.executed_at
          FROM run_items ri
          WHERE ri.run_id = ANY(${runIds}::uuid[])
          ORDER BY ri.run_id
        `
      }

      return { workspace, suites, cases, steps, runs, runItems }
    })

    // Guard against unbounded in-process work (VEL-70): a very large tenant would
    // otherwise buffer every row and compress it synchronously, exhausting
    // memory/CPU and blocking the event loop. Above the cap, refuse rather than
    // risk an OOM; a streaming/background export is the follow-up (VEL-70b).
    const totalRows =
      data.cases.length + data.steps.length + data.runs.length + data.runItems.length
    if (totalRows > EXPORT_MAX_ROWS) {
      return reply.status(413).send({
        error: "Workspace too large for synchronous export",
        code: "EXPORT_TOO_LARGE",
        total_rows: totalRows,
        max_rows: EXPORT_MAX_ROWS,
      })
    }

    // Build ZIP. Compression level 6 (zlib default) instead of 9 — level 9 costs
    // markedly more CPU for a marginal size gain and blocks the event loop longer
    // on big exports (VEL-70).
    const archive = archiver("zip", { zlib: { level: 6 } })
    const ext = format === "json" ? "json" : "csv"

    reply.raw.setHeader("Content-Type", "application/zip")
    reply.raw.setHeader("Content-Disposition", `attachment; filename="velo-export-${workspaceId.slice(0, 8)}.zip"`)
    archive.pipe(reply.raw)

    // Group children by parent once (O(n)) — shared by both branches so the CSV
    // path no longer re-scans steps/items per row (VEL-53 / audit #17).
    const stepsMap = groupByKey(data.steps, "test_case_id")
    const itemsMap = groupByKey(data.runItems, "run_id")

    if (format === "json") {
      // JSON: each entity type as a separate file, nested where appropriate
      archive.append(JSON.stringify(data.workspace, null, 2), { name: `workspace.${ext}` })
      archive.append(JSON.stringify(data.suites, null, 2), { name: `suites.${ext}` })

      // Nest steps into cases
      const casesWithSteps = data.cases.map((c: Record<string, unknown>) => ({
        ...c,
        steps: stepsMap.get(c.id as string) ?? [],
      }))
      archive.append(JSON.stringify(casesWithSteps, null, 2), { name: `test_cases.${ext}` })

      // Nest items into runs
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
        const caseSteps = stepsMap.get(c.id as string) ?? []
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
        const items = itemsMap.get(r.id as string) ?? []
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

// Group rows by a string key in a single O(n) pass. Shared by both export
// branches so the CSV branch doesn't re-scan the child arrays per parent row
// (was O(cases × steps) / O(runs × items); VEL-53 / audit #17).
export function groupByKey<T extends Record<string, unknown>>(
  rows: T[],
  key: string
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = row[key] as string
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

// Simple CSV serializer -- handles any array of flat objects.
// Exported for unit testing (formula-injection neutralization).
// Characters that make a spreadsheet treat a cell as a formula (CSV/DDE
// injection). A leading one of these lets a crafted title like =HYPERLINK(...)
// or =cmd|'/c calc'!A1 execute when the export is opened in Excel/Sheets.
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"])

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0]!)
  const escape = (val: unknown): string => {
    const raw = val === null || val === undefined ? "" : String(val)
    // Neutralize formula injection: prefix an apostrophe so the spreadsheet
    // renders the cell as literal text instead of evaluating it (VEL-47 / #11).
    const str = raw.length > 0 && FORMULA_TRIGGERS.has(raw[0]!) ? `'${raw}` : raw
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
