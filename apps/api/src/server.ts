import { fileURLToPath } from "node:url"
import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import valkeyPlugin from "./plugins/valkey.plugin.js"
import sessionPlugin from "./plugins/session.plugin.js"
import authPlugin from "./plugins/auth.plugin.js"
import authRoutes from "./routes/auth.js"
import workspaceRoutes from "./routes/workspaces.js"
import suitesRoutes from "./routes/suites.js"
import testCasesRoutes from "./routes/test-cases.js"
import runsRoutes from "./routes/runs.js"
import runItemsRoutes from "./routes/run-items.js"
import defectsRoutes from "./routes/defects.js"
import apiKeyRoutes from "./routes/api-keys.js"
import ingestionRoutes from "./routes/ingestion.js"
import memberRoutes from "./routes/members.js"
import linearRoutes from "./routes/linear.js"
import linearWebhookRoutes from "./routes/linear-webhook.js"
import webhookRoutes from "./routes/webhooks.js"
import v1Routes from "./routes/v1.js"

// Run pending migrations on startup (safe — idempotent, only applies new migrations)
async function runMigrations() {
  const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 })
  try {
    await migrate(drizzle(migrationClient), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    })
    console.log("Migrations complete")
  } finally {
    await migrationClient.end()
  }
}

// Idempotent schema fixups — run after migrations to patch columns that Drizzle
// may have skipped if the migration was registered before the SQL file was deployed.
async function runFixups() {
  const fixupClient = postgres(process.env.DATABASE_URL!, { max: 1 })
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
    console.log("Schema fixups complete")
  } finally {
    await fixupClient.end()
  }
}

await runMigrations()
await runFixups()

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
})

await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // server-to-server requests
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000"
    if (origin === webUrl) return cb(null, true)
    if (origin === "http://localhost:3000") return cb(null, true)
    // Allow Vercel preview deployments (e.g. velo-test-management-git-*.vercel.app)
    if (/^https:\/\/velo-test-management[^.]*\.vercel\.app$/.test(origin)) return cb(null, true)
    cb(new Error("Not allowed by CORS"), false)
  },
  credentials: true,
})

await fastify.register(helmet)
await fastify.register(cookie)
await fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }) // 5MB limit
await fastify.register(valkeyPlugin)
// Linear webhook receiver: PUBLIC endpoint — must be registered BEFORE session/auth
// so it is not subject to the auth preHandler hook. Linear calls this directly.
await fastify.register(linearWebhookRoutes)
await fastify.register(sessionPlugin)
await fastify.register(authPlugin)
await fastify.register(authRoutes)
await fastify.register(workspaceRoutes)
await fastify.register(suitesRoutes)
await fastify.register(testCasesRoutes)
await fastify.register(runsRoutes)
await fastify.register(runItemsRoutes)
await fastify.register(defectsRoutes)
await fastify.register(apiKeyRoutes)
await fastify.register(memberRoutes)
await fastify.register(ingestionRoutes)
await fastify.register(linearRoutes)
await fastify.register(webhookRoutes)
await fastify.register(v1Routes)

fastify.get("/health", async () => {
  // Ping Valkey — returns "PONG" if healthy
  const valkeyPing = await fastify.valkey.ping().catch(() => "ERROR")
  return {
    status: valkeyPing === "PONG" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      valkey: valkeyPing === "PONG" ? "ok" : "error",
    },
  }
})

const port = parseInt(process.env.PORT ?? "3001")

await fastify.listen({
  port,
  host: "::",
})

fastify.log.info(`Velo API listening on port ${port}`)
