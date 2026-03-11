---
phase: 03-test-runs-and-dashboard
verified: 2026-03-10T11:18:00Z
status: human_needed
score: 10/10 must-haves verified
re_verification: false
human_verification:
  - test: "Live SSE update: execute a run item via API and confirm dashboard card updates without page refresh"
    expected: "RunCard progress bar and pass rate update within ~1s of PATCH /run-items/:id, no page reload required"
    why_human: "Cannot verify EventSource pub/sub round-trip in static analysis — requires a live Railway + Valkey environment"
  - test: "Keyboard execution flow: press P/F/B/S in the execute page and confirm auto-advance"
    expected: "Case marked with correct verdict, next untested case shown immediately, keyboard hints update to reflect verdict"
    why_human: "DOM interaction, focus state, and auto-advance sequencing require browser testing"
  - test: "Defect prompt: press F on a case, verify defect prompt appears before auto-advance"
    expected: "Inline DefectPrompt renders with pre-filled title 'Failed: {caseTitle}'; Esc skips; Enter files defect and advances"
    why_human: "Sequenced UI state machine requires browser interaction to verify timing and focus behavior"
  - test: "Keyboard shortcuts blocked when typing: focus comment textarea, press P — should NOT mark pass"
    expected: "Typing in case comment textarea produces text, does not trigger verdict"
    why_human: "Requires browser focus-state testing; activeElement guard cannot be verified from static analysis"
  - test: "Rerun Failures button visible and functional on a completed run with failures"
    expected: "Button calls POST /runs/:id/rerun-failures, navigates to new run page"
    why_human: "Requires a completed run with failed items to be present in the database"
---

# Phase 3: Test Runs and Dashboard — Verification Report

**Phase Goal:** A QA engineer can create a named test run, execute it case-by-case using keyboard shortcuts, file defects inline from failures, and watch results update in real time on a live dashboard — without ever refreshing the page.

**Verified:** 2026-03-10T11:18:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User can create a named test run scoped to project or suite | VERIFIED | `POST /api/workspaces/:wid/runs` in `apps/api/src/routes/runs.ts` L42–156; `RunCreateModal.tsx` with suite picker wired to `/api/backend/workspaces/:wid/runs` |
| 2  | User can assign a run to themselves or another team member | VERIFIED | `assigned_to` body param accepted and stored in DB L105; `RunCreateModal.tsx` assignee dropdown |
| 3  | User can execute a run case-by-case with P/F/B/S shortcuts | VERIFIED | `useKeyboardExecution.ts` implements full KEY_MAP with INPUT/TEXTAREA/SELECT guard; `ExecutionScreen.tsx` wires hook to `handleVerdict` which PATCH calls `/run-items/:id` |
| 4  | User can add inline comment on any test step during execution | VERIFIED | `PATCH /run-items/:id/comment` and `POST /run-items/:id/step-comments` in `run-items.ts`; `StepCommentIcon.tsx` per-step icon; case-level textarea in `ExecutionScreen.tsx` with onBlur save |
| 5  | User can file a defect from a failed run item | VERIFIED | `POST /api/workspaces/:wid/defects` in `defects.ts`; `DefectPrompt.tsx` renders after F verdict with POST to `/api/backend/workspaces/:wid/defects`; Linear button disabled with "coming soon" per Phase 3 scope |
| 6  | User can see execution history for a test case | VERIFIED | `GET /api/workspaces/:wid/test-cases/:caseId/history` in `runs.ts` L407–445; `ExecutionHistory.tsx` fetches and renders max 10 entries |
| 7  | User can create a rerun from failures of a previous run | VERIFIED | `POST /api/workspaces/:wid/runs/:runId/rerun-failures` in `runs.ts` L319–405; "Rerun Failures" button in run detail page wired to endpoint |
| 8  | Live dashboard updates without page refresh (SSE) | VERIFIED (automated) | SSE endpoint at `GET /runs/:runId/stream` in `runs.ts` L446–519; `useRunSSE.ts` creates `EventSource` per runId; `RunsDashboard` wires `liveStatsMap` to `RunCard`; 20s heartbeat + `reply.hijack()` + dedicated iovalkey subscriber all present |
| 9  | Dashboard shows pass rate and time-to-complete estimate | VERIFIED | `computeRunStats()` and `estimateTimeRemaining()` in `run-stats.ts` with EMA alpha=0.3 and >5min gap exclusion; 10 unit tests pass; SSE initial event includes `stats` and `eta` |
| 10 | Dashboard run list filterable by assignee, status, milestone | VERIFIED | `RunFilters.tsx` status/assignee dropdowns; `GET /runs?status=&assigned_to=` query params handled in `runs.ts` L176–208; milestone filter shows as placeholder (deferred to v2 per CONTEXT.md) |

