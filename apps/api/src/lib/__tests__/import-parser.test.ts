import { describe, it } from "vitest"

// TC-06: CSV and XLSX import parser unit tests
describe("parseImportFile — CSV", () => {
  it.todo("parses a CSV with Title/Action/Expected columns into test cases with steps")
  it.todo("preserves multi-step structure — 3 step rows produce 3 step objects")
  it.todo("handles multi-row format (one row per step, same title = same case)")
  it.todo("handles single-row format (steps pipe-delimited in one cell)")
  it.todo("returns an error for missing required Title column")
})

describe("parseImportFile — XLSX", () => {
  it.todo("parses an XLSX workbook into the same structure as CSV")
  it.todo("preserves step structure from XLSX multi-row format")
})
