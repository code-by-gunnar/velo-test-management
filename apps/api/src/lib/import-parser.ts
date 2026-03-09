import Papa from "papaparse"
import ExcelJS from "exceljs"

export interface ParsedStep {
  action: string
  expected_result: string
}

export interface TestCaseImport {
  title: string
  preconditions?: string
  priority?: "critical" | "high" | "medium" | "low"
  steps: ParsedStep[]
}

// Auto-detect column mapping from header row (case-insensitive)
function detectColumns(headers: string[]): {
  title?: number
  action?: number
  expected?: number
  preconditions?: number
  priority?: number
} {
  const mapping: {
    title?: number
    action?: number
    expected?: number
    preconditions?: number
    priority?: number
  } = {}
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().trim()
    if (["title", "test case", "name", "test name"].includes(lower)) mapping.title = i
    if (["action", "step", "step description", "description"].includes(lower)) mapping.action = i
    if (["expected", "expected result", "expected results"].includes(lower)) mapping.expected = i
    if (["preconditions", "precondition", "prerequisites"].includes(lower))
      mapping.preconditions = i
    if (["priority", "severity"].includes(lower)) mapping.priority = i
  })
  return mapping
}

function normalizePriority(
  val: string
): "critical" | "high" | "medium" | "low" | undefined {
  const v = val.toLowerCase().trim()
  if (v === "critical" || v === "high" || v === "medium" || v === "low") return v
  return undefined
}

// Group multi-row format (same title = same case, each row is a step)
function groupMultiRow(
  rows: string[][],
  cols: ReturnType<typeof detectColumns>
): TestCaseImport[] {
  const order: string[] = []
  const cases = new Map<string, TestCaseImport>()

  for (const row of rows) {
    const title = row[cols.title!]?.trim()
    if (!title) continue

    if (!cases.has(title)) {
      order.push(title)
      // Build the object without optional keys set to undefined when exactOptionalPropertyTypes=true
      const tc: TestCaseImport = { title, steps: [] }
      if (cols.preconditions !== undefined) {
        const pre = row[cols.preconditions]?.trim()
        if (pre) tc.preconditions = pre
      }
      if (cols.priority !== undefined) {
        const pri = normalizePriority(row[cols.priority] ?? "")
        if (pri) tc.priority = pri
      }
      cases.set(title, tc)
    }

    const action = cols.action !== undefined ? row[cols.action]?.trim() : ""
    const expected = cols.expected !== undefined ? row[cols.expected]?.trim() : ""

    if (action) {
      cases.get(title)!.steps.push({ action, expected_result: expected || "" })
    }
  }

  return order.map((t) => cases.get(t)!)
}

export interface ExplicitColumnMapping {
  title?: string
  action?: string
  expected?: string
  preconditions?: string
  priority?: string
}

// Build column index map from an explicit user-supplied header → field mapping
function applyExplicitMapping(
  headers: string[],
  explicit: ExplicitColumnMapping
): ReturnType<typeof detectColumns> {
  const mapping: ReturnType<typeof detectColumns> = {}
  headers.forEach((h, i) => {
    if (explicit.title && h === explicit.title) mapping.title = i
    if (explicit.action && h === explicit.action) mapping.action = i
    if (explicit.expected && h === explicit.expected) mapping.expected = i
    if (explicit.preconditions && h === explicit.preconditions) mapping.preconditions = i
    if (explicit.priority && h === explicit.priority) mapping.priority = i
  })
  // Fall back to auto-detection for any field not explicitly mapped.
  // Spread auto first, then overwrite only the fields that were explicitly resolved
  // (avoids assigning `number | undefined` to optional number props under exactOptionalPropertyTypes).
  const auto = detectColumns(headers)
  const result: ReturnType<typeof detectColumns> = { ...auto }
  if (mapping.title !== undefined) result.title = mapping.title
  if (mapping.action !== undefined) result.action = mapping.action
  if (mapping.expected !== undefined) result.expected = mapping.expected
  if (mapping.preconditions !== undefined) result.preconditions = mapping.preconditions
  if (mapping.priority !== undefined) result.priority = mapping.priority
  return result
}

export async function parseImportBuffer(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  explicit?: ExplicitColumnMapping
): Promise<TestCaseImport[]> {
  const lower = filename.toLowerCase()

  if (lower.endsWith(".csv")) {
    // Convert to string — works for both Buffer and ArrayBuffer
    const text =
      buffer instanceof Buffer
        ? buffer.toString("utf-8")
        : new TextDecoder().decode(buffer)

    const result = Papa.parse<string[]>(text, { skipEmptyLines: true })
    const [headerRow, ...dataRows] = result.data
    if (!headerRow) throw new Error("Missing required column: title")
    const cols = explicit ? applyExplicitMapping(headerRow, explicit) : detectColumns(headerRow)
    if (cols.title === undefined) throw new Error("Missing required column: title")
    return groupMultiRow(dataRows, cols)
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = new ExcelJS.Workbook()
    // ExcelJS types expect legacy Buffer — cast via unknown to satisfy older @types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error("XLSX workbook contains no worksheets")
    const rows: string[][] = []
    ws.eachRow((row) => {
      // ExcelJS row.values is 1-indexed (index 0 is always undefined); slice(1) removes it
      rows.push(
        (row.values as (ExcelJS.CellValue | undefined)[])
          .slice(1)
          .map((v) => (v !== null && v !== undefined ? String(v) : ""))
      )
    })
    const [headerRow, ...dataRows] = rows
    if (!headerRow) throw new Error("Missing required column: title")
    const cols = explicit ? applyExplicitMapping(headerRow, explicit) : detectColumns(headerRow)
    if (cols.title === undefined) throw new Error("Missing required column: title")
    return groupMultiRow(dataRows, cols)
  }

  throw new Error("Unsupported file type — please upload a .csv or .xlsx file")
}
