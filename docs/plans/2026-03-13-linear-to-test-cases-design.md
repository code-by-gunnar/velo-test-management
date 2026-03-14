# Linear Issue to Test Cases — AI-Powered Conversion

## Problem

Product owners write detailed feature specs with acceptance criteria in Linear issues. QA engineers then manually re-type those criteria as test cases in their test management tool. In 2 out of 3 cases, this transfer never happens due to time constraints. The result: test coverage gaps, duplicated effort, and specs that drift from what's actually tested.

This is the core shift-left failure — the spec exists, the test criteria are already written, but the tooling gap between "spec" and "test case" is large enough that teams skip it.

## Solution

Let QA engineers paste a Linear issue ID into Velo and get AI-generated test cases extracted from the issue's acceptance criteria. The QA reviews, edits, and imports — turning a 30-minute manual transcription into a 2-minute review.

No other test management tool does this.

## User Flow

### Entry Point

From the Cases page, a new button in the toolbar: "Import from Linear" (next to existing CSV Import). Only visible when the workspace has a Linear connection.

### Step 1: Issue Input

A modal opens. The QA pastes a Linear issue identifier (e.g., `VEL-42`) into a text input. They press Enter or click "Fetch".

Velo backend fetches the issue from Linear using the workspace's stored OAuth token. If the issue isn't found or the token is invalid, show a clear error.

### Step 2: AI Parsing Preview

The modal expands to show:

**Left side — Source (read-only):**
- Issue title (e.g., "User can reset password via email")
- Issue description rendered as markdown (scrollable)
- Link to open the issue in Linear

**Right side — Generated test cases (editable):**
- AI-extracted test cases, each with:
  - Title (editable text input)
  - Steps (editable, using the same step editor as the rest of Velo)
  - For GWT projects: steps use Given/When/Then keywords
  - For traditional projects: steps use Action / Expected Result

The QA can:
- Edit any title or step inline
- Delete a generated case they don't want
- Add a new blank case if the AI missed something
- Re-generate (retry with the same issue, useful if they want a different interpretation)

### Step 3: Import

The QA clicks "Import N cases". Cases are created in the current project, optionally assigned to a selected suite. Each case gets a metadata link back to the Linear issue (stored as `source_issue_id` and `source_issue_url` on the test case).

A success message shows: "Imported 4 test cases from VEL-42" with a link to view them.

## Architecture

### Backend: New Endpoint

```
POST /api/workspaces/:workspaceId/projects/:projectId/linear-import
Body: { issue_id: string }
Response: {
  issue: { id: string, title: string, description: string, url: string },
  suggested_cases: Array<{
    title: string,
    steps: Array<{ action: string, expected_result: string, step_type?: string }>
  }>
}
```

**Flow inside the endpoint:**

1. Validate workspace has a Linear connection → fetch encrypted token from `linear_connections`
2. Call Linear GraphQL API to fetch the issue (new `getLinearIssue()` function in `linear-client.ts`)
3. Call Claude API with the issue description + project's `test_format` to extract test cases
4. Return the issue metadata + suggested cases to the frontend

### Linear API Call

Add to `linear-client.ts`:

```typescript
export async function getLinearIssue(accessToken: string, issueId: string) {
  // GraphQL query for issue { id, identifier, title, description, url }
}
```

Linear's GraphQL API supports fetching by identifier (e.g., "VEL-42") via the `issue(id: "VEL-42")` query.

### Claude API Call

The prompt should be structured to:
- Extract acceptance criteria, test scenarios, or behavioral requirements from the markdown
- Output structured JSON matching the test case format
- Adapt to the project's format (traditional steps or GWT)
- Handle varied input quality (bullet lists, paragraphs, checkboxes, tables)
- Return empty array if no testable criteria are found (not hallucinate tests)

**Prompt structure (simplified):**

