import { type NormalizedTestCase } from "./junit-parser.js"

// Re-export for convenience so consumers only need to import from allure-parser
export type { NormalizedTestCase }

interface AllureStatusDetails {
  message?: string
  trace?: string
}

interface AllureResult {
  uuid?: string
  name?: string
  fullName?: string
  status?: string
  start?: number
  stop?: number
  statusDetails?: AllureStatusDetails
  labels?: Array<{ name: string; value: string }>
}

function mapAllureStatus(status: string | undefined): "pass" | "fail" | "skipped" {
  switch (status) {
    case "passed":
      return "pass"
    case "failed":
    case "broken":
      return "fail"
    case "skipped":
    case "unknown":
    default:
      return "skipped"
  }
}

function normalizeAllureResult(result: AllureResult): NormalizedTestCase {
  const name = result.name ?? result.uuid ?? ""
  const fullName = result.fullName ?? result.name ?? result.uuid ?? ""
  const classname = null // Allure does not have a direct classname field

  const durationMs =
    result.start !== undefined && result.stop !== undefined
      ? result.stop - result.start
      : null

  const status = mapAllureStatus(result.status)
  const failureMessage = result.statusDetails?.message ?? null
  const failureBody = result.statusDetails?.trace ?? null

  return { name, classname, fullName, durationMs, status, failureMessage, failureBody }
}

/**
 * Parse an Allure JSON string (single result object or array of results) into
 * the shared NormalizedTestCase format.
 *
 * Supports all 5 Allure result statuses:
 *   passed  -> pass
 *   failed  -> fail
 *   broken  -> fail
 *   skipped -> skipped
 *   unknown -> skipped
 *
 * Throws an Error if:
 *   - The input starts with "PK" (ZIP magic bytes). Users must send individual
 *     *-result.json files, not an Allure ZIP archive.
 *   - The input is not valid JSON.
 */
export function parseAllureJson(raw: string): NormalizedTestCase[] {
  // ZIP detection: Allure archives start with PK (ZIP magic bytes 0x50 0x4B)
  if (raw.startsWith("PK")) {
    throw new Error(
      "Allure ZIP ingestion not supported — send individual *-result.json files"
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Allure JSON parse error: ${String(err)}`)
  }

  const results: AllureResult[] = Array.isArray(parsed) ? parsed : [parsed as AllureResult]
  return results.map(normalizeAllureResult)
}
