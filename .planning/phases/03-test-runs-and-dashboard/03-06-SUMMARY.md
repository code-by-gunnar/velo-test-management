---
phase: 03-test-runs-and-dashboard
plan: "06"
subsystem: web-execution-ui
tags: [execution, keyboard, defects, sse, runs, ui]
dependency_graph:
  requires: [03-03, 03-04]
  provides: [execution-screen, keyboard-hook, defect-prompt, step-comments, execution-history]
  affects: [web-pages-runs]
tech_stack:
  added: []
  patterns: [useCallback-fetch-pattern, keyboard-guard-hook, optional-spread-exactOptionalPropertyTypes]
key_files:
  created:
    - apps/web/src/hooks/useKeyboardExecution.ts
    - apps/web/src/components/runs/DefectPrompt.tsx
    - apps/web/src/components/runs/StepCommentIcon.tsx
    - apps/web/src/components/runs/ExecutionHistory.tsx
    - apps/web/src/components/runs/ExecutionScreen.tsx
    - apps/web/src/pages/app/[slug]/[projectKey]/runs/[runId]/execute.tsx
  modified:
    - apps/web/src/hooks/__tests__/useKeyboardExecution.test.ts
    - apps/web/src/components/runs/RunFilters.tsx
    - apps/web/src/pages/app/[slug]/[projectKey]/runs/index.tsx
decisions:
  - "useCallback wraps fetchHistory to avoid react-hooks/set-state-in-effect lint rule"
  - "Keyboard guard checks INPUT/TEXTAREA/SELECT tagName + isContentEditable"
  - "Linear integration button rendered but disabled (gray) — Phase 5 deferred"
  - "keyboardEnabled = false when defect prompt open OR comment textarea focused"
  - "Case steps fetched per-item on index change with cache to avoid refetching"
  - "Step comments cached per run_item_id — fetched fresh on each case navigation"
  - "exactOptionalPropertyTypes fix: use conditional spread for liveStats on RunCard"
metrics:
  duration_seconds: 415
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_created: 6
  files_modified: 3
---

# Phase 3 Plan 06: Keyboard-Driven Execution Screen Summary

Full-screen QA execution screen with P/F/B/S keyboard shortcuts, per-step comment popovers, inline defect prompt after fail, and execution history panel from previous runs.

## What Was Built

### useKeyboardExecution hook (`apps/web/src/hooks/useKeyboardExecution.ts`)

Custom hook implementing P/F/B/S keyboard shortcuts for test execution:
- Maps p/P→pass, f/F→fail, b/B→blocked, s/S→skipped
- Guards against INPUT, TEXTAREA, SELECT, and contentEditable targets
- Calls e.preventDefault() on matched keys
- Cleans up listener on unmount
- 12 unit tests covering all paths including enabled=false guard

### DefectPrompt (`apps/web/src/components/runs/DefectPrompt.tsx`)

Inline defect form rendered after a fail verdict:
- Pre-fills title with "Failed: {caseTitle}"
- Optional description textarea
- Esc key calls onSkip (captured in capture phase to prevent keyboard shortcuts re-firing)
- Linear integration button present but disabled with "coming soon" label

### StepCommentIcon (`apps/web/src/components/runs/StepCommentIcon.tsx`)

Per-step comment icon in the steps table:
- Chat bubble icon with dot indicator when comments exist
- Popover shows existing comments + add input
- Enter submits, Esc closes popover
- Input stopPropagation prevents keyboard shortcuts from firing
- POSTs to /api/backend/workspaces/:wid/run-items/:id/step-comments

### ExecutionHistory (`apps/web/src/components/runs/ExecutionHistory.tsx`)

Collapsible history panel showing previous run results for the current case:
- Fetches GET /api/backend/workspaces/:wid/test-cases/:caseId/history on mount
- StatusBadge + run name + date + executor name per entry
- Max 10 visible, "Show all" toggle
- Uses useCallback + void fetchHistory() pattern to satisfy react-hooks/set-state-in-effect

### ExecutionScreen (`apps/web/src/components/runs/ExecutionScreen.tsx`)

Core full-screen execution UI:
- Top bar: run name, progress label ("3 of 12"), compact SegmentedBar, Exit button
- Case header: case title, preconditions warning box
- Steps table: #, Action, Expected Result, StepCommentIcon columns
- DefectPrompt rendered inline between steps and comment when showDefectPrompt=true
- Case comment textarea with onBlur PATCH to /run-items/:id/comment
- ExecutionHistory collapsible panel
- Keyboard hints footer: P Pass | F Fail | B Blocked | S Skip
- Completion screen: SegmentedBar + verdict counts + "Back to Run" link
- Case detail fetched per case with cache; step comments fetched per run_item_id

### execute.tsx page route

Full-screen page at `/app/[slug]/[projectKey]/runs/[runId]/execute`:
- getServerSideProps: auth guard, resolves projectId from projectKey, fetches run detail
- No AppLayout wrapper — full-screen execution fills the viewport
- Passes runId, runName, workspaceId, projectId, items, slug, projectKey to ExecutionScreen

## Execution Flow

1. User lands on execute page — first untested item is focused
2. User presses P/F/B/S via useKeyboardExecution hook
3. onVerdict: PATCH /run-items/:id with { status: verdict }
4. If fail: showDefectPrompt=true, keyboard disabled
5. Defect prompt: "File Defect" POSTs to /defects then advances; "Skip" or Esc advances directly
6. Auto-advance: finds next untested item; if none remain, shows completion screen

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RunFilters.tsx exactOptionalPropertyTypes TS2379**
- **Found during:** Task 1 type-check verification
- **Issue:** `status: e.target.value || undefined` produces `string | undefined` which fails exactOptionalPropertyTypes on FilterState
- **Fix:** Explicit `delete next.status` / `next.status = value` conditional pattern
- **Files modified:** `apps/web/src/components/runs/RunFilters.tsx`
- **Commit:** c8699a6

**2. [Rule 1 - Bug] ExecutionHistory react-hooks/set-state-in-effect lint error**
- **Found during:** Task 2 lint verification
- **Issue:** `setLoading(true)` and `setEntries([])` called synchronously in useEffect body
- **Fix:** Extracted to `fetchHistory` useCallback, called via `void fetchHistory()` in useEffect
- **Files modified:** `apps/web/src/components/runs/ExecutionHistory.tsx`
- **Commit:** e8b1886

**3. [Rule 1 - Bug] sidebar.tsx tooltip property access TS2339**
- **Found during:** Task 2 type-check verification
- **Issue:** `item.tooltip` accessed in !item.available branch but no NAV_ITEM has available=false
- **Fix:** Guarded with `"tooltip" in item` runtime check with cast
- **Files modified:** `apps/web/src/components/layout/sidebar.tsx`
- **Commit:** e8b1886 (via staged change)

**4. [Rule 1 - Bug] runs/index.tsx RunCard liveStats exactOptionalPropertyTypes**
- **Found during:** Task 2 type-check verification
- **Issue:** `liveStats={liveStatsMap.get(run.id)}` passes `RunStats | undefined` to optional prop under exactOptionalPropertyTypes
- **Fix:** Conditional spread `{...(val !== undefined ? { liveStats: val! } : {})}`
- **Files modified:** `apps/web/src/pages/app/[slug]/[projectKey]/runs/index.tsx`
- **Commit:** e8b1886 (via staged change)

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (c8699a6, e8b1886) confirmed in git log. Lint and typecheck pass. 27 tests pass.
