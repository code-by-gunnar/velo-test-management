import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

describe("social preview crawler contract", () => {
  it("allows public crawlers to read the marketing site", () => {
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8")

    expect(robots).toMatch(/User-agent:\s*\*[\s\S]*Allow:\s*\/(?:\s|$)/)
    expect(robots).not.toMatch(/Disallow:\s*\/(?:\s|$)/)
  })
})
