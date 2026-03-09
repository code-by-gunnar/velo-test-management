---
phase: 02-test-cases
plan: "03"
subsystem: ui
tags: [react, next.js, tailwind, react-hook-form, testing-library, vitest, keyboard-navigation]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: AppLayout, Sidebar, Button/Card/Input/StatusBadge UI components, Auth.js session, design tokens
  - phase: 02-01
    provides: API routes for suites and test cases (GET/POST/PUT/DELETE)

provides:
  - Three-panel cases page at /app/[slug]/[projectKey]/cases
  - Suite tree panel with inline create, expand/collapse, All Cases root
  - Case list table with empty state, checkbox select, shift-click range, bulk action bar
  - Slide-in right CasePanel with view and edit modes
  - Keyboard-first StepEditor (Tab/Enter/Backspace/Shift+Tab navigation)
  - useSuiteTree hook with O(n) tree builder
  - useTestCases hook with optimistic create/update/delete
  - Sidebar Test Cases nav item enabled

affects:
  - 02-04 (drag-drop reorder will add dnd-kit to cases components)
  - 02-05 (CSV import will add import flow to CaseList)
  - 03-runs (run execution view may link back to case panel)

# Tech tracking
tech-stack:
  added:
    - "@testing-library/react ^14"
    - "@testing-library/user-event ^14"
  patterns:
    - Controlled step refs via useRef array + createRef() (React 19 RefObject<T|null>)
    - Optimistic mutations: update local state immediately, rollback on API error
    - focus trap pattern: save triggerRef on open, restore on close
    - Three-panel layout: fixed-width left (220px), flex-1 center, fixed-width slide-in right
    - TDD RED→GREEN: test file with .todo stubs replaced with real jsdom assertions

key-files:
  created:
    - apps/web/src/pages/app/[slug]/[projectKey]/cases.tsx
    - apps/web/src/components/cases/CasesPage.tsx
    - apps/web/src/components/cases/SuiteTree.tsx
    - apps/web/src/components/cases/SuiteTreeItem.tsx
    - apps/web/src/components/cases/CaseList.tsx
    - apps/web/src/components/cases/CaseListRow.tsx
    - apps/web/src/components/cases/CasePanel.tsx
    - apps/web/src/components/cases/StepEditor.tsx
    - apps/web/src/components/cases/StepRow.tsx
    - apps/web/src/hooks/useSuiteTree.ts
    - apps/web/src/hooks/useTestCases.ts
  modified:
    - apps/web/src/components/layout/sidebar.tsx (Test Cases available: true)
    - apps/web/src/__tests__/StepEditor.test.tsx (replaced .todo stubs with real tests)
    - apps/web/package.json (added @testing-library/react + user-event)

key-decisions:
  - "React 19 createRef<T>() returns RefObject<T|null> — StepRow props typed as RefObject<HTMLTextAreaElement|null>"
  - "Tab on Expected always calls onAddAfter (not just on last row) — consistent flow matches plan spec"
  - "CasePanel fetches case detail at /api/workspaces/:wid/projects/:pid/cases/:id — plan spec implies detail endpoint exists"
  - "N key shortcut for new case handled at CasesPage level (not in CaseList) to avoid conflicts with SuiteTree N key"

patterns-established:
  - "Step refs array: useRef<Array<{action, expected}>> synced to steps.length; createRef() per slot"
  - "Keyboard panel close: document.addEventListener in useEffect, cleanup on unmount"
  - "Optimistic UI: setCases before await, rollback (refetch or restore prev) on catch"

requirements-completed: [TC-01, TC-02, TC-03]

# Metrics
duration: 30min
completed: 2026-03-09
---

# Phase 2 Plan 03: Cases UI — Three-Panel Layout + Keyboard Step Editor Summary

**Three-panel cases page with keyboard-first step editor: Tab/Enter create steps, Cmd+S saves, N key opens panel — the 30-second case creation flow**

## Performance

- **Duration:** 30 min
- **Started:** 2026-03-09T10:34:57Z
- **Completed:** 2026-03-09T11:05:00Z
- **Tasks:** 2 (+ checkpoint)
- **Files modified:** 12

## Accomplishments

- Full three-panel layout at `/cases`: suite tree (220px left), case list (flex center), slide-in editor panel (50% right)
- Keyboard-first StepEditor: Tab Action→Expected, Tab Expected→new row, Enter Expected→new row, Backspace empty Action→delete row, Shift+Tab→back to Action
- CasePanel with focus management (opener saved, title auto-focused on open), Cmd+S save, Esc close, E key edit mode
- 10 StepEditor tests passing in jsdom via @testing-library/react + user-event
- useSuiteTree (O(n) Map tree builder, selected state) and useTestCases (optimistic mutations) hooks

