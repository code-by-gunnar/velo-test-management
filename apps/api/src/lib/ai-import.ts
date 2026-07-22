import { getAiClientForWorkspace, getActiveProvider } from "./ai.js"
import { parseAiTestCases, type ParsedCase } from "./parse-ai-cases.js"
import { withWorkspace } from "../db/tenant.js"
import { decrypt } from "./encryption.js"
import { getLinearIssueDetail } from "./linear-client.js"
import { captureEvent } from "./posthog.js"

// The Linear-issue → AI spec-to-test extraction, extracted from the linear-import
// route (VEL-61) so the slow part (Linear fetch + a up-to-60s AI call) runs in the
// ai-import BullMQ worker instead of a synchronous request that can hit a
// reverse-proxy/gateway idle timeout on slow local models. Never throws — always
// resolves to a result the poll endpoint can surface. Mirrors the deliverWebhook
// extraction (logic in lib/, thin worker, unit-testable without a queue).

export interface AiImportInput {
  workspaceId: string
  projectId: string
  issueId: string
  userId: string
}

export interface AiImportIssue {
  id: string
  identifier: string
  title: string
  // string|null to match Linear's LinearIssueDetail; the no_description guard
  // guarantees a non-empty string before it's ever used downstream.
  description: string | null
  url: string
}

export interface AiImportSuccess {
  status: "done"
  issue: AiImportIssue
  suggested_cases: ParsedCase[]
  parse_failed: boolean
}

export type AiImportErrorCode =
  | "no_ai"
  | "no_connection"
  | "issue_not_found"
  | "no_description"
  | "linear_failed"
  | "ai_failed"

export interface AiImportFailure {
  status: "error"
  code: AiImportErrorCode
  error: string
  // Included on no_description so the UI keeps issue context (matches the old 422).
  issue?: AiImportIssue
}

export type AiImportResult = AiImportSuccess | AiImportFailure

interface Logger {
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

export async function runLinearAiImport(input: AiImportInput, log: Logger): Promise<AiImportResult> {
  const { workspaceId, projectId, issueId, userId } = input
  try {
    // Resolve the AI client for this workspace's active provider (workspace key →
    // env fallback). Quick lookup only — the long AI call is below.
    const ai = await getAiClientForWorkspace(workspaceId)
    if (!ai) {
      return { status: "error", code: "no_ai", error: "No AI provider configured. Add a key in Settings → Integrations." }
    }

    // Linear connection + project format in one transaction.
    const { connection, testFormat } = await withWorkspace(workspaceId, async (tx) => {
      const [connRows, projRows] = await Promise.all([
        tx`SELECT access_token_enc, api_key_enc FROM linear_connections
           WHERE workspace_id = current_setting('app.workspace_id', true)::uuid`,
        tx`SELECT test_format FROM projects WHERE id = ${projectId}::uuid LIMIT 1`,
      ])
      return {
        connection: connRows.length > 0 ? connRows[0] as unknown as { access_token_enc: string; api_key_enc: string | null } : null,
        testFormat: (projRows[0] as unknown as { test_format: string } | undefined)?.test_format ?? "steps",
      }
    })

    if (!connection) {
      return { status: "error", code: "no_connection", error: "No Linear connection. Connect Linear in Workspace Settings." }
    }

    // Fetch the Linear issue (prefer API key over legacy OAuth token).
    let issue: AiImportIssue
    try {
      const accessToken = connection.api_key_enc
        ? decrypt(connection.api_key_enc)
        : decrypt(connection.access_token_enc)
      issue = await getLinearIssueDetail(accessToken, issueId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      if (msg.includes("Entity not found")) {
        return { status: "error", code: "issue_not_found", error: `Issue ${issueId} not found. Check the identifier and try again.` }
      }
      return { status: "error", code: "linear_failed", error: "Failed to fetch issue from Linear. The connection may have expired." }
    }

    if (!issue.description || issue.description.trim().length === 0) {
      return {
        status: "error",
        code: "no_description",
        error: "This issue has no description to extract test cases from.",
        issue: { ...issue, description: "" },
      }
    }

    // Truncate description to ~4000 chars for the model.
    const description = issue.description.length > 4000
      ? issue.description.slice(0, 4000) + "\n\n[description truncated]"
      : issue.description

    const formatInstructions = testFormat === "gwt"
      ? `For "gwt" format: each step must have a "step_type" field (one of: "given", "when", "then", "and", "but") and an "action" field (the step description text). Do NOT include an "expected_result" field.`
      : `For "steps" format: each step must have an "action" field (what the tester does) and an "expected_result" field (what should happen).`

    const prompt = `You are a senior QA engineer extracting test cases from a feature specification.

Project test format: ${testFormat}

Feature specification:
---
Title: ${issue.title}

${description}
---

Extract test cases from the acceptance criteria, requirements, or behavioral descriptions above. Each test case should be a realistic, specific scenario a QA engineer would execute.

Rules:
- Each test case needs a clear, descriptive title
- ${formatInstructions}
- Include both positive (happy path) and negative (error/edge) scenarios when the spec implies them
- Do NOT invent requirements not present in the spec
- If no testable criteria are found, return an empty array

Return ONLY a JSON array. No markdown, no code fences, no explanation. Example structure:
${testFormat === "gwt"
  ? `[{"title":"User can log in with valid credentials","steps":[{"step_type":"given","action":"the user is on the login page"},{"step_type":"when","action":"they enter valid credentials"},{"step_type":"then","action":"they are redirected to the dashboard"}]}]`
  : `[{"title":"User can log in with valid credentials","steps":[{"action":"Navigate to login page","expected_result":"Login form is displayed"},{"action":"Enter valid email and password","expected_result":"Credentials accepted"},{"action":"Click Sign In","expected_result":"User redirected to dashboard"}]}]`
}`

    let { cases: suggestedCases, parseFailed } = parseAiTestCases(await ai.complete(prompt))

    // A parse failure means the model produced structured-looking output we
    // couldn't parse (small local models occasionally garble JSON). Retry once —
    // it's usually transient — before giving up.
    if (parseFailed) {
      ;({ cases: suggestedCases, parseFailed } = parseAiTestCases(await ai.complete(prompt)))
      if (parseFailed) {
        const provider = await getActiveProvider(workspaceId)
        log.warn({ provider, workspaceId, projectId, issueId }, "AI returned unparseable JSON for linear-import after retry")
      }
    }

    captureEvent(userId, "test_cases_imported_linear_ai", {
      workspace_id: workspaceId,
      project_id: projectId,
      suggested_count: suggestedCases.length,
      parse_failed: parseFailed,
    })

    return { status: "done", issue, suggested_cases: suggestedCases, parse_failed: parseFailed }
  } catch (err) {
    log.error({ err, workspaceId, projectId, issueId }, "AI completion failed for linear-import")
    return { status: "error", code: "ai_failed", error: "AI service temporarily unavailable. Please try again." }
  }
}
