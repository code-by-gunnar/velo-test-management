import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
  // App Router is disabled — Pages Router only (CVE-2025-55182)
  experimental: {},
}

export default config
