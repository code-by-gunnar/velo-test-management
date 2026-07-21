import path from "node:path"
import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const config: NextConfig = {
  // Self-contained server bundle for Docker (ignored by Vercel's builder)
  output: "standalone",
  // Monorepo root so the standalone trace includes hoisted pnpm deps
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  reactStrictMode: true,
  // Disable Next's gzip layer (VEL-77 SSE fix). Its compression wraps `res` and
  // buffers the whole response until it can decide an encoding — for the SSE
  // gateway (`/api/backend/.../stream`) that means tiny event-stream chunks sit
  // in the gzip buffer forever, so NOTHING flushes (not even headers, defeating
  // res.flushHeaders()) and live updates silently break on every host. Every
  // reverse-proxy deployment (Caddy/Cloudflare/NPM) compresses independently, and
  // on bare LAN the cost is negligible — so turning it off here makes streaming
  // work everywhere with zero config instead of subtly failing. Never re-enable
  // without a per-route opt-out for text/event-stream.
  compress: false,
  // App Router is disabled — Pages Router only (CVE-2025-55182)
  experimental: {},
  // next-auth@beta imports next/server without .js extension — Next.js 16 ESM requires transpilation
  transpilePackages: ["next-auth"],
}

export default withSentryConfig(config, {
  org: "velo-qa",
  project: "velo-production",

  // Source map upload auth token
  ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: "/api/t",
})
