-- Generic per-workspace secret store for simple single-key BYO providers
-- (Anthropic today; OpenAI/etc. later). Linear keeps its richer
-- linear_connections table; this is the home for "one key per provider".
CREATE TABLE IF NOT EXISTS workspace_integration_secrets (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider      VARCHAR(50) NOT NULL,
  secret_enc    TEXT NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, provider)
);

ALTER TABLE workspace_integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_integration_secrets FORCE ROW LEVEL SECURITY;

-- NULLIF form: pooled connections return '' (not NULL) for an unset setting, and
-- ''::uuid throws — see CLAUDE.md RLS lesson.
CREATE POLICY workspace_isolation ON workspace_integration_secrets
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
