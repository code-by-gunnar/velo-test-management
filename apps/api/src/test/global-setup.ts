import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  } finally {
    await client.end()
  }
}
