-- Performance indexes for high-traffic foreign key columns
-- Addresses sequential scans on run_items, test_case_steps, test_runs, suites, defects

CREATE INDEX IF NOT EXISTS idx_run_items_run_id ON run_items (run_id);
CREATE INDEX IF NOT EXISTS idx_run_items_run_id_status ON run_items (run_id, status);
CREATE INDEX IF NOT EXISTS idx_run_items_test_case_id ON run_items (test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_case_steps_test_case_id ON test_case_steps (test_case_id, step_order);
CREATE INDEX IF NOT EXISTS idx_test_runs_project_id ON test_runs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suites_project_id ON suites (project_id, position);
CREATE INDEX IF NOT EXISTS idx_defects_run_item_id ON defects (run_item_id);
CREATE INDEX IF NOT EXISTS idx_suites_project_name_lower ON suites (project_id, lower(name));
