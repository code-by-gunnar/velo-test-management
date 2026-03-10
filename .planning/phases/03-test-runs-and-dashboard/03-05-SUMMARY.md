---
phase: 03-test-runs-and-dashboard
plan: "05"
subsystem: ui
tags: [react, next.js, sse, tailwind, cva, eventsource]

requires:
  - phase: 03-02
    provides: Runs CRUD backend (POST/GET/PATCH runs, run items, rerun-failures)
  - phase: 03-04
    provides: SSE stream endpoint at /runs/:runId/stream with ?token= auth

provides:
  - Runs dashboard page with card grid, filters, SSE live updates
  - Run detail page with item list, progress stats, abort/rerun actions
  - SegmentedBar component (pass/fail/blocked/skipped/untested proportional segments)
  - RunCard component with live stats override and active run pulse border
  - RunFilters component with status/assignee dropdowns and removable chips
  - RunCreateModal with name input, suite scope picker, assignee dropdown
  - useRunSSE hook for direct EventSource connections to Railway API
  - Sidebar Test Runs and Reports nav items activated

affects: [03-06, execute-page]

tech-stack:
  added: []
  patterns:
    - Direct EventSource to Railway API URL with ?token= query param (not through /api/backend/ gateway)
    - SSE hook returns Map<runId, RunStats> for multi-run dashboard subscription
    - exactOptionalPropertyTypes: spread pattern for optional props (liveStats passed via {...(val !== undefined ? { liveStats: val } : {})} )
    - Server-side initial data fetch + client-side filter refetch pattern
    - Group active runs at top, inactive below in card grid

key-files:
  created:
    - apps/web/src/hooks/useRunSSE.ts
    - apps/web/src/components/runs/SegmentedBar.tsx
    - apps/web/src/components/runs/RunCard.tsx
    - apps/web/src/components/runs/RunFilters.tsx
    - apps/web/src/components/runs/RunCreateModal.tsx
    - apps/web/src/pages/app/[slug]/[projectKey]/runs/index.tsx
    - apps/web/src/pages/app/[slug]/[projectKey]/runs/[runId]/index.tsx
  modified:
    - apps/web/src/components/layout/sidebar.tsx
    - apps/web/src/components/runs/ExecutionHistory.tsx

key-decisions:
  - "useRunSSE subscribes one EventSource per runId; dependency key is runIds.join(',') to avoid per-render reconnects"
  - "SegmentedBar uses max(pct%, 2px) minimum width to prevent invisible slivers"
  - "Assignees list passed as empty array [] since no /members endpoint exists in API yet (Phase 6 RBAC)"
  - "exactOptionalPropertyTypes requires spread pattern for liveStats prop on RunCard"
  - "Dashboard = runs page (no separate dashboard route); Reports nav also points to /runs"

requirements-completed: [TR-01, DA-01, DA-02, DA-03]

duration: 45min
completed: 2026-03-10
---

# Phase 03 Plan 05: Runs Dashboard and Detail Pages Summary

**Runs dashboard with SSE live card grid (useRunSSE direct to Railway), run detail page with item list and abort/rerun actions, sidebar nav activation — five new components and one hook.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-03-10
- **Tasks:** 2/2 (checkpoint pending human verify)
- **Files modified:** 9

## Accomplishments

### Task 1: SSE Hook and Run Components

Created five new frontend files:

- **useRunSSE** — opens one EventSource per runId directly to Railway API. Auth via `?token=` query param. Returns `Map<string, RunStats>`. Cleans up on unmount or runIds change using `runIds.join(',')` as the dependency key.

- **SegmentedBar** — horizontal proportional bar with CVA height variants (`default` / `compact`). Colors: `bg-pass` (green), `bg-fail` (red), `bg-blocked` (amber), `bg-gray-400` (skipped), `bg-gray-200` (untested). Minimum segment width `max(pct%, 2px)` prevents invisible slivers.

- **RunCard** — card showing run name, status badge, segmented bar, pass rate %, assignee, relative timestamp. Accepts optional `liveStats` to override static counts. Active runs get a `border-cobalt/30 ring-1 ring-cobalt/20` border.

- **RunFilters** — status dropdown (all/active/completed/aborted) + optional assignee dropdown (hidden when empty). Milestone is a disabled placeholder (v2). Active filters shown as removable chips.

- **RunCreateModal** — name input + suite scope picker (All Cases or specific suites via useSuiteTree) + optional assignee. Submits to `/api/backend/workspaces/:wid/runs`. Esc closes, Enter submits.

### Task 2: Dashboard Page, Detail Page, Sidebar

- **Runs Dashboard** (`/app/[slug]/[key]/runs`) — getServerSideProps fetches projects + initial runs server-side. Client side re-fetches on filter change. Active runs grouped at top, inactive below. Empty state with CTA.

- **Run Detail** (`/app/[slug]/[key]/runs/[runId]`) — getServerSideProps fetches full run + items. SSE subscribes to `[runId]` for live stat updates. Abort button (PATCH /abort with confirm), Rerun Failures button (POST /rerun-failures → navigate to new run). Items table with StatusBadge, defect popover.

- **Sidebar** — `Test Runs` and `Reports` entries changed to `available: true` with `href: (slug, key) => key ? /app/${slug}/${key}/runs : "#"`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ExecutionHistory.tsx pre-existing lint error**
- **Found during:** Task 2 lint run
- **Issue:** `setLoading(true)` called synchronously inside `useEffect` body — flagged by `react-hooks/set-state-in-effect`
- **Fix:** Extracted fetch logic into `useCallback` `fetchHistory()` function; effect calls `void fetchHistory()`. This file was created by plan 03-06 before this plan ran.
- **Files modified:** `apps/web/src/components/runs/ExecutionHistory.tsx`
- **Commit:** 32026d0

**2. [Rule 2 - Missing] No /members endpoint in API**
- **Found during:** Task 2 implementation
- **Issue:** Plan specifies assignee dropdown populated from workspace members API. No such endpoint exists.
- **Fix:** `assignees` prop defaults to `[]` in both RunFilters and RunCreateModal; assignee controls hidden when list is empty. Graceful degradation — works without assignees, fully functional when Phase 6 RBAC adds the endpoint.

**3. [Rule 1 - Bug] exactOptionalPropertyTypes incompatibility**
- **Found during:** Task 2 typecheck
- **Issue:** Passing `liveStats={liveStatsMap.get(run.id)}` fails because `undefined` is not assignable to `RunStats` with strict optional types.
- **Fix:** Auto-fixed by linter via spread pattern: `{...(val !== undefined ? { liveStats: val } : {})}`

## Self-Check: PASSED

All 7 files created and verified on disk. Both task commits exist:
- `e2f1f90` — Task 1: SSE hook + 4 components
- `32026d0` — Task 2: pages + sidebar nav
