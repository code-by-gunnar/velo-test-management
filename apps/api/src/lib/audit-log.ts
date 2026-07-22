import type { JSONValue } from "postgres"
import type { WorkspaceSql } from "../db/tenant.js"
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

// ── Security audit trail (VEL-72) ────────────────────────────────────────────
// A durable, append-only record of security-relevant actions, workspace-scoped
// and RLS-enforced (see migration 0025). Distinct from the GDPR erasure log
// above. The action taxonomy is a closed set so the (future) admin view and any
// alerting can rely on stable strings.
export type AuditAction =
  | "role.changed"
  | "api_key.created"
  | "api_key.revoked"
  | "integration.connected"
  | "integration.disconnected"
  | "webhook.created"
  | "webhook.updated"
  | "webhook.deleted"
  | "workspace.exported"
  | "recycle.purged"
  | "recycle.bulk_deleted"

export interface AuditEntry {
  action: AuditAction
  /** The acting user (nullable when the actor is an API key or the system). */
  actorUserId?: string | null
  /** The acting API key, when the action came through key auth. */
  actorApiKeyId?: string | null
  /** What was acted on, e.g. "user", "api_key", "webhook", "workspace". */
  targetType?: string | null
  /** Identifier of the target (UUID or a stable string). */
  targetId?: string | null
  /** Non-PII context: counts, before/after values, provider names, etc. */
  metadata?: Record<string, unknown> | null
}

/**
 * Append a security-relevant action to the workspace audit trail.
 *
 * MUST run inside a `withWorkspace(...)` callback — pass that transaction as
 * `tx`. The row's `workspace_id` is taken from `app.workspace_id` (set by
 * withWorkspace), which the RLS INSERT policy requires, so the entry can't be
 * written into another tenant's trail. Recording inside the same transaction as
 * the audited mutation keeps them atomic: an action that rolls back leaves no
 * audit row, and vice-versa.
 */
export async function recordAudit(tx: WorkspaceSql, entry: AuditEntry): Promise<void> {
  await tx`
    INSERT INTO audit_log (workspace_id, actor_user_id, actor_api_key_id, action, target_type, target_id, metadata)
    VALUES (
      current_setting('app.workspace_id', true)::uuid,
      ${entry.actorUserId ?? null}::uuid,
      ${entry.actorApiKeyId ?? null}::uuid,
      ${entry.action},
      ${entry.targetType ?? null},
      ${entry.targetId ?? null},
      ${entry.metadata ? tx.json(entry.metadata as JSONValue) : null}
    )
  `
}
