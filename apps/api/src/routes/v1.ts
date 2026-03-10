import type { FastifyPluginAsync } from "fastify"
import { createRateLimiter } from "../lib/rate-limiter.js"

// Import all route modules to re-register under /api/v1/ prefix
import workspaceRoutes from "./workspaces.js"
import suitesRoutes from "./suites.js"
import testCasesRoutes from "./test-cases.js"
import runsRoutes from "./runs.js"
import runItemsRoutes from "./run-items.js"
import defectsRoutes from "./defects.js"
import apiKeyRoutes from "./api-keys.js"
import ingestionRoutes from "./ingestion.js"

/**
 * /api/v1/ route prefix plugin.
 *
 * Re-registers all existing route modules with paths rewritten from
 * /api/... to /api/v1/... using Fastify's onRoute hook.
 *
 * Applies:
 * - requireAuth preHandler (accepts session OR API key)
 * - Rate limiter preHandler (only applies to API key requests)
 *
 * This means /api/v1/workspaces/:wid/projects works identically to
 * /api/workspaces/:wid/projects but accepts API key auth via the
 * unified auth middleware.
 */
const v1Routes: FastifyPluginAsync = async (fastify) => {
  // Apply unified auth + rate limiter as plugin-level preHandlers
  const rateLimiter = createRateLimiter(fastify.valkey, {
    windowMs: 60_000,
    max: 100,
  })

  fastify.addHook("preHandler", fastify.requireAuth)
  fastify.addHook("preHandler", rateLimiter)

  // Rewrite route URLs: /api/... -> /api/v1/...
  // This runs before the route is finalized, so the route is
  // registered at the rewritten path.
  fastify.addHook("onRoute", (routeOptions) => {
    if (routeOptions.url.startsWith("/api/")) {
      routeOptions.url = routeOptions.url.replace(/^\/api\//, "/api/v1/")
    }
  })

  // Re-register all route modules. Their routes will be rewritten
  // from /api/... to /api/v1/... by the onRoute hook above.
  // The plugin-level preHandlers (requireAuth + rateLimiter) apply
  // to all routes within this encapsulation scope.
  await fastify.register(workspaceRoutes)
  await fastify.register(suitesRoutes)
  await fastify.register(testCasesRoutes)
  await fastify.register(runsRoutes)
  await fastify.register(runItemsRoutes)
  await fastify.register(defectsRoutes)
  await fastify.register(apiKeyRoutes)
  await fastify.register(ingestionRoutes)
}

export default v1Routes
