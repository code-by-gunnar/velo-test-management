import { sql } from "../db/client.js"
import { storageEnabled, deleteObjects } from "./storage.js"

// VEL-31: recycle-bin retention. Items soft-deleted longer than this are purged
// permanently by the daily lifecycle sweep. 30 days matches the workspace/user
// deletion grace window used elsewhere in the lifecycle worker.
export const RECYCLE_BIN_RETENTION_DAYS = 30

export interface RecycleBinSweepResult {
  runs: number
  cases: number
  suites: number
  r2ObjectsDeleted: number
}

// Permanently purge every recycle-bin item whose deleted_at is older than the
// retention window, across ALL workspaces. Runs from the background worker as
// the DB superuser (RLS bypassed), so it operates cross-tenant directly.
//
// Semantics mirror the interactive purge endpoints:
//   • runs   → cascade-delete items/comments/defects + reclaim R2 evidence
//   • cases  → detach run_items first (preserve run history snapshots), then
//              delete the case (steps cascade) — no R2 involved
//   • suites → delete after their cases are already purged
export async function purgeExpiredRecycleBin(
  retentionDays: number = RECYCLE_BIN_RETENTION_DAYS
): Promise<RecycleBinSweepResult> {
  const cutoff = sql`NOW() - (${retentionDays} * INTERVAL '1 day')`
  let r2ObjectsDeleted = 0

  // ── Runs: reclaim R2 evidence, then cascade-delete rows ──────────────────
  const expiredRuns = await sql<{ id: string }[]>`
    SELECT id FROM test_runs
    WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}
  `
  const runIds = expiredRuns.map((r) => r.id)
  if (runIds.length > 0) {
    let runR2Keys: string[] = []
    if (storageEnabled()) {
      const keyRows = await sql<{ r2_key: string }[]>`
        SELECT r2_key FROM run_item_attachments WHERE run_item_id IN (
          SELECT id FROM run_items WHERE run_id = ANY(${runIds}::uuid[])
        )
      `
      runR2Keys = keyRows.map((r) => r.r2_key)
    }
    await sql`DELETE FROM run_item_step_comments WHERE run_item_id IN (
      SELECT id FROM run_items WHERE run_id = ANY(${runIds}::uuid[])
    )`
    await sql`DELETE FROM defects WHERE run_item_id IN (
      SELECT id FROM run_items WHERE run_id = ANY(${runIds}::uuid[])
    )`
    await sql`DELETE FROM run_items WHERE run_id = ANY(${runIds}::uuid[])`
    await sql`DELETE FROM test_runs WHERE id = ANY(${runIds}::uuid[])`

    if (runR2Keys.length > 0) {
      r2ObjectsDeleted = await deleteObjects(runR2Keys).catch((err: unknown) => {
        console.error("[recycle-bin-sweep] R2 evidence cleanup failed:", err)
        return 0
      })
    }
  }

  // ── Cases: detach run_items (keep their snapshots), then delete ──────────
  // Covers standalone deleted cases AND cases recycled with a deleted suite —
  // both carry a deleted_at older than the cutoff.
  await sql`
    UPDATE run_items SET test_case_id = NULL
    WHERE test_case_id IN (
      SELECT id FROM test_cases WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}
    )
  `
  const purgedCases = await sql<{ id: string }[]>`
    DELETE FROM test_cases
    WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}
    RETURNING id
  `

  // ── Suites: their cases are gone; delete the suite rows themselves ───────
  const purgedSuites = await sql<{ id: string }[]>`
    DELETE FROM suites
    WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}
    RETURNING id
  `

  return {
    runs: runIds.length,
    cases: purgedCases.length,
    suites: purgedSuites.length,
    r2ObjectsDeleted,
  }
}
