-- Phase 3: Step-level comments during execution (TR-04) + case title snapshot (Pitfall 6)

-- 1. New table for step-level annotations during run execution
CREATE TABLE IF NOT EXISTS run_item_step_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_item_id UUID NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risc_run_item
  ON run_item_step_comments (run_item_id, step_order);

-- RLS
ALTER TABLE run_item_step_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_item_step_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON run_item_step_comments
  USING (workspace_id::text = current_setting('app.workspace_id', true));

-- 2. Snapshot case title on run_items to prevent title edits affecting in-progress runs
ALTER TABLE run_items ADD COLUMN IF NOT EXISTS case_title VARCHAR(500);
