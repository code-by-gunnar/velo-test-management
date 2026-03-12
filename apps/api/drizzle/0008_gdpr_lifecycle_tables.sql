-- 0008_gdpr_lifecycle_tables.sql
-- GDPR data lifecycle: workspace deletion, user erasure, audit log

-- Section 1: Workspace deletion columns
ALTER TABLE workspaces ADD COLUMN deletion_requested_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN deletion_requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workspaces ADD COLUMN deletion_job_id TEXT;
ALTER TABLE workspaces ADD COLUMN deletion_status TEXT;

-- Section 2: User erasure requests
CREATE TABLE user_erasure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_erasure_requests_status ON user_erasure_requests (status, scheduled_at);
CREATE INDEX idx_erasure_requests_user ON user_erasure_requests (user_id);

-- Section 3: Erasure audit log
CREATE TABLE erasure_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);
CREATE INDEX idx_audit_log_entity ON erasure_audit_log (entity_type, entity_id);

-- Section 4: Workspace deletion sweep index
CREATE INDEX idx_workspaces_deletion_status ON workspaces (deletion_status, deletion_scheduled_at) WHERE deletion_status IS NOT NULL;
