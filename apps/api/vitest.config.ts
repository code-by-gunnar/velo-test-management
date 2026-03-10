import { defineConfig } from "vitest/config"

try { process.loadEnvFile(".env") } catch { /* CI has no .env file */ }

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    globalSetup: "./src/test/global-setup.ts",
  },
})
