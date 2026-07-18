import { describe, it, expect, afterAll } from "vitest"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

const sql = (await import("../../db/client.js")).sql

// VEL-50 / audit #15: hot-path tables were missing covering indexes, forcing
// sequential scans on frequent queries (webhook dispatch on every failed
// verdict, CI ingestion history, evidence listing, Linear webhook lookups,
// defect status sync). Migration 0016 adds them; this guards their presence.

describe("Hot-path indexes exist (VEL-50 / audit #15)", () => {
  afterAll(async () => {
    await sql.end()
  })

  it("migration 0016 created the covering indexes", async () => {
    const expected = [
      "idx_webhooks_ws_project_active",
      "idx_ci_ingestion_runs_project",
      "idx_run_item_attachments_run_item",
      "idx_linear_connections_org",
      "idx_defects_external_id",
    ]
    const rows = (await sql`
      SELECT indexname FROM pg_indexes WHERE indexname = ANY(${expected})
    `) as unknown as Array<{ indexname: string }>
    const found = new Set(rows.map((r) => r.indexname))
    for (const idx of expected) {
      expect(found.has(idx), `missing index ${idx}`).toBe(true)
    }
  })
})
