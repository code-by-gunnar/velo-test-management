// Single source of truth for turning raw AI model output into test cases.
//
// Providers are prompted to return a bare JSON array. Frontier models comply
// reliably; smaller local models (Ollama qwen2.5, etc.) intermittently wrap the
// array in ```json fences, prepend prose, emit a trailing comma, or nest it
// under an object key. This normalizes all of those, and — critically —
// distinguishes a genuine empty result ("no testable criteria") from a format
// glitch we should retry, via the `parseFailed` flag.

export interface ParsedStep {
  action: string
  expected_result?: string
  step_type?: string
}

export interface ParsedCase {
  title: string
  steps: ParsedStep[]
}

export interface ParseResult {
  cases: ParsedCase[]
  /** True only when the model produced array/object-looking text we could not parse. */
  parseFailed: boolean
}

function normalizeStep(raw: unknown): ParsedStep | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.action !== "string" || r.action.trim() === "") return null
  const step: ParsedStep = { action: r.action }
  if (typeof r.expected_result === "string") step.expected_result = r.expected_result
  if (typeof r.step_type === "string") step.step_type = r.step_type
  return step
}

function normalizeCase(raw: unknown): ParsedCase | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== "string" || r.title.trim() === "") return null
  if (!Array.isArray(r.steps)) return null
  const steps = r.steps.map(normalizeStep).filter((s): s is ParsedStep => s !== null)
  return { title: r.title, steps }
}

/** Coerce parsed JSON into cases: an array directly, or the first array-valued property of an object. */
function toCases(value: unknown): ParsedCase[] | null {
  let arr: unknown[] | null = null
  if (Array.isArray(value)) {
    arr = value
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        arr = v
        break
      }
    }
  }
  if (arr === null) return null
  return arr.map(normalizeCase).filter((c): c is ParsedCase => c !== null)
}

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/** Pull the content out of a ```json … ``` (or plain ```) fence, if one is present. */
function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fenced ? fenced[1]! : text
}

function removeTrailingCommas(s: string): string {
  return s.replace(/,(\s*[\]}])/g, "$1")
}

export function parseAiTestCases(text: string): ParseResult {
  const trimmed = text.trim()
  if (trimmed === "") return { cases: [], parseFailed: false }

  const defenced = stripFences(trimmed).trim()

  // Try progressively more forgiving candidates: as-is, comma-cleaned, then the
  // outermost array/object substring (handles a prose preamble).
  const candidates: string[] = [defenced, removeTrailingCommas(defenced)]
  const arrMatch = defenced.match(/\[[\s\S]*\]/)
  if (arrMatch) candidates.push(arrMatch[0], removeTrailingCommas(arrMatch[0]))
  const objMatch = defenced.match(/\{[\s\S]*\}/)
  if (objMatch) candidates.push(objMatch[0], removeTrailingCommas(objMatch[0]))

  for (const candidate of candidates) {
    const parsed = tryParse(candidate)
    if (parsed === undefined) continue
    const cases = toCases(parsed)
    // Valid JSON that isn't case-shaped (number, null, plain string) is a
    // legitimate "nothing here" answer, not a parse failure.
    return { cases: cases ?? [], parseFailed: false }
  }

  // Nothing parsed. If the model was clearly attempting structured output, treat
  // it as a recoverable format glitch; otherwise it's a legitimate empty answer.
  const attemptedStructured = defenced.includes("[") || defenced.includes("{")
  return { cases: [], parseFailed: attemptedStructured }
}
