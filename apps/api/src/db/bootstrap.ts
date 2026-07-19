import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { fileURLToPath } from "node:url"

// Shared DB bootstrap — used by server.ts at boot AND by the vitest global-setup,
// so the test database gets the exact same schema as production. (CI once broke
// because projects.deleted_at existed only in fixups, which tests never ran.)

// Migrations and fixups need DDL rights. When the runtime role is the restricted
// velo_app (audit #19), MIGRATION_DATABASE_URL carries the privileged connection;
// falls back to DATABASE_URL for single-role setups (local pnpm dev, tests).
export const migrationUrl = () => process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!

// Run pending migrations (safe — idempotent, only applies new migrations)
export async function runMigrations() {
  const migrationClient = postgres(migrationUrl(), { max: 1 })
  try {
    await migrate(drizzle(migrationClient), {
      migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    })
    console.log("Migrations complete")
  } finally {
    await migrationClient.end()
  }
}

// Idempotent schema fixups — run after migrations to patch columns that Drizzle
// may have skipped if the migration was registered before the SQL file was deployed.
export async function runFixups() {
  const fixupClient = postgres(migrationUrl(), { max: 1 })
  try {
    await fixupClient.unsafe(
      `ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`
    )
    await fixupClient.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_test_cases_not_deleted
         ON test_cases (project_id, suite_id, position)
         WHERE deleted_at IS NULL`
    )
    await fixupClient.unsafe(
      `ALTER TABLE run_items ADD COLUMN IF NOT EXISTS case_title VARCHAR(500)`
    )
    await fixupClient.unsafe(
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`
    )
    await fixupClient.unsafe(
      `ALTER TABLE suites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`
    )
    await fixupClient.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_suites_not_deleted
         ON suites (project_id, parent_id, position)
         WHERE deleted_at IS NULL`
    )
    await fixupClient.unsafe(
      `ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`
    )
    await fixupClient.unsafe(
      `CREATE INDEX IF NOT EXISTS idx_runs_not_deleted
         ON test_runs (project_id, created_at)
         WHERE deleted_at IS NULL`
    )
    // Phase 3: run_item_step_comments table (migration 0003 skipped in prior deploy)
    await fixupClient.unsafe(`
      CREATE TABLE IF NOT EXISTS run_item_step_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        run_item_id UUID NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await fixupClient.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_risc_run_item
        ON run_item_step_comments (run_item_id, step_order)
    `)
    await fixupClient.unsafe(`
      ALTER TABLE run_item_step_comments ENABLE ROW LEVEL SECURITY
    `)
    await fixupClient.unsafe(`
      ALTER TABLE run_item_step_comments FORCE ROW LEVEL SECURITY
    `)
    await fixupClient.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'run_item_step_comments' AND policyname = 'workspace_isolation'
        ) THEN
          CREATE POLICY workspace_isolation ON run_item_step_comments
            USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
        END IF;
      END $$
    `)
    // Phase 6: workspace_invitations table (migration 0006 journal entry without SQL)
    await fixupClient.unsafe(`
      CREATE TABLE IF NOT EXISTS workspace_invitations (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role workspace_role NOT NULL DEFAULT 'editor',
        token_hash TEXT NOT NULL,
        invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await fixupClient.unsafe(`
      ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY
    `)
    await fixupClient.unsafe(`
      ALTER TABLE workspace_invitations FORCE ROW LEVEL SECURITY
    `)
    await fixupClient.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'workspace_invitations' AND policyname = 'workspace_isolation'
        ) THEN
          CREATE POLICY workspace_isolation ON workspace_invitations
            USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
        END IF;
      END $$
    `)
    await fixupClient.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_invitations_workspace_email
        ON workspace_invitations (workspace_id, email)
    `)
    // Profile: avatar_url and pending_email columns on users
    await fixupClient.unsafe(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `)
    await fixupClient.unsafe(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255)
    `)
    // GDPR lifecycle: workspace deletion columns (migration 0008)
    await fixupClient.unsafe(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ
    `)
    await fixupClient.unsafe(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ
    `)
    await fixupClient.unsafe(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deletion_requested_by UUID REFERENCES users(id) ON DELETE SET NULL
    `)
    await fixupClient.unsafe(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deletion_job_id TEXT
    `)
    await fixupClient.unsafe(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deletion_status TEXT
    `)
    // GDPR lifecycle: user erasure requests table (migration 0008)
    await fixupClient.unsafe(`
      CREATE TABLE IF NOT EXISTS user_erasure_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scheduled_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pending',
        job_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await fixupClient.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_erasure_requests_status ON user_erasure_requests (status, scheduled_at)
    `)
    await fixupClient.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_erasure_requests_user ON user_erasure_requests (user_id)
    `)
    // GDPR lifecycle: erasure audit log table (migration 0008)
    await fixupClient.unsafe(`
      CREATE TABLE IF NOT EXISTS erasure_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type TEXT NOT NULL,
        entity_id UUID NOT NULL,
        action TEXT NOT NULL,
        performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB
      )
    `)
    await fixupClient.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON erasure_audit_log (entity_type, entity_id)
    `)
    await fixupClient.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_workspaces_deletion_status ON workspaces (deletion_status, deletion_scheduled_at) WHERE deletion_status IS NOT NULL
    `)
    // RLS policy hardening: on a pooled connection where app.workspace_id was
    // previously SET LOCAL, current_setting(..., true) returns '' (not NULL)
    // after the transaction ends — and ''::uuid THROWS. Under a superuser the
    // policies never evaluated so this was invisible; with the velo_app runtime
    // role (audit #19) any bare-sql statement on an RLS table could 500.
    // NULLIF makes a stale/absent GUC mean "no rows" instead of an error.
    for (const table of [
      "workspace_members", "projects", "suites", "test_cases", "test_runs",
      "run_items", "defects", "run_item_step_comments", "workspace_invitations",
      "api_keys",
    ]) {
      await fixupClient.unsafe(`
        ALTER POLICY workspace_isolation ON ${table}
          USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
      `)
    }
    await fixupClient.unsafe(`
      ALTER POLICY workspace_isolation ON test_case_steps
        USING (
          test_case_id IN (
            SELECT id FROM test_cases
            WHERE workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
          )
        )
    `)
    console.log("Schema fixups complete")
  } finally {
    await fixupClient.end()
  }
}

// Audit #19: provision the non-superuser runtime role. Superusers bypass RLS even
// with FORCE, so DATABASE_URL must point at velo_app for row-level security to bind.
// Runs only when APP_DB_PASSWORD is set (i.e., split-role deployments like compose);
// single-role local dev and tests are unaffected.
export async function ensureAppRole() {
  const password = process.env.APP_DB_PASSWORD
  if (!password) return

  const client = postgres(migrationUrl(), { max: 1 })
  const escaped = password.replace(/'/g, "''")
  try {
    await client.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velo_app') THEN
          CREATE ROLE velo_app LOGIN;
        END IF;
      END $$
    `)
    // Keep the password in sync with the env on every boot (supports rotation)
    await client.unsafe(`ALTER ROLE velo_app LOGIN PASSWORD '${escaped}'`)
    await client.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO velo_app`)
    await client.unsafe(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO velo_app`)
    await client.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO velo_app`)
    await client.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO velo_app`)
    // workspace_members is queried by explicit user/workspace predicates from many
    // pre-context paths (login JWT claims, role checks, member management) that never
    // set app.workspace_id. Exempt it from RLS for the app role only — content tables
    // (test_cases, runs, etc.) stay fully RLS-enforced. Follow-up: an app.user_id
    // policy + withUser() helper to close this exemption (see audit #19 note).
    await client.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'workspace_members' AND policyname = 'app_members_access'
        ) THEN
          CREATE POLICY app_members_access ON workspace_members
            FOR ALL TO velo_app USING (true) WITH CHECK (true);
        END IF;
      END $$
    `)
    // api_keys is looked up by (prefix, hash) from the pre-context auth path
    // (verifyApiKey, shared by v1 routes + CI ingestion) which never sets
    // app.workspace_id — the workspace is a RESULT of the lookup, not an input.
    // Under velo_app the workspace_isolation policy would match zero rows, so
    // every API key reads as invalid. Same exemption as workspace_members; the
    // management routes (create/list/revoke) still filter by workspace_id
    // explicitly inside withWorkspace, so tenant scoping there is unchanged.
    await client.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'api_keys' AND policyname = 'app_api_keys_access'
        ) THEN
          CREATE POLICY app_api_keys_access ON api_keys
            FOR ALL TO velo_app USING (true) WITH CHECK (true);
        END IF;
      END $$
    `)
    console.log("App role velo_app provisioned (RLS-bound runtime)")
  } finally {
    await client.end()
  }
}
