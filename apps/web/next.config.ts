import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const config: NextConfig = {
  reactStrictMode: true,
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
