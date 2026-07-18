// Sentry must be imported FIRST — before any other modules
import "./instrument.js"

import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import { runMigrations, runFixups, ensureAppRole } from "./db/bootstrap.js"
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
import profileRoutes from "./routes/profile.js"
import lifecycleRoutes from "./routes/lifecycle.js"
import erasureRoutes from "./routes/erasure.js"
import exportRoutes from "./routes/export.js"
import attachmentRoutes from "./routes/run-item-attachments.js"
import reportsRoutes from "./routes/reports.js"
import * as Sentry from "@sentry/node"
import { registerSweepJob } from "./queues/lifecycle.queue.js"
import { shutdownPostHog } from "./lib/posthog.js"

await runMigrations()
await runFixups()
await ensureAppRole()

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
    // Allow Vercel preview deployments (e.g. velo-test-management-git-feat-*.vercel.app)
    if (/^https:\/\/velo-test-management(-git-[a-z0-9-]+)?(-[a-z0-9]+)?\.vercel\.app$/.test(origin)) return cb(null, true)
    cb(new Error("Not allowed by CORS"), false)
  },
  credentials: true,
})

// Sentry error handler — must be registered BEFORE routes (unlike Express)
Sentry.setupFastifyErrorHandler(fastify)

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
await fastify.register(profileRoutes)
await fastify.register(lifecycleRoutes)
await fastify.register(erasureRoutes)
await fastify.register(exportRoutes)
await fastify.register(attachmentRoutes)
await fastify.register(reportsRoutes)

fastify.get("/robots.txt", async (_request, reply) => {
  return reply.type("text/plain").send("User-agent: *\nDisallow: /\n")
})

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

try {
  await registerSweepJob()
  console.log("[lifecycle] sweep job registered (daily 3 AM)")
} catch (err) {
  console.error("[lifecycle] failed to register sweep job:", (err as Error).message)
}

const port = parseInt(process.env.PORT ?? "3001")

await fastify.listen({
  port,
  host: "::",
})

fastify.log.info(`Velo API listening on port ${port}`)

// Flush PostHog events on graceful shutdown
const shutdown = async () => {
  await Sentry.close(2000)
  await shutdownPostHog()
  await fastify.close()
  process.exit(0)
}
process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
