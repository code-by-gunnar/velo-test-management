CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role workspace_role NOT NULL DEFAULT 'editor',
  token_hash TEXT NOT NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policy: workspace_invitations is tenant-scoped
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON workspace_invitations
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Index for fast lookup by workspace + email (most common query path)
CREATE INDEX idx_invitations_workspace_email ON workspace_invitations (workspace_id, email);
