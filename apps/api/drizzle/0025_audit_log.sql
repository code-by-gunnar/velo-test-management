-- 0025_audit_log.sql
-- VEL-72: workspace-scoped, append-only security audit trail for
-- security-relevant actions (role changes, API-key create/revoke, integration
-- connect/disconnect, webhook CRUD, workspace export, destructive purge/bulk
-- delete). Distinct from the global GDPR erasure_audit_log (0008).
--
-- RLS-enforced + FORCE. Append-only by construction: only SELECT and INSERT
-- policies exist, so UPDATE/DELETE match NO policy under velo_app and are denied
-- even though the role holds the table-level grant. Actor FKs use ON DELETE SET
-- NULL so GDPR erasure of a user/key nulls attribution without dangling refs.

CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"actor_api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_workspace_created" ON "audit_log" ("workspace_id","created_at" DESC);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_log_select" ON "audit_log" FOR SELECT USING ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "audit_log_insert" ON "audit_log" FOR INSERT WITH CHECK ("workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
