-- ─── Enable RLS on all tenant-scoped tables ───────────────────────────────────
-- FORCE ROW LEVEL SECURITY means the table owner role is also filtered.
-- The app database role must NOT be a superuser — superusers bypass RLS.
-- Create the app role if it does not exist:
--   CREATE ROLE velo_app LOGIN PASSWORD 'your-password-here';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO velo_app;
--   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO velo_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO velo_app;

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

ALTER TABLE suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE suites FORCE ROW LEVEL SECURITY;

ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases FORCE ROW LEVEL SECURITY;

ALTER TABLE test_case_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_case_steps FORCE ROW LEVEL SECURITY;

ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_items FORCE ROW LEVEL SECURITY;

ALTER TABLE defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE defects FORCE ROW LEVEL SECURITY;

-- ─── RLS policies ─────────────────────────────────────────────────────────────
-- Each policy allows a row only when workspace_id matches the current transaction's
-- app.workspace_id setting (set by withWorkspace() via SET LOCAL).
--
-- The 'true' second arg to current_setting() = missing_ok:
-- If SET LOCAL was never called (i.e. app forgot to use withWorkspace),
-- current_setting returns NULL, which means workspace_id != NULL -> no rows returned.
-- This is the safe default — fail closed.

CREATE POLICY workspace_isolation ON workspace_members
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON projects
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON suites
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON test_cases
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- test_case_steps: join to test_cases for workspace isolation
CREATE POLICY workspace_isolation ON test_case_steps
  FOR ALL
  USING (
    test_case_id IN (
      SELECT id FROM test_cases
      WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY workspace_isolation ON test_runs
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON run_items
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY workspace_isolation ON defects
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
