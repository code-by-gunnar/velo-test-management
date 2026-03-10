import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseAllureJson } from "../allure-parser.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, "../../routes/__tests__/fixtures")

const allureFixture = readFileSync(join(fixturesDir, "allure-result.json"), "utf8")

describe("parseAllureJson", () => {
  // IN-02: Allure JSON format support

  it("parses single Allure result object", () => {
    const single = JSON.stringify({
      uuid: "a1b2c3d4",
      name: "User can log in",
      fullName: "com.example.LoginTest#testLogin",
      status: "passed",
      start: 1705312200000,
      stop: 1705312200512,
    })
    const results = parseAllureJson(single)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("User can log in")
    expect(results[0].fullName).toBe("com.example.LoginTest#testLogin")
    expect(results[0].status).toBe("pass")
    expect(results[0].durationMs).toBe(512)
  })

  it("parses array of Allure results from fixture file", () => {
    const results = parseAllureJson(allureFixture)
    expect(results).toHaveLength(4)
  })

  it("maps passed to pass, failed/broken to fail, skipped/unknown to skipped", () => {
    const input = JSON.stringify([
      { uuid: "1", name: "p", status: "passed", start: 0, stop: 100 },
      { uuid: "2", name: "f", status: "failed", start: 0, stop: 100 },
      { uuid: "3", name: "b", status: "broken", start: 0, stop: 100 },
      { uuid: "4", name: "s", status: "skipped", start: 0, stop: 100 },
      { uuid: "5", name: "u", status: "unknown", start: 0, stop: 100 },
    ])
    const results = parseAllureJson(input)
    expect(results[0].status).toBe("pass")
    expect(results[1].status).toBe("fail")
    expect(results[2].status).toBe("fail")
    expect(results[3].status).toBe("skipped")
    expect(results[4].status).toBe("skipped")
  })

  it("computes duration from start and stop timestamps", () => {
    const input = JSON.stringify([
      { uuid: "1", name: "timed", status: "passed", start: 1705312200000, stop: 1705312200512 },
      { uuid: "2", name: "no-start", status: "passed", stop: 1705312200512 },
      { uuid: "3", name: "no-stop", status: "passed", start: 1705312200000 },
      { uuid: "4", name: "no-times", status: "passed" },
    ])
    const results = parseAllureJson(input)
    expect(results[0].durationMs).toBe(512)
    expect(results[1].durationMs).toBeNull()
    expect(results[2].durationMs).toBeNull()
    expect(results[3].durationMs).toBeNull()
  })

  it("extracts failure message and trace from statusDetails", () => {
    const results = parseAllureJson(allureFixture)
    // Second item is "failed"
    const failed = results[1]
    expect(failed.status).toBe("fail")
    expect(failed.failureMessage).toBe("Expected: <401>\n     but: was <200>")
    expect(failed.failureBody).toContain("org.hamcrest.AssertionError")
    // Third item is "broken"
    const broken = results[2]
    expect(broken.status).toBe("fail")
    expect(broken.failureMessage).toBe("NullPointerException: tokenRefreshService is null")
    expect(broken.failureBody).toContain("java.lang.NullPointerException")
  })

  it("uses fullName field when available, falls back to name then uuid", () => {
    const input = JSON.stringify([
      { uuid: "1", name: "no-full", status: "passed" },
      { uuid: "2", name: "with-name", fullName: "com.example.Test#method", status: "passed" },
    ])
    const results = parseAllureJson(input)
    expect(results[0].fullName).toBe("no-full")
    expect(results[1].fullName).toBe("com.example.Test#method")
  })

  it("returns 400-style error for ZIP content (PK magic bytes)", () => {
    const zipContent = "PK\x03\x04somebinarydata"
    expect(() => parseAllureJson(zipContent)).toThrow(
      "Allure ZIP ingestion not supported — send individual *-result.json files"
    )
  })

  it("throws on invalid JSON", () => {
    expect(() => parseAllureJson("<not-json>")).toThrow()
  })

  it("classname is null for Allure results (no direct classname field)", () => {
    const input = JSON.stringify({ uuid: "1", name: "test", status: "passed" })
    const results = parseAllureJson(input)
    expect(results[0].classname).toBeNull()
  })
})
