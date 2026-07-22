import type { FastifyPluginAsync } from "fastify"
import { Readable } from "node:stream"
import archiver from "archiver"
import { withWorkspace } from "../db/tenant.js"
import { recordAudit } from "../lib/audit-log.js"

// Cap the number of rows a single export may cover (VEL-70). Even though rows are
// now streamed in batches (VEL-80), a runaway export still costs DB + CPU + zip
// time, so keep a hard ceiling. Above it → 413. Counted across the heaviest
// tables (cases + steps + runs + run_items). Floored at 1000 (prod footgun guard).
const EXPORT_MAX_ROWS = Math.max(1000, parseInt(process.env.EXPORT_MAX_ROWS ?? "100000", 10) || 100_000)

// How many parent rows (cases / runs) to pull per keyset batch. Peak in-process
// memory is bounded to one batch + its children rather than the whole tenant
// (VEL-80). Tunable; floored at 50 so a misconfig can't thrash the DB.
const EXPORT_BATCH = Math.max(50, parseInt(process.env.EXPORT_BATCH_ROWS ?? "500", 10) || 500)

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

    // Cheap COUNTs (index scans) instead of materializing every row — this both
    // enforces the size guard and gives the audit metadata, without buffering the
    // tenant. The rows themselves are streamed later in keyset batches (VEL-80).
    const counts = await withWorkspace(workspaceId, async (tx) => {
      const [row] = await tx`
        SELECT
          (SELECT count(*) FROM test_cases
             WHERE workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL) AS cases,
          (SELECT count(*) FROM test_case_steps s
             JOIN test_cases tc ON tc.id = s.test_case_id
             WHERE tc.workspace_id = ${workspaceId}::uuid AND tc.deleted_at IS NULL) AS steps,
          (SELECT count(*) FROM test_runs
             WHERE workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL) AS runs,
          (SELECT count(*) FROM run_items ri
             JOIN test_runs r ON r.id = ri.run_id
             WHERE r.workspace_id = ${workspaceId}::uuid AND r.deleted_at IS NULL) AS run_items
      `
      return row as { cases: string; steps: string; runs: string; run_items: string }
    })
    const caseCount = Number(counts.cases)
    const runCount = Number(counts.runs)
    const totalRows = caseCount + Number(counts.steps) + runCount + Number(counts.run_items)

    // Refuse an oversized export (VEL-70) — kept even under streaming as a ceiling.
    if (totalRows > EXPORT_MAX_ROWS) {
      return reply.status(413).send({
        error: "Workspace too large for synchronous export",
        code: "EXPORT_TOO_LARGE",
        total_rows: totalRows,
        max_rows: EXPORT_MAX_ROWS,
      })
    }

    // Small, bounded tables — fetch directly (suites are bounded by structure,
    // workspace is a single row). The large tables are streamed below.
    const { workspace, suites } = await withWorkspace(workspaceId, async (tx) => {
      const [ws] = await tx`
        SELECT id, name, slug, plan_tier, created_at FROM workspaces WHERE id = ${workspaceId}::uuid
      `
      const su = await tx`
        SELECT id, name, parent_id, position, created_at
        FROM suites
        WHERE workspace_id = ${workspaceId}::uuid
        ORDER BY position
      `
      return { workspace: ws as Record<string, unknown> | undefined, suites: su as Record<string, unknown>[] }
    })

    // Record the export in the security audit trail (VEL-72): an admin pulling a
    // full copy of tenant data is exactly the kind of action worth a durable log.
    // Placed past the size guard (the export is now committed) and before streaming.
    await withWorkspace(workspaceId, async (tx) => {
      await recordAudit(tx, {
        action: "workspace.exported",
        actorUserId: request.userId ?? null,
        targetType: "workspace",
        targetId: workspaceId,
        metadata: { format, total_rows: totalRows, cases: caseCount, runs: runCount },
      })
    })

    // Build ZIP. Compression level 6 (zlib default) instead of 9 — level 9 costs
    // markedly more CPU for a marginal size gain and blocks the event loop longer
    // on big exports (VEL-70).
    const archive = archiver("zip", { zlib: { level: 6 } })
    const ext = format === "json" ? "json" : "csv"

    reply.raw.setHeader("Content-Type", "application/zip")
    reply.raw.setHeader("Content-Disposition", `attachment; filename="velo-export-${workspaceId.slice(0, 8)}.zip"`)
    archive.pipe(reply.raw)

    // Each large entry is fed by a pull-based Readable so archiver only advances
    // the underlying keyset generator (and its DB queries) as it writes the zip —
    // natural backpressure, peak memory bounded to one batch (VEL-80). Entries are
    // consumed in append order, so only one generator runs at a time.
    const toStream = (gen: AsyncIterable<string>) => Readable.from(gen, { objectMode: false })

    if (format === "json") {
      archive.append(JSON.stringify(workspace, null, 2), { name: `workspace.${ext}` })
      archive.append(JSON.stringify(suites, null, 2), { name: `suites.${ext}` })
      archive.append(toStream(collectJsonArray(streamCasesWithSteps(workspaceId))), { name: `test_cases.${ext}` })
      archive.append(toStream(collectJsonArray(streamRunsWithItems(workspaceId))), { name: `test_runs.${ext}` })
    } else {
      archive.append(toCsv(workspace ? [workspace] : []), { name: `workspace.${ext}` })
      archive.append(toCsv(suites), { name: `suites.${ext}` })
      archive.append(toStream(collectCsvRows(csvCases(workspaceId))), { name: `test_cases.${ext}` })
      archive.append(toStream(collectCsvRows(csvRuns(workspaceId))), { name: `test_runs.${ext}` })
    }

    await archive.finalize()
    // Don't call reply.send() -- archive already piped to reply.raw
  })
}

