import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function ensureAppRole(client: postgres.Sql) {
  // Create non-superuser role for RLS tests (idempotent)
  const roles = await client`SELECT 1 FROM pg_roles WHERE rolname = 'velo_app'`
  if (roles.length === 0) {
    await client.unsafe(`CREATE ROLE velo_app LOGIN PASSWORD 'velo_app'`)
    console.log("[test] created velo_app role")
  }

  // Grant permissions on existing tables and set defaults for future tables
  await client.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO velo_app`)
  await client.unsafe(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO velo_app`)
  await client.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO velo_app`)
  await client.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO velo_app`)
}

export async function setup() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.log("[test] No DATABASE_URL — skipping migrations (pure unit tests only)")
    return
  }

  const client = postgres(url, { max: 1 })
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.resolve(__dirname, "../../drizzle"),
    })
    console.log("[test] migrations complete")

    await ensureAppRole(client)
  } finally {
    await client.end()
  }
}
