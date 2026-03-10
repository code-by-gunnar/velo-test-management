import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"
import { parseImportBuffer } from "../import-parser.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, "../../routes/__tests__/fixtures")

// TC-06: CSV import parser unit tests
describe("parseImportFile — CSV", () => {
  it("parses a CSV with Title/Action/Expected columns into test cases with steps", async () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "import-sample.csv"))
    const result = await parseImportBuffer(buffer, "import-sample.csv")
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    // Each item has title and steps array
    for (const tc of result) {
      expect(typeof tc.title).toBe("string")
      expect(Array.isArray(tc.steps)).toBe(true)
    }
  })

  it("preserves multi-step structure — 3 step rows produce 3 step objects", async () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "import-sample.csv"))
    const result = await parseImportBuffer(buffer, "import-sample.csv")
    // CSV fixture: "Login with valid credentials" has 3 steps
    const loginCase = result.find((tc) => tc.title === "Login with valid credentials")
    expect(loginCase).toBeDefined()
    expect(loginCase!.steps.length).toBe(3)
  })

  it("handles multi-row format (one row per step, same title = same case)", async () => {
    const csv = [
      "Title,Action,Expected Result",
      "Case A,Step 1,Result 1",
      "Case A,Step 2,Result 2",
      "Case A,Step 3,Result 3",
      "Case B,Step 1,Result 1",
    ].join("\n")
    const buffer = Buffer.from(csv)
    const result = await parseImportBuffer(buffer, "test.csv")
    // 2 unique titles → 2 cases
    expect(result.length).toBe(2)
    const caseA = result.find((tc) => tc.title === "Case A")
    expect(caseA!.steps.length).toBe(3)
    const caseB = result.find((tc) => tc.title === "Case B")
    expect(caseB!.steps.length).toBe(1)
  })

  it("handles single-row format (steps pipe-delimited in one cell)", async () => {
    const csv = [
      "Title,Steps,Expected",
      "Case A,Open browser|Enter URL|Click Go,Page loaded",
    ].join("\n")
    const buffer = Buffer.from(csv)
    // Single-row format: "Steps" maps to action column (no title grouping by step)
    // This test verifies no crash — steps column detection handles it
    const result = await parseImportBuffer(buffer, "test.csv")
    expect(Array.isArray(result)).toBe(true)
  })

  it("returns an error for missing required Title column", async () => {
    const csv = ["Action,Expected Result", "Click button,Button clicked"].join("\n")
    const buffer = Buffer.from(csv)
    await expect(parseImportBuffer(buffer, "test.csv")).rejects.toThrow("Missing required column: title")
  })

  it("column header matching is case-insensitive", async () => {
    const csv = [
      "TITLE,ACTION,EXPECTED RESULT",
      "Case A,Step 1,Result 1",
      "Case A,Step 2,Result 2",
    ].join("\n")
    const buffer = Buffer.from(csv)
    const result = await parseImportBuffer(buffer, "test.csv")
    expect(result.length).toBe(1)
    expect(result[0]!.steps.length).toBe(2)
  })
})

describe("parseImportFile — rejects non-CSV", () => {
  it("throws a clear error for .xlsx files", async () => {
    const buffer = Buffer.from("dummy")
    await expect(parseImportBuffer(buffer, "test.xlsx")).rejects.toThrow(
      'Unsupported file type — please upload a .csv file (received: "test.xlsx")'
    )
  })
})
