-- Test evidence: screenshots, logs, recordings attached during execution
CREATE TABLE run_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_item_id UUID NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  r2_key VARCHAR(500) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: restrict to workspace
ALTER TABLE run_item_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY run_item_attachments_workspace_isolation ON run_item_attachments
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
