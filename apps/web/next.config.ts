import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
  // App Router is disabled — Pages Router only (CVE-2025-55182)
  experimental: {},
  // next-auth@beta imports next/server without .js extension — Next.js 16 ESM requires transpilation
  transpilePackages: ["next-auth"],
}

export default config