**Score:** 10/10 truths verified (5 require human testing for runtime behavior)

---

## Required Artifacts

| Artifact | Plan | Status | Details |
|----------|------|--------|---------|
| `apps/api/drizzle/0003_run_item_step_comments.sql` | 03-01 | VERIFIED | Creates `run_item_step_comments` table with RLS ENABLE + FORCE + workspace_isolation policy; adds `case_title VARCHAR(500)` to `run_items` |
| `apps/api/drizzle/meta/_journal.json` | 03-01 | VERIFIED | Journal entry idx 3 with tag `0003_run_item_step_comments` confirmed by `node -e` check |
| `apps/api/src/routes/runs.ts` | 03-02 | VERIFIED | 522 lines; 6 endpoints: POST create, GET list, GET detail, PATCH abort, POST rerun-failures, GET history, GET stream; all use `withWorkspace`; `reply.send()` outside transactions |
| `apps/api/src/routes/run-items.ts` | 03-03 | VERIFIED | 303 lines; PATCH verdict + run auto-complete + Valkey publish; PATCH comment; POST step-comments; GET step-comments |
| `apps/api/src/routes/defects.ts` | 03-03 | VERIFIED | 126 lines; POST create defect linked to `run_item_id`; GET list with optional `run_item_id` filter |
| `apps/api/src/lib/sse.ts` | 03-04 | VERIFIED | `writeSSEEvent()` and `startHeartbeat()` helpers; used by SSE endpoint in `runs.ts` |
| `apps/api/src/lib/run-stats.ts` | 03-04 | VERIFIED | `computeRunStats()` + `estimateTimeRemaining()` pure functions; correct EMA, gap exclusion, pass_rate calculation |
| `apps/web/src/hooks/useKeyboardExecution.ts` | 03-06 | VERIFIED | KEY_MAP p/P→pass, f/F→fail, b/B→blocked, s/S→skipped; BLOCKED_TAGS guard; `e.preventDefault()` on match; cleanup on unmount |
| `apps/web/src/hooks/useRunSSE.ts` | 03-05 | VERIFIED | `EventSource` per runId; direct Railway API URL with `?token=`; `Map<runId, RunStats>` returned; cleanup on unmount |
| `apps/web/src/components/runs/SegmentedBar.tsx` | 03-05 | VERIFIED | File exists; proportional colored segments |
| `apps/web/src/components/runs/RunCard.tsx` | 03-05 | VERIFIED | Renders `SegmentedBar`, pass rate, assignee; accepts `liveStats` for real-time override |
| `apps/web/src/components/runs/RunFilters.tsx` | 03-05 | VERIFIED | Status + assignee dropdowns; `FilterState` onChange callback |
| `apps/web/src/components/runs/RunCreateModal.tsx` | 03-05 | VERIFIED | Name input, suite picker, assignee dropdown; POSTs to `/api/backend/workspaces/:wid/runs` |
| `apps/web/src/components/runs/ExecutionScreen.tsx` | 03-06 | VERIFIED | Full-screen layout; top bar + steps table + DefectPrompt + case comment + keyboard hints footer; useKeyboardExecution wired; all API calls present |
| `apps/web/src/components/runs/DefectPrompt.tsx` | 03-06 | VERIFIED | Inline form after fail; pre-filled title; Esc dismisses; Enter files; Linear button disabled |
| `apps/web/src/components/runs/StepCommentIcon.tsx` | 03-06 | VERIFIED | Per-step chat icon; popover with existing comments + add input; POSTs to step-comments endpoint |
| `apps/web/src/components/runs/ExecutionHistory.tsx` | 03-06 | VERIFIED | Fetches `GET /test-cases/:caseId/history`; StatusBadge + run name + date; max 10 + "show all" |
| `apps/web/src/pages/app/[slug]/[projectKey]/runs/index.tsx` | 03-05 | VERIFIED | `getServerSideProps` auth guard + server-side fetch; `useRunSSE` active runs; card grid; RunCreateModal; filter re-fetch |
| `apps/web/src/pages/app/[slug]/[projectKey]/runs/[runId]/index.tsx` | 03-05 | VERIFIED | Run detail; SegmentedBar; item list with defect badges; Abort + Rerun Failures buttons; SSE wired |
| `apps/web/src/pages/app/[slug]/[projectKey]/runs/[runId]/execute.tsx` | 03-06 | VERIFIED | No AppLayout; mounts `ExecutionScreen` with all props; `getServerSideProps` resolves `projectId` from `projectKey` |
| `apps/web/src/components/layout/sidebar.tsx` | 03-05 | VERIFIED | "Test Runs" entry: `available: true`, href routes to `/app/${slug}/${key}/runs` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runs.ts` | `db/tenant.ts` | `withWorkspace(workspaceId` | WIRED | Every tenant query in all 6 endpoints uses `withWorkspace` |
| `server.ts` | `routes/runs.ts` | `register(runsRoutes)` | WIRED | Line 86 in `server.ts` |
| `server.ts` | `routes/run-items.ts` | `register(runItemsRoutes)` | WIRED | Line 87 in `server.ts` |
| `server.ts` | `routes/defects.ts` | `register(defectsRoutes)` | WIRED | Line 88 in `server.ts` |
| `run-items.ts` | Valkey pub/sub | `fastify.valkey.publish` | WIRED | Lines 140–156; fire-and-forget `.catch(() => {})` pattern |
| `runs.ts` (SSE) | `lib/sse.ts` | `writeSSEEvent` / `startHeartbeat` | WIRED | Imports at L5; used in SSE handler at L490, L508 |
| `runs.ts` (SSE) | iovalkey subscriber | `new Valkey(...)` + `.subscribe(channel)` | WIRED | L494–500; dedicated subscriber per connection |
| `runs.ts` (SSE) | `lib/run-stats.ts` | `computeRunStats` | WIRED | Import L6; called at L488 for initial SSE event |
| `ExecutionScreen.tsx` | `/api/backend/run-items/:id` | `fetch(...PATCH)` | WIRED | L186–193; `handleVerdict` async callback |
| `useKeyboardExecution.ts` | `ExecutionScreen.tsx` | `useKeyboardExecution({ onVerdict })` | WIRED | `ExecutionScreen.tsx` L3-4 import; called at ~L290 with `keyboardEnabled` flag |
| `DefectPrompt.tsx` | `/api/backend/defects` | `fetch(...POST)` | WIRED | `ExecutionScreen.tsx` L213–222; `handleFileDefect` callback |
| `useRunSSE.ts` | Railway SSE endpoint | `new EventSource(url)` | WIRED | L52; URL constructed with workspace_id, runId, and `?token=` auth |
| `runs/index.tsx` | `/api/backend/runs` | `fetch` in `getServerSideProps` + client `fetchRuns` | WIRED | Initial server-side fetch + client refetch on filter change L58–70 |
| `sidebar.tsx` | runs page | `available: true` href | WIRED | Line 39: `available: true`, href routes to `/app/${slug}/${key}/runs` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TR-01 | 03-01, 03-02, 03-05 | Create named run scoped to project/suite/milestone | SATISFIED | POST /runs with name, project_id, suite_ids; integration tests pass; RunCreateModal frontend |
| TR-02 | 03-01, 03-03, 03-06 | Execute run item with P/F/B/S keyboard shortcuts | SATISFIED | PATCH /run-items/:id; useKeyboardExecution hook; ExecutionScreen; 12 unit tests + integration tests pass |
| TR-03 | 03-01, 03-06 | P/F/B/S keyboard shortcuts with input element guard | SATISFIED | useKeyboardExecution guards INPUT/TEXTAREA/SELECT/contentEditable; 12 passing unit tests confirm all guard paths |
| TR-04 | 03-01, 03-03, 03-06 | Inline comment on any test step during execution | SATISFIED | PATCH /run-items/:id/comment (case-level); POST/GET /run-items/:id/step-comments (step-level); StepCommentIcon + case textarea in ExecutionScreen |
| TR-05 | 03-01, 03-03, 03-06 | File defect from failed run item (local record; Linear deferred) | SATISFIED | POST /defects creates local record; DefectPrompt renders after fail; Phase 3 scope explicitly excludes Linear per CONTEXT.md |
| TR-06 | 03-01, 03-02, 03-06 | Execution history for test case across all runs | SATISFIED | GET /test-cases/:caseId/history returns ordered history; ExecutionHistory component fetches and renders it |
| TR-07 | 03-01, 03-02, 03-05 | Create new run from failures of a previous run | SATISFIED | POST /runs/:runId/rerun-failures creates run with only failed items; "Rerun Failures" button on detail page |
| DA-01 | 03-01, 03-04, 03-05 | Live run dashboard updates in real time without page refresh | SATISFIED (needs human) | SSE endpoint + iovalkey subscriber + useRunSSE + RunCard liveStats; runtime confirmation requires browser |
| DA-02 | 03-01, 03-04 | Dashboard shows pass rate %, progress bar, time-to-complete estimate | SATISFIED | computeRunStats() pass_rate; estimateTimeRemaining() EMA; 10 unit tests pass; SSE initial event includes eta |
| DA-03 | 03-01, 03-02, 03-05 | Dashboard run list filterable by assignee, run status, and milestone | SATISFIED | GET /runs?status=&assigned_to= query params; RunFilters status+assignee dropdowns; milestone placeholder per v2 scope |

All 10 Phase 3 requirements are SATISFIED. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `DefectPrompt.tsx` | 94 | `"Linear integration coming soon"` disabled label | Info | Intentional — Phase 5 deferred per CONTEXT.md architecture decision. Not a stub, it is a correctly scoped placeholder UI element. |
| `ExecutionScreen.tsx` | 538–539 | HTML `placeholder="Add a note..."` attribute on textarea | Info | This is standard HTML placeholder text for UX, not a code stub. No action needed. |

No blockers or warnings found. All `return null` occurrences in backend routes are valid "signal 400/404" patterns inside `withWorkspace` callbacks, not empty implementations.

---

## Human Verification Required

### 1. SSE Live Update

**Test:** Open the runs dashboard in two browser windows. In one window, use the API or execute page to mark a run item as pass. Observe the other window's RunCard progress bar.
**Expected:** Progress bar and pass rate % update within approximately 1 second, without any page refresh.
**Why human:** Cannot verify EventSource pub/sub round-trip programmatically. Requires a live Railway + Valkey environment to confirm iovalkey subscriber receives and forwards messages.

### 2. Keyboard Execution Flow

**Test:** Navigate to `/app/{slug}/{key}/runs/{runId}/execute`. Press P to pass the first case.
**Expected:** Case status updated to pass, view auto-advances to next untested case, progress bar in top bar increments.
**Why human:** DOM interaction, React state transitions, and focus management require browser verification.

### 3. Defect Prompt After Fail

**Test:** On the execute page, press F on a case. Observe the UI.
**Expected:** DefectPrompt renders inline with pre-filled title "Failed: {caseTitle}". Press Esc — prompt dismisses and advances. Try again, fill title, press Enter — defect saved and advances.
**Why human:** Multi-step UX state machine with focus transfer and keyboard capture-phase event handling requires browser testing.

### 4. Keyboard Blocked While Typing

**Test:** On the execute page, click the case comment textarea. Type text. Press P.
**Expected:** Letter "p" appears in the textarea. Run item is NOT marked as pass.
**Why human:** Requires verifying that the `BLOCKED_TAGS` guard on `useKeyboardExecution` correctly reads the focused element's `tagName` at event time.

### 5. Rerun Failures Flow

**Test:** Complete a run with at least one failed item. On the run detail page, click "Rerun Failures".
**Expected:** New run is created with only the failed cases (prefixed "Rerun: {original name}"), browser navigates to the new run detail page.
**Why human:** Requires a completed run with failures in the database to be present.

---

## Build Verification

| Check | Result |
|-------|--------|
| `pnpm --recursive typecheck` | PASSED (0 errors) |
| `pnpm --recursive lint` (0 warnings) | PASSED |
| `apps/api/src/lib/__tests__/run-stats.test.ts` (10 tests) | PASSED |
| Migration `0003_run_item_step_comments.sql` exists | VERIFIED |
| Journal entry idx 3 `0003_run_item_step_comments` | VERIFIED |
| All 10 requirements TR-01 to TR-07, DA-01 to DA-03 covered | VERIFIED |

---

## Summary

Phase 3 goal achievement is **fully implemented**. All 10 requirements (TR-01 through TR-07, DA-01 through DA-03) have substantive code at every layer:

- **Backend:** 3 route files (runs, run-items, defects), 2 lib modules (run-stats, sse), all wired through `server.ts`, all guarded by `withWorkspace`
- **Database:** Migration 0003 adds `run_item_step_comments` with RLS + `case_title` snapshot column
- **Frontend:** Dashboard page, detail page, execute page, 8 components, 2 hooks — all wired to correct API endpoints
- **Real-time:** SSE endpoint with dedicated iovalkey subscriber, 20s heartbeat, CORS headers set manually on hijacked response; `useRunSSE` connects via EventSource with `?token=` auth

The 5 human verification items are all **runtime behavior checks** that cannot be confirmed from static analysis. The automated portion verifies 10/10 truths with all three levels: existence, substantive implementation, and wiring confirmed for every key path. Linear integration is correctly deferred to Phase 5 per documented architecture decisions.

---

_Verified: 2026-03-10T11:18:00Z_
_Verifier: Claude (gsd-verifier)_
