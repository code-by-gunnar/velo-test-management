import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    globalSetup: "./src/test/global-setup.ts",
  },
})