```
You are a QA engineer extracting test cases from a feature specification.

Project format: {steps|gwt}

Feature specification:
---
{issue.title}

{issue.description}
---

Extract test cases. Each case should have a clear title and concrete steps.
For "steps" format: each step has an "action" and "expected_result".
For "gwt" format: each step has a "step_type" (given/when/then/and/but) and "action".

Return JSON array. If no testable criteria found, return [].
```

**Model:** Use `claude-sonnet-4-6` for speed/cost balance. The parsing task is well-defined and doesn't need opus-level reasoning.

### Database Changes

**Option A (lean):** No schema changes. Store the Linear issue URL in the test case `preconditions` field as a reference link. Downside: mixes metadata with user content.

**Option B (proper):** Add two optional columns to `test_cases`:

```sql
ALTER TABLE test_cases
  ADD COLUMN source_url VARCHAR(500),
  ADD COLUMN source_ref VARCHAR(100);
```

- `source_url`: Link back to the Linear issue (e.g., "https://linear.app/velodev/issue/VEL-42/...")
- `source_ref`: The issue identifier (e.g., "VEL-42")

These are generic — not Linear-specific. Could later support GitHub Issues, Jira, etc.

**Recommendation:** Option B. Two nullable columns, clean separation, enables future "View source spec" links in the UI.

### Frontend Components

**New files:**
- `LinearImportModal.tsx` — the two-panel modal (source + preview)
- `useLinearImport.ts` — hook managing fetch/parse state

**Modified files:**
- `CasesPage.tsx` — add "Import from Linear" button (conditional on Linear connection)
- Possibly a lightweight `GET /linear/status` check to show/hide the button

## Cost & Rate Limiting

Each import makes one Claude API call. At ~500 tokens input (typical issue description) + ~1000 tokens output (3-5 test cases), cost is roughly $0.003 per import. Negligible.

Rate limit the endpoint to prevent abuse: 10 imports per minute per workspace.

## Edge Cases

1. **Issue has no description:** Return error "This issue has no description to extract test cases from"
2. **Description has no testable criteria:** Claude returns empty array → show "No test cases could be extracted from this issue. The description may not contain testable acceptance criteria."
3. **Very long description:** Truncate to 4000 chars before sending to Claude (descriptions beyond this are rare and the extra content is usually context, not criteria)
4. **Linear token expired:** Return 401-style error → "Linear connection expired. Reconnect in Workspace Settings."
5. **Issue not found:** Return 404 → "Issue VEL-999 not found. Check the identifier and try again."
6. **Duplicate import:** No guard needed — QA may intentionally re-import after the spec updates. Cases are created fresh each time.

## What This Is NOT

- **Not auto-sync.** This is a manual, intentional action. The QA decides when to import and reviews everything before saving.
- **Not a Linear browser.** Paste an ID, get results. No issue picker, no search, no project navigation.
- **Not a replacement for QA judgment.** The AI suggests, the QA decides. Every field is editable before import.
- **Not Jira/GitHub support (yet).** Linear only for v1. The architecture (source_url/source_ref columns, generic prompt) supports other sources later.

## Success Metrics

- Time from "spec written" to "test cases exist" drops from 30+ minutes to under 2 minutes
- Test case coverage of new features increases (measurable by source_ref linkage)
- QA engineers actually use it (track import count per workspace)

## Landing Page Angle

This is a headline feature. Suggested card:

**"Spec to Test in 2 Minutes"**
"Paste a Linear issue ID. AI reads the acceptance criteria and generates test cases — traditional steps or BDD. Review, tweak, import. Your specs become tests before the sprint starts."

## Implementation Estimate

- 1 new Linear client function (~20 lines)
- 1 new API endpoint (~80 lines)
- 1 Claude prompt template (~30 lines)
- 1 migration (2 columns, ~5 lines)
- 2 new frontend files (~300 lines total)
- 1 modified file (CasesPage button)
- Total: ~435 lines of new code
