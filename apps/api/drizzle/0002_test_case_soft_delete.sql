ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_test_cases_not_deleted
  ON test_cases (project_id, suite_id, position)
  WHERE deleted_at IS NULL;
