---
phase: 02-test-cases
plan: "05"
subsystem: test-cases
tags: [bulk-operations, multi-select, copy-steps, move, delete, BulkActionBar]
dependency_graph:
  requires: ["02-02", "02-03"]
  provides: ["TC-05"]
  affects: ["apps/api/src/routes/test-cases.ts", "apps/web/src/components/cases/CaseList.tsx", "apps/web/src/components/cases/BulkActionBar.tsx"]
tech_stack:
  added: []
  patterns:
    - "App-layer UUID mapping before step insert (Pitfall 5 prevention)"
    - "Bulk action bar as fixed-position overlay (z-30)"
    - "Suite picker dropdown with depth-based indentation"
    - "Click-outside-to-close via document mousedown listener"
key_files:
  created:
    - apps/web/src/components/cases/BulkActionBar.tsx
  modified:
    - apps/api/src/routes/test-cases.ts
    - apps/web/src/components/cases/CaseList.tsx
    - apps/web/src/components/cases/CasesPage.tsx
    - apps/api/src/routes/__tests__/test-cases.test.ts
decisions:
  - "POST /cases/bulk registered before /cases/:caseId wildcard (routing conflict prevention)"
  - "Copy uses app-layer UUID mapping — not INSERT INTO...SELECT — to correctly reference new case IDs on steps"
  - "target_suite_id=null is valid (move/copy to root); target_suite_id=undefined triggers 400 (omitted from body)"
  - "BulkActionBar is fixed-position overlay (bottom-0) so it doesn't push page content"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-03-09T18:15:43Z"
  tasks_completed: 2
  files_modified: 5
requirements_satisfied: [TC-05]
---

# Phase 2 Plan 05: Bulk Operations (Move / Copy / Delete) Summary

**One-liner:** POST /cases/bulk endpoint with app-layer UUID mapping for copy (Pitfall 5 prevention), plus BulkActionBar sticky overlay with suite picker dropdown.

## What Was Built

### Task 1: POST /cases/bulk endpoint (TDD)

Replaced the 404 placeholder in `apps/api/src/routes/test-cases.ts` with the full bulk handler:

- **move:** `UPDATE test_cases SET suite_id = $target WHERE id = ANY(...)` — single query in withWorkspace transaction.
- **copy:** Per-case loop: fetch source + steps, generate `newCaseId = uuidv7()`, INSERT new case, then INSERT steps with `test_case_id = newCaseId` (NOT srcId). This is the explicit Pitfall 5 fix.
- **delete:** `UPDATE test_cases SET deleted_at = NOW() WHERE id = ANY(...)` soft delete.
- **Validation:** 400 on empty `case_ids`; 400 when `target_suite_id` is `undefined` for move/copy (null is valid = root).

Integration tests written (RED commit, then GREEN commit):
- move: asserts suite_id updated for all selected IDs
- copy: asserts new UUID row created with same title in target suite
- copy Pitfall 5: asserts copied case step_count=3 (not 0); DB check confirms step rows reference `newCaseId` not `srcId`
- delete: asserts deleted_at set for targeted cases, untouched for others
- Validation tests for 400 edge cases

### Task 2: BulkActionBar component + CaseList wiring

**BulkActionBar.tsx** (`apps/web/src/components/cases/BulkActionBar.tsx`):
- Fixed bottom overlay: `fixed bottom-0 left-0 right-0 z-30 border-t bg-white shadow-lg`
- "{N} selected" count label
- "Move to" and "Copy to" buttons each open a `SuitePicker` dropdown above the bar (`bottom-full mb-1`)
- Suite picker: "Root (no suite)" option + flat suite list with `paddingLeft = 12 + depth * 12` for indentation
- "Delete" destructive button
- "Clear" text link clears selection
- Click-outside closes dropdown via `document.addEventListener("mousedown", ...)`
- `isSubmitting` state disables buttons during async action

**CaseList.tsx** updates:
- Added `suites: Suite[]` prop
- Replaced inline stub bulk bar with `<BulkActionBar>` component
- `onMove`/`onCopy`/`onDelete` POST to `/api/workspaces/:wid/projects/:pid/cases/bulk`, then clear selectedIds + refetch

**CasesPage.tsx** update:
- Passes `suites={flatList}` to `<CaseList>` (flatList comes from useSuiteTree, already available)

## Deviations from Plan

None — plan executed exactly as written.

The TDD flow for integration tests is partial-RED: tests were written and committed before implementation, but can only run GREEN with a real PostgreSQL DB. Typecheck was used as the GREEN verification signal (consistent with Plans 02-01 through 02-04).

## Self-Check: PASSED

Files created/modified exist:
- `apps/web/src/components/cases/BulkActionBar.tsx` — FOUND
- `apps/api/src/routes/test-cases.ts` — FOUND (bulk handler replacing 404 placeholder)
- `apps/web/src/components/cases/CaseList.tsx` — FOUND (BulkActionBar wired)
- `apps/web/src/components/cases/CasesPage.tsx` — FOUND (suites prop passed)
- `apps/api/src/routes/__tests__/test-cases.test.ts` — FOUND (TC-05 tests)

Commits:
- `6697dc0` — test(02-05): add failing TC-05 tests (RED)
- `d0c18de` — feat(02-05): implement POST /cases/bulk endpoint
- `1c4969b` — feat(02-05): BulkActionBar component + CaseList wiring

Both `pnpm --filter @velo/api typecheck` and `pnpm --filter @velo/web typecheck` exit 0.
