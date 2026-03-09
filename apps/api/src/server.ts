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
import authRoutes from "./routes/auth.js"
import workspaceRoutes from "./routes/workspaces.js"
import suitesRoutes from "./routes/suites.js"
import testCasesRoutes from "./routes/test-cases.js"

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
await fastify.register(sessionPlugin)
await fastify.register(authRoutes)
await fastify.register(workspaceRoutes)
await fastify.register(suitesRoutes)
await fastify.register(testCasesRoutes)

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