## Task Commits

1. **Task 1: Cases page layout + suite tree + hooks** - `3db03d3` (feat)
2. **Task 2: Slide-in panel + keyboard step editor** - `9622ab9` (feat)

**Plan metadata:** (pending final docs commit)

_Note: Task 2 used TDD — existing .todo stub file replaced with real jsdom tests; all 10 tests passed on first run._

## Files Created/Modified

- `apps/web/src/pages/app/[slug]/[projectKey]/cases.tsx` — Next.js page, getServerSideProps auth guard + projectId lookup
- `apps/web/src/components/cases/CasesPage.tsx` — Three-panel layout orchestrator, N key handler
- `apps/web/src/components/cases/SuiteTree.tsx` — Left panel with inline create (N key), All Cases root
- `apps/web/src/components/cases/SuiteTreeItem.tsx` — Tree node with depth indent, expand/collapse
- `apps/web/src/components/cases/CaseList.tsx` — Table with empty state, select-all, shift-click, bulk bar
- `apps/web/src/components/cases/CaseListRow.tsx` — Row with priority badge using fail/amber/cobalt/gray tokens
- `apps/web/src/components/cases/CasePanel.tsx` — Slide-in right panel, view/edit modes, focus trap, keyboard shortcuts
- `apps/web/src/components/cases/StepEditor.tsx` — Step rows orchestrator with refs array
- `apps/web/src/components/cases/StepRow.tsx` — Textarea pair with all keyboard handlers
- `apps/web/src/hooks/useSuiteTree.ts` — Fetch + O(n) tree builder + selected state
- `apps/web/src/hooks/useTestCases.ts` — Fetch + optimistic create/update/delete
- `apps/web/src/components/layout/sidebar.tsx` — Test Cases nav item set available: true

## Decisions Made

- React 19 `createRef<T>()` returns `RefObject<T | null>` — updated `StepRowProps` to accept `RefObject<HTMLTextAreaElement | null>` to satisfy strict TS
- Tab on Expected always calls `onAddAfter` regardless of whether it's the last row — this matches the plan spec ("Tab on Expected textarea creates a new step row") consistently
- Input component in `apps/web` does not forward refs — used a raw `<input>` element in CasePanel for the title field to merge react-hook-form ref with `titleRef` for focus management
- `N` key shortcut for new case is handled at CasesPage level with focus checks to avoid conflict with SuiteTree's own `N` key handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React 19 RefObject type mismatch in StepEditor**
- **Found during:** Task 1 typecheck
- **Issue:** `createRef<HTMLTextAreaElement>()` returns `RefObject<HTMLTextAreaElement | null>` in React 19; StepRowProps typed as `RefObject<HTMLTextAreaElement>` caused TS2345
- **Fix:** Updated StepRowProps and StepEditor refs array to use `RefObject<HTMLTextAreaElement | null>`
- **Files modified:** `StepRow.tsx`, `StepEditor.tsx`
- **Verification:** `pnpm typecheck` exits 0
- **Committed in:** `9622ab9` (Task 2 commit)

**2. [Rule 1 - Bug] FormField component API mismatch in CasePanel**
- **Found during:** Task 2 implementation
- **Issue:** `FormField` component requires `label`, `htmlFor`, `error` props — used as wrapper without them in initial draft
- **Fix:** Replaced `FormField` import with inline `<div class="flex flex-col gap-1.5">` wrapper; used raw `<input>` to support dual ref merging
- **Files modified:** `CasePanel.tsx`
- **Verification:** `pnpm typecheck` exits 0
- **Committed in:** `9622ab9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (Rule 1 — TypeScript bugs)
**Impact on plan:** Both fixes required for TypeScript correctness. No scope creep.

## Issues Encountered

- `pnpm` not in shell PATH — used `corepack pnpm` throughout execution. All commands work equivalently.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Cases page fully navigable; human checkpoint (Task 3) verifies keyboard flow end-to-end
- API routes for suites/cases (Plan 02-02) must be deployed before UI makes real network calls
- Plan 02-04 adds dnd-kit drag-drop reorder to suite tree and case list
- Plan 02-05 adds CSV import flow to CaseList

---
*Phase: 02-test-cases*
*Completed: 2026-03-09*