// ── Keyset-batched row streams (VEL-80) ──────────────────────────────────────
// Each batch is its own short withWorkspace transaction (RLS-scoped) keyed off
// the last id seen — no long-held transaction during client I/O, and peak memory
// is one batch of parents + their children. Intra-file order keys on id.

async function* streamCasesWithSteps(workspaceId: string): AsyncGenerator<Record<string, unknown>> {
  let lastId: string | null = null
  for (;;) {
    const cases = (await withWorkspace(workspaceId, async (tx) => tx`
      SELECT id, title, priority, suite_id, position, created_at, created_by
      FROM test_cases
      WHERE workspace_id = ${workspaceId}::uuid
        AND deleted_at IS NULL
        ${lastId ? tx`AND id > ${lastId}::uuid` : tx``}
      ORDER BY id
      LIMIT ${EXPORT_BATCH}
    `)) as Record<string, unknown>[]
    if (cases.length === 0) break

    const ids = cases.map((c) => c.id as string)
    const steps = (await withWorkspace(workspaceId, async (tx) => tx`
      SELECT test_case_id, step_order, action, expected_result
      FROM test_case_steps
      WHERE test_case_id = ANY(${ids}::uuid[])
      ORDER BY test_case_id, step_order
    `)) as Record<string, unknown>[]
    const stepsMap = groupByKey(steps, "test_case_id")

    for (const c of cases) yield { ...c, steps: stepsMap.get(c.id as string) ?? [] }

    if (cases.length < EXPORT_BATCH) break
    lastId = cases[cases.length - 1]!.id as string
  }
}

async function* streamRunsWithItems(workspaceId: string): AsyncGenerator<Record<string, unknown>> {
  let lastId: string | null = null
  for (;;) {
    const runs = (await withWorkspace(workspaceId, async (tx) => tx`
      SELECT id, name, status, created_at, completed_at
      FROM test_runs
      WHERE workspace_id = ${workspaceId}::uuid
        AND deleted_at IS NULL
        ${lastId ? tx`AND id > ${lastId}::uuid` : tx``}
      ORDER BY id
      LIMIT ${EXPORT_BATCH}
    `)) as Record<string, unknown>[]
    if (runs.length === 0) break

    const ids = runs.map((r) => r.id as string)
    const items = (await withWorkspace(workspaceId, async (tx) => tx`
      SELECT id, run_id, test_case_id, case_title, status, executed_by, executed_at
      FROM run_items
      WHERE run_id = ANY(${ids}::uuid[])
      ORDER BY run_id
    `)) as Record<string, unknown>[]
    const itemsMap = groupByKey(items, "run_id")

    for (const r of runs) yield { ...r, items: itemsMap.get(r.id as string) ?? [] }

    if (runs.length < EXPORT_BATCH) break
    lastId = runs[runs.length - 1]!.id as string
  }
}

