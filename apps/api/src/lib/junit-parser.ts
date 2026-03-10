import { XMLParser } from "fast-xml-parser"

export interface NormalizedTestCase {
  name: string
  classname: string | null
  fullName: string
  durationMs: number | null
  status: "pass" | "fail" | "skipped"
  failureMessage: string | null
  failureBody: string | null
}

// These paths force single-child nodes to be wrapped in arrays.
// Without this, a <testsuite> with one <testcase> would parse as an object, not an array,
// causing .map() to crash on single-test suites (Pitfall 1).
const ALWAYS_ARRAY_PATHS = [
  "testsuites.testsuite",
  "testsuites.testsuite.testcase",
  "testsuite.testcase",
]

const junitParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  cdataPropName: "__cdata",
  isArray: (_name: string, jpath: string) => ALWAYS_ARRAY_PATHS.includes(jpath),
})

interface ParsedSuite {
  testcase?: ParsedTestcase | ParsedTestcase[]
}

interface ParsedTestcase {
  "@_name"?: string
  "@_classname"?: string
  "@_time"?: string
  failure?: Record<string, unknown>
  error?: Record<string, unknown>
  skipped?: unknown
}

/**
 * Parse a JUnit XML string into normalized test case results.
 *
 * Handles all 5 target CI variants:
 * - pytest-junit: <testsuites> wrapper root
 * - Maven Surefire: bare <testsuite> root, both <failure> and <error> children
 * - Gradle: bare <testsuite> root, <error> children
 * - Jest-junit: <testsuites> wrapper, describe-block classnames
 * - Go gotestsum: <testsuites> wrapper, Go package path classnames
 *
 * Edge cases:
 * - Single testcase suites: handled via isArray config (no array collapse crash)
 * - Both <failure> and <error> children map to "fail" status
 * - Missing classname: returns null (fullName falls back to name only)
 * - Missing time attribute: returns null durationMs
 * - Invalid XML: throws Error with "JUnit XML parse error" prefix
 * - Unrecognized but valid XML: returns empty array (does not throw)
 */
export function parseJUnitXml(raw: string): NormalizedTestCase[] {
  let parsed: Record<string, unknown>
  try {
    parsed = junitParser.parse(raw) as Record<string, unknown>
  } catch (e) {
    throw new Error(`JUnit XML parse error: ${(e as Error).message}`)
  }

  // Normalize root element — handle both <testsuites> wrapper and bare <testsuite>
  // Pitfall 2: Surefire/Gradle use bare <testsuite> root; pytest/Jest/gotestsum use <testsuites>
  let suites: ParsedSuite[]
  if (parsed.testsuites) {
    const ts = (parsed.testsuites as Record<string, unknown>).testsuite
    if (!ts) return []
    suites = Array.isArray(ts) ? (ts as ParsedSuite[]) : [ts as ParsedSuite]
  } else if (parsed.testsuite) {
    const ts = parsed.testsuite
    suites = Array.isArray(ts) ? (ts as ParsedSuite[]) : [ts as ParsedSuite]
  } else {
    // Unrecognized format — return empty array, not throw
    return []
  }

  return suites.flatMap(suite => {
    const testcases = suite.testcase
    if (!testcases) return []
    // Safety: isArray config should have already wrapped single testcase in array,
    // but guard here as a fallback in case the jpath didn't match exactly.
    const cases = Array.isArray(testcases) ? testcases : [testcases as ParsedTestcase]
    return cases.map(tc => normalizeTestcase(tc))
  })
}

function normalizeTestcase(tc: ParsedTestcase): NormalizedTestCase {
  const name = String(tc["@_name"] ?? "")
  const classname = tc["@_classname"] ? String(tc["@_classname"]) : null
  const fullName = classname ? `${classname}.${name}` : name

  const timeAttr = tc["@_time"]
  const durationMs =
    timeAttr !== undefined && timeAttr !== null && timeAttr !== ""
      ? Math.round(parseFloat(String(timeAttr)) * 1000)
      : null

  // Determine status — both <failure> and <error> children map to "fail" (Pitfall 3)
  let status: "pass" | "fail" | "skipped" = "pass"
  let failureMessage: string | null = null
  let failureBody: string | null = null

  if (tc.failure !== undefined || tc.error !== undefined) {
    status = "fail"
    const elem = (tc.failure ?? tc.error) as Record<string, unknown>
    const rawMessage = elem["@_message"]
    failureMessage = rawMessage !== undefined ? String(rawMessage) : null
    // Body may be in #text (plain text) or __cdata (CDATA section)
    const rawBody = elem["#text"] ?? elem.__cdata
    failureBody = rawBody !== undefined ? String(rawBody) : null
  } else if (tc.skipped !== undefined) {
    status = "skipped"
  }

  return { name, classname, fullName, durationMs, status, failureMessage, failureBody }
}
