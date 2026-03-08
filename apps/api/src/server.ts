import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"

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

fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() }
})

const port = parseInt(process.env.PORT ?? "3001")

await fastify.listen({
  port,
  host: "::",  // REQUIRED: Railway needs dual-stack binding
})

fastify.log.info(`Velo API listening on port ${port}`)
