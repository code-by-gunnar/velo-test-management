-- ─── CI Ingestion: API Keys + Ingestion Runs + run_items changes ──────────────

-- ─── api_keys table ────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  -- First 8 chars of the raw key (e.g. "velo_abc") — safe to store plaintext for lookup
  key_prefix    VARCHAR(10) NOT NULL,
  -- SHA-256 hex digest of the raw key — used for constant-time comparison
  key_hash      VARCHAR(64) NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

-- Partial index for fast key lookup on active (non-revoked) keys
CREATE INDEX api_keys_prefix_hash_active_idx
  ON api_keys(key_prefix, key_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON api_keys
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- ─── ci_ingestion_runs table ───────────────────────────────────────────────────
CREATE TABLE ci_ingestion_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Linked test run (nullable — may not be linked if parsing fails)
  run_id          UUID REFERENCES test_runs(id) ON DELETE SET NULL,
  -- API key that submitted this ingestion (nullable — if key later deleted)
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  -- "junit" | "allure"
  format          VARCHAR(20) NOT NULL,
  -- Cloudflare R2 object key for the raw uploaded payload
  r2_key          TEXT NOT NULL,
  -- "pending" | "processing" | "completed" | "failed"
  status          VARCHAR(20) NOT NULL,
  total_tests     INTEGER,
  matched_tests   INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ci_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_ingestion_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON ci_ingestion_runs
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- ─── run_items: make test_case_id nullable + add source column ─────────────────
-- Nullable: CI-ingested run items may not map to an existing test case
ALTER TABLE run_items ALTER COLUMN test_case_id DROP NOT NULL;

-- source: "manual" (human-created) | "ci" (ingested from CI pipeline)
ALTER TABLE run_items ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual';

-- ─── test_cases: add external_id for future CI auto-mapping ───────────────────
-- Nullable — set when a test case is first matched by the CI ingestion parser
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
