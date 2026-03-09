---
phase: 02-test-cases
plan: "04"
subsystem: test-cases
tags: [drag-drop, dnd-kit, position, reorder, gap-based, tc-04]
dependency_graph:
  requires: [02-02, 02-03]
  provides: [TC-04]
  affects: [apps/api/src/routes/test-cases.ts, apps/api/src/routes/suites.ts, apps/web/src/components/cases]
tech_stack:
  added: []
  patterns:
    - Gap-based midpoint position reorder (single-row UPDATE on PATCH /position)
    - Server-side renumber: position=-1 signals gap collapse, all siblings renumbered at 1000-increments
    - dnd-kit PointerSensor distance:8 prevents checkbox false drags
    - Nested DndContext per parent for within-parent-only suite reorder
    - Optimistic arrayMove + refetch for confirmed server order
key_files:
  created: []
  modified:
    - apps/api/src/routes/test-cases.ts
    - apps/api/src/routes/suites.ts
    - apps/api/src/routes/__tests__/test-cases.test.ts
    - apps/api/src/routes/__tests__/suites.test.ts
    - apps/web/src/components/cases/CaseList.tsx
    - apps/web/src/components/cases/CaseListRow.tsx
    - apps/web/src/components/cases/SuiteTree.tsx
    - apps/web/src/components/cases/SuiteTreeItem.tsx
    - apps/web/src/components/cases/CasesPage.tsx
    - apps/web/src/hooks/useTestCases.ts
decisions:
  - "position=-1 sentinel value signals gap collapse to server; avoids additional round-trip to check gaps"
  - "Nested DndContext per parent in SuiteTreeItem enforces within-parent constraint without cross-parent drag"
  - "setCases exposed from useTestCases to allow CaseList to perform optimistic arrayMove"
  - "Drag handle listeners spread on span element only (not whole row) — prevents checkbox click from triggering drag"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-03-09"
  tasks_completed: 2
  files_changed: 10
---

# Phase 2 Plan 04: Drag-and-Drop Position Reorder Summary

**One-liner:** Gap-based single-row UPDATE position reorder for test cases and suites, with gap-collapse renumber, dnd-kit drag handles in case list and suite tree.

## What Was Built

### Task 1: PATCH /position endpoints (cases + suites) with gap renumber

Completed the PATCH `/cases/:caseId/position` endpoint in `test-cases.ts`:
- `position >= 0`: single-row UPDATE on `test_cases` (O(1) — the common path for drag reorder)
- `position === -1`: gap collapsed signal — fetches all non-deleted sibling cases in the same suite, renumbers them at 1000, 2000, 3000... increments

Updated the PATCH `/suites/:suiteId/position` endpoint in `suites.ts` with identical logic:
- `position >= 0`: single-row UPDATE on `suites`
- `position === -1`: renumbers all sibling suites under the same `parent_id`

Replaced the `.todo` stubs in both test files with real integration tests:
- Position update: verifies the row gets the new position value
- Gap renumber: verifies all siblings are renumbered as strict multiples of 1000
- 403 guard: verifies workspace mismatch returns Forbidden

### Task 2: dnd-kit UI integration (case list + suite tree)

**CaseList.tsx** — wrapped table body with `DndContext` + `SortableContext`:
- `PointerSensor` with `activationConstraint: { distance: 8 }` prevents checkbox clicks triggering drag
- `handleDragEnd` computes mid-gap position via `computeNewPosition`, optimistically reorders via `arrayMove`, PATCHes the server, then refetches for confirmed order

**CaseListRow.tsx** — added `useSortable`:
- Drag handle (`≡`) rendered as first column with listeners spread on the span only
- `isDragging` class adds `opacity-50` visual feedback
- Row click guard extended to skip drag handle column

**SuiteTree.tsx** — wrapped root suite nodes in `DndContext` + `SortableContext`:
- Local `rootSuites` state maintained for optimistic reorder
- External `tree` prop changes (from refetch) sync back into local state via ref comparison

**SuiteTreeItem.tsx** — added `useSortable` and nested `DndContext`:
- Each suite item with children renders its own `DndContext` + `SortableContext` for children
- Enforces within-parent constraint — no cross-parent drag possible
- Drag handle (`≡`) with listeners, `isDragging` opacity feedback

**useTestCases.ts** — exposed `setCases` in the return value to enable CaseList optimistic reorder.

**CasesPage.tsx** — passed `workspaceId`, `projectId`, `onCasesChange={setCases}`, `refetch` to CaseList; `onSuiteReordered` to SuiteTree.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| position=-1 sentinel for gap collapse | Avoids extra round-trip; UI already knows gap collapsed (computeNewPosition returns -1); server renumbers on this signal |
| Nested DndContext per parent in SuiteTreeItem | dnd-kit within-parent constraint: each parent's children have their own context so drags cannot cross parent boundaries |
| setCases exposed from useTestCases | CaseList needs to call arrayMove for optimistic reorder; lifting state up would require larger refactor; exposing the setter is the minimal change |
| Drag handle listeners on span only | If listeners were spread on the whole row, any click (including checkbox) would register as potential drag start despite activationConstraint |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `pnpm --filter @velo/api typecheck` — exits 0
- `pnpm --filter @velo/web typecheck` — exits 0
- TC-04 integration tests written (need DB to run); test assertions cover single-row UPDATE and gap renumber
- dnd-kit DndContext wraps CaseList and SuiteTree root nodes
- useSortable wired in CaseListRow and SuiteTreeItem
- Drag handle (≡) visible in every case row and suite tree node
- PointerSensor distance:8 prevents checkbox click from triggering drag

## Self-Check: PASSED

Commits exist:
- 860f52f: feat(02-04): PATCH /position endpoints for cases and suites with gap renumber
- a5b32bc: feat(02-04): dnd-kit drag-and-drop for case list and suite tree

Key files exist:
- apps/api/src/routes/test-cases.ts — PATCH /cases/:caseId/position implemented
- apps/api/src/routes/suites.ts — PATCH /suites/:suiteId/position updated with renumber
- apps/web/src/components/cases/CaseList.tsx — DndContext + SortableContext
- apps/web/src/components/cases/CaseListRow.tsx — useSortable + drag handle
- apps/web/src/components/cases/SuiteTree.tsx — DndContext + SortableContext for root suites
- apps/web/src/components/cases/SuiteTreeItem.tsx — useSortable + nested DndContext per parent
