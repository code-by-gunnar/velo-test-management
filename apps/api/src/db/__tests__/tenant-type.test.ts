import { describe, it, expect, afterAll } from "vitest"
import { withWorkspace } from "../tenant.js"
import { sql } from "../client.js"

// This test verifies the withWorkspace wrapper works at runtime.
// Compile-time enforcement is verified by `pnpm typecheck` (TypeScript will error
// if someone calls a WorkspaceSql function with the bare sql client).

describe("withWorkspace runtime behaviour (INFRA-05)", () => {
  afterAll(async () => {
    await sql.end()
  })

  it("sets app.workspace_id for the duration of the transaction", async () => {
    const testId = "01934a2b-1234-7000-8000-000000000001"

    const result = await withWorkspace(testId, async (tx) => {
      const rows = await tx`SELECT current_setting('app.workspace_id', true) AS ws_id`
      return rows[0]?.ws_id
    })

    expect(result).toBe(testId)
  })

  it("clears app.workspace_id after the transaction ends", async () => {
    const testId = "01934a2b-1234-7000-8000-000000000002"

    await withWorkspace(testId, async (tx) => {
      await tx`SELECT 1`  // just open and close the transaction
    })

    // Outside the transaction, current_setting returns NULL (second arg = missing_ok: true)
    const rows = await sql`SELECT current_setting('app.workspace_id', true) AS ws_id`
    const wsId = rows[0]?.ws_id
    // After transaction ends, the LOCAL setting is gone — returns empty string or null
    expect(wsId == null || wsId === "").toBe(true)
  })

  it("rejects a malformed workspace_id before hitting the database", async () => {
    await expect(
      withWorkspace("not-a-uuid", async (tx) => tx`SELECT 1`)
    ).rejects.toThrow("Invalid workspace_id format")
  })
})
