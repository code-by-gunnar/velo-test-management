-- ─── Phase 5: Integrations — Linear Connections + Webhooks ─────────────────────

-- ─── linear_connections table ────────────────────────────────────────────────
-- One Linear OAuth connection per workspace. Tokens encrypted at app layer.
CREATE TABLE linear_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- OAuth tokens encrypted via AES-256-GCM before storage (never plaintext)
  access_token_enc      TEXT NOT NULL,
  refresh_token_enc     TEXT,
  -- Linear organization info
  linear_org_id         VARCHAR(255) NOT NULL,
  linear_org_name       VARCHAR(255),
  -- Default team for defect filing
  team_id               VARCHAR(255) NOT NULL,
  team_name             VARCHAR(255),
  -- Linear webhook signing secret for inbound webhook verification
  webhook_signing_secret TEXT,
  connected_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  connected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One connection per workspace
  UNIQUE(workspace_id)
);

ALTER TABLE linear_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE linear_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON linear_connections
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- ─── webhooks table ──────────────────────────────────────────────────────────
-- Outbound webhook endpoints per project (or workspace-level default if project_id NULL).
CREATE TABLE webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- NULL = workspace-level default that applies to all projects
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  endpoint_url  TEXT NOT NULL,
  -- HMAC-SHA256 signing secret (auto-generated, 32 bytes hex = 64 chars)
  secret        VARCHAR(64) NOT NULL,
  -- Array of subscribed event types: 'run.completed', 'run_item.failed'
  events        TEXT[] NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON webhooks
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- ─── defects: add external_status for cached Linear issue status ─────────────
ALTER TABLE defects ADD COLUMN IF NOT EXISTS external_status VARCHAR(50);
