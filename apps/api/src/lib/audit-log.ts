import type { JSONValue } from "postgres"
import { sql } from "../db/client.js"

/**
 * Log a GDPR lifecycle event to the erasure_audit_log table.
 *
 * MUST NOT accept name, email, or any PII — only UUIDs, action strings,
 * and non-PII metadata (e.g. counts, timestamps, job IDs).
 */
export async function logAuditEvent(
  entityType: "workspace" | "user",
  entityId: string,
  action: "requested" | "cancelled" | "processing" | "completed",
  metadata?: Record<string, unknown>
): Promise<void> {
  await sql`
    INSERT INTO erasure_audit_log (entity_type, entity_id, action, metadata)
    VALUES (${entityType}, ${entityId}, ${action}, ${metadata ? sql.json(metadata as JSONValue) : null})
  `
}
