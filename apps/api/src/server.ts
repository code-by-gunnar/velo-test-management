import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import valkeyPlugin from "./plugins/valkey.plugin.js"
import authRoutes from "./routes/auth.js"

// Run pending migrations on startup (safe — idempotent, only applies new migrations)
async function runMigrations() {
  const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 })
  try {
    await migrate(drizzle(migrationClient), {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    })
    console.log("Migrations complete")
  } finally {
    await migrationClient.end()
  }
}

await runMigrations()

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
})

await fastify.register(cors, {
  origin: process.env.WEB_URL ?? "http://localhost:3000",
  credentials: true,
})

await fastify.register(helmet)
await fastify.register(valkeyPlugin)
await fastify.register(authRoutes)

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
