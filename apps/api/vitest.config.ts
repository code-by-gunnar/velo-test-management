import { defineConfig } from "vitest/config"

process.loadEnvFile(".env")

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    globalSetup: "./src/test/global-setup.ts",
  },
})