// CSV flattening — mirrors the previous inline shape (steps joined into one cell,
// run item counts), applied per streamed element so nothing is buffered.
async function* csvCases(workspaceId: string): AsyncGenerator<Record<string, unknown>> {
  for await (const el of streamCasesWithSteps(workspaceId)) {
    const { steps, ...c } = el
    const arr = (steps as Record<string, unknown>[]) ?? []
    yield {
      ...c,
      step_count: arr.length,
      steps: arr.map((s) => `${s.step_order}: ${s.action ?? ""} -> ${s.expected_result ?? ""}`).join(" | "),
    }
  }
}

async function* csvRuns(workspaceId: string): AsyncGenerator<Record<string, unknown>> {
  for await (const el of streamRunsWithItems(workspaceId)) {
    const { items, ...r } = el
    const arr = (items as Record<string, unknown>[]) ?? []
    yield {
      ...r,
      total_items: arr.length,
      passed: arr.filter((i) => i.status === "pass").length,
      failed: arr.filter((i) => i.status === "fail").length,
    }
  }
}

// ── Incremental serializers (VEL-80) ─────────────────────────────────────────
// Turn an async row source into a stream of string chunks so no whole-file string
// is ever held in memory (the old JSON.stringify(wholeArray) was the real spike).

// Assemble a JSON array chunk-by-chunk. Valid JSON regardless of element count.
export async function* collectJsonArray(source: AsyncIterable<Record<string, unknown>>): AsyncGenerator<string> {
  yield "[\n"
  let first = true
  for await (const el of source) {
    const body = JSON.stringify(el, null, 2).split("\n").map((l) => "  " + l).join("\n")
    yield (first ? "" : ",\n") + body
    first = false
  }
  yield first ? "]\n" : "\n]\n"
}

// Assemble CSV chunk-by-chunk: header from the first row, then one line per row.
// Empty source → no output (matches toCsv([])). Reuses the same escaping as toCsv.
export async function* collectCsvRows(source: AsyncIterable<Record<string, unknown>>): AsyncGenerator<string> {
  let headers: string[] | null = null
  for await (const row of source) {
    if (!headers) {
      headers = Object.keys(row)
      yield headers.join(",") + "\n"
    }
    yield csvRow(headers, row) + "\n"
  }
}

// Group rows by a string key in a single O(n) pass. Shared by the batch streams so
// children are matched to parents without an O(parents × children) re-scan
// (VEL-53 / audit #17).
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

// Characters that make a spreadsheet treat a cell as a formula (CSV/DDE
// injection). A leading one of these lets a crafted title like =HYPERLINK(...)
// or =cmd|'/c calc'!A1 execute when the export is opened in Excel/Sheets.
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"])

// Escape a single CSV cell: neutralize formula injection (VEL-47 / #11) then apply
// standard CSV quoting. Shared by toCsv (buffered) and collectCsvRows (streamed).
function csvEscape(val: unknown): string {
  const raw = val === null || val === undefined ? "" : String(val)
  const str = raw.length > 0 && FORMULA_TRIGGERS.has(raw[0]!) ? `'${raw}` : raw
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

function csvRow(headers: string[], row: Record<string, unknown>): string {
  return headers.map((h) => csvEscape(row[h])).join(",")
}

// Simple CSV serializer -- handles any array of flat objects. Exported for unit
// testing (formula-injection neutralization). The streamed path uses csvRow/
// collectCsvRows instead so it never materializes the whole string.
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0]!)
  return [headers.join(","), ...rows.map((row) => csvRow(headers, row))].join("\n")
}

export default exportRoutes
