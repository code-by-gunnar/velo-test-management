import { describe, it, expect } from "vitest"
import { toCsv } from "../export.js"

// VEL-47 / audit #11: CSV/DDE formula injection. A cell whose value starts with
// = + - @ tab or CR is executed as a formula when the export opens in Excel or
// Google Sheets. toCsv must neutralize these by prefixing an apostrophe, while
// still applying normal CSV quoting.

describe("toCsv — formula injection neutralization (VEL-47)", () => {
  it("prefixes a leading '=' formula with an apostrophe (and quotes it)", () => {
    const csv = toCsv([{ title: '=HYPERLINK("http://evil","clickme")' }])
    const [, dataRow] = csv.split("\n")
    // The cell must start with '= (apostrophe then equals), not a bare =
    expect(dataRow!.startsWith('"\'=')).toBe(true)
    expect(dataRow!.includes('"\'=HYPERLINK')).toBe(true)
  })

  it("neutralizes each dangerous leading character = + - @ tab CR", () => {
    for (const ch of ["=", "+", "-", "@", "\t", "\r"]) {
      const csv = toCsv([{ v: `${ch}cmd` }])
      const dataRow = csv.split("\n")[1]!
      // Strip any surrounding CSV quotes to inspect the raw cell
      const cell = dataRow.startsWith('"') ? dataRow.slice(1, -1).replace(/""/g, '"') : dataRow
      expect(cell.startsWith("'")).toBe(true)
      expect(cell[1]).toBe(ch)
    }
  })

  it("leaves safe values untouched (no apostrophe)", () => {
    const csv = toCsv([{ title: "Login works", count: 3 }])
    const dataRow = csv.split("\n")[1]!
    expect(dataRow).toBe("Login works,3")
  })

  it("does not prefix a '-' that isn't leading (e.g. mid-string)", () => {
    const csv = toCsv([{ v: "a-b" }])
    expect(csv.split("\n")[1]).toBe("a-b")
  })

  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("")
  })

  it("still CSV-quotes a neutralized value containing a comma", () => {
    const csv = toCsv([{ v: "=SUM(A1,A2)" }])
    const dataRow = csv.split("\n")[1]!
    // Contains a comma → must be quoted, and inner content starts with '=
    expect(dataRow.startsWith('"')).toBe(true)
    expect(dataRow.includes("'=SUM(A1,A2)")).toBe(true)
  })
})
