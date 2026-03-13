import Papa from "papaparse"

export interface ParsedStep {
  action: string
  expected_result: string
  step_type?: string
}

export interface TestCaseImport {
  title: string
  preconditions?: string
  priority?: "critical" | "high" | "medium" | "low"
  suite?: string
  steps: ParsedStep[]
}

// Auto-detect column mapping from header row (case-insensitive)
function detectColumns(headers: string[]): {
  title?: number
  action?: number
  expected?: number
  preconditions?: number
  priority?: number
  suite?: number
  keyword?: number
} {
  const mapping: {
    title?: number
    action?: number
    expected?: number
    preconditions?: number
    priority?: number
    suite?: number
    keyword?: number
  } = {}
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().trim()
    if (["title", "test case", "name", "test name"].includes(lower)) mapping.title = i
    if (["action", "step", "step description", "description"].includes(lower)) mapping.action = i
    if (["expected", "expected result", "expected results"].includes(lower)) mapping.expected = i
    if (["preconditions", "precondition", "prerequisites"].includes(lower))
      mapping.preconditions = i
    if (["priority", "severity"].includes(lower)) mapping.priority = i
    if (["suite", "area", "module", "section", "folder", "group"].includes(lower)) mapping.suite = i
    if (["keyword", "step type", "step_type", "gwt", "type"].includes(lower)) mapping.keyword = i
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

const VALID_KEYWORDS = new Set(["given", "when", "then", "and", "but"])

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
      if (cols.suite !== undefined) {
        const s = row[cols.suite]?.trim()
        if (s) tc.suite = s
      }
      cases.set(title, tc)
    }

    const action = cols.action !== undefined ? row[cols.action]?.trim() : ""
    const expected = cols.expected !== undefined ? row[cols.expected]?.trim() : ""

    if (action) {
      const step: ParsedStep = { action, expected_result: expected || "" }
      if (cols.keyword !== undefined) {
        const raw = (row[cols.keyword] ?? "").toString().trim().toLowerCase()
        if (VALID_KEYWORDS.has(raw)) {
          step.step_type = raw
        }
      }
      cases.get(title)!.steps.push(step)
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
  suite?: string
  keyword?: string
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
    if (explicit.suite && h === explicit.suite) mapping.suite = i
    if (explicit.keyword && h === explicit.keyword) mapping.keyword = i
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
  if (mapping.suite !== undefined) result.suite = mapping.suite
  if (mapping.keyword !== undefined) result.keyword = mapping.keyword
  return result
}

export async function parseImportBuffer(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  explicit?: ExplicitColumnMapping
): Promise<TestCaseImport[]> {
  const lower = filename.toLowerCase()

  if (!lower.endsWith(".csv")) {
    throw new Error(`Unsupported file type — please upload a .csv file (received: "${filename}")`)
  }

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
