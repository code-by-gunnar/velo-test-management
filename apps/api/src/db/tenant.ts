import type postgres from "postgres"
import { sql } from "./client.js"

// ─── WorkspaceSql branded type ────────────────────────────────────────────────
//
// This is the compile-time enforcement layer for INFRA-05.
//
// Route handlers that perform tenant-scoped queries must declare their
// query parameter as WorkspaceSql. TypeScript will refuse to compile
// if a caller passes the bare `sql` connection (which lacks the brand).
//
// Example enforced at compile time:
//   async function getProjects(tx: WorkspaceSql) { ... }
//   getProjects(sql)   // ❌ TypeScript error: sql is not WorkspaceSql
//   withWorkspace(id, getProjects)  // ✅ correct
//
// Note: We brand postgres.TransactionSql but cast through unknown when passing
// to fn, because TypeScript's Omit<> strips call signatures from the intersection.
// The runtime type is correct — this is a TypeScript structural limitation.

declare const __workspaceScoped: unique symbol

// WorkspaceSql uses the full Sql type (not TransactionSql) so template tags work.
// The brand prevents bare sql from being passed to tenant functions.
export type WorkspaceSql = postgres.Sql & {
  readonly [__workspaceScoped]: true
}

// ─── withWorkspace ────────────────────────────────────────────────────────────
//
// EVERY tenant-scoped API request MUST use this wrapper.
// It opens a postgres.js transaction, calls SET LOCAL app.workspace_id = $1,
// and runs all tenant queries inside the same transaction.
//
// SET LOCAL (not SET) scopes the variable to this transaction only.
// When the transaction commits or rolls back, the variable is cleared.
// This prevents workspace_id leaking across requests on pooled connections.

export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: WorkspaceSql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    // Validates that workspaceId is a valid UUID before setting it
    // (malformed input would cause a PostgreSQL error — explicit validation is cleaner)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
      throw new Error(`Invalid workspace_id format: ${workspaceId}`)
    }
    // Cast through unknown: TransactionSql Omit<> strips call signatures from
    // the TypeScript interface, but the runtime object retains them.
    const txSql = tx as unknown as WorkspaceSql
    await txSql`SET LOCAL app.workspace_id = ${workspaceId}`
    return fn(txSql)
  }) as Promise<T>
}
