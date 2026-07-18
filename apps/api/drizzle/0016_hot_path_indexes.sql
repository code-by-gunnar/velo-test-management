-- VEL-50 / audit #15: covering indexes for hot-path queries that were doing
-- sequential scans. Each is IF NOT EXISTS so re-runs are safe.

-- Webhook dispatch: fireWebhookEvent looks up active webhooks by workspace +
-- project on every failed verdict. Partial index (active only) keeps it small.
CREATE INDEX IF NOT EXISTS idx_webhooks_ws_project_active
  ON webhooks (workspace_id, project_id) WHERE active;

-- CI ingestion history is listed/filtered by project.
CREATE INDEX IF NOT EXISTS idx_ci_ingestion_runs_project
  ON ci_ingestion_runs (project_id);

-- Evidence attachments are fetched per run item.
CREATE INDEX IF NOT EXISTS idx_run_item_attachments_run_item
  ON run_item_attachments (run_item_id);

-- Inbound Linear webhook resolves the connection by org id on every delivery.
-- Non-unique on purpose: a UNIQUE index would fail (and block API boot, since
-- migrations run before listen) if any duplicate rows existed; the lookup gets
-- the same speedup either way.
CREATE INDEX IF NOT EXISTS idx_linear_connections_org
  ON linear_connections (linear_org_id);

-- Linear status sync + webhook update defects by external_id. Partial: most
-- defects (non-Linear) have a NULL external_id and don't need indexing.
CREATE INDEX IF NOT EXISTS idx_defects_external_id
  ON defects (external_id) WHERE external_id IS NOT NULL;
