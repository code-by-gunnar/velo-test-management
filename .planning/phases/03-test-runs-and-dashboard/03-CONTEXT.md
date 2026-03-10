# Phase 3: Test Runs and Dashboard - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

A QA engineer can create a named test run, execute it case-by-case using keyboard shortcuts (P/F/B/S), file defects inline from failures, add comments at case and step level, and watch results update in real time on a live dashboard — without ever refreshing the page.

New capabilities NOT in this phase: Linear API integration (stubbed only — wired in Phase 5), milestones/test plans, coverage reports, trend analytics, team invitations.

</domain>

<decisions>
## Implementation Decisions

### Execution Screen Layout
- **Full-screen focus mode** — dedicated page that fills the viewport when executing a run. No case list or suite tree visible. Case title, steps, and keyboard hints front-and-center.
- **All steps visible** as a vertical list with Action | Expected columns. Current step highlighted but user can see all steps at once (not wizard/one-at-a-time).
- **Case-level verdict only** — P/F/B/S marks the whole case. Steps are read-only reference during execution. No step-level pass/fail tracking.
- **Auto-advance immediately** — pressing P/F/B/S records the result and instantly shows the next case. No confirmation delay, no manual advance needed.
- **Comments: both case-level and step annotations** — a case-level comment textarea always visible below steps. Plus a small comment icon per step for step-specific notes. Covers broad and detailed feedback (TR-04).

### Run Creation Flow
- **Modal dialog** from the runs page. "New Run" button opens modal with: name, suite picker (scope), assignee dropdown.
- **Suite picker for scoping** — user selects one or more suites from the tree. All cases in those suites are included. "All Cases" option includes everything in the project.
- **Immediately active on creation** — no draft state. Run is active from the moment it's created. User can start executing right away. Reduces friction for solo QA workflow.
- **Separate sidebar nav item** — "Test Runs" as its own top-level sidebar entry below "Test Cases". Dedicated page at `/app/[slug]/[key]/runs`.

### Live Dashboard Design
- **Card grid layout** — each run is a card showing: name, segmented progress bar, pass rate %, assignee, time estimate. Cards in a responsive grid. Active runs at top, completed below.
- **Segmented color bar** — horizontal bar divided into colored segments: green (pass), red (fail), amber (blocked), gray (skipped), light gray (untested). Width proportional to count. Shows distribution at a glance.
- **Run detail page with item list** — clicking a run card navigates to a dedicated page showing run metadata (name, assignee, progress) at top, and a list of all run items with their status below. "Resume Execution" button to re-enter full-screen mode.
- **Filter bar above cards** — horizontal row of filter dropdowns: Assignee | Status | Milestone. Active filters shown as removable chips. One-click clear (DA-03).
- **Real-time updates via SSE** — dashboard and run detail page subscribe to SSE per run_id. Progress bar, pass rate, and time estimate update live without page refresh (DA-01, DA-02).

### Defect Filing UX
- **Inline prompt after fail verdict** — after pressing F, a brief inline form appears before auto-advancing: title pre-filled from case name, optional description field, "File Defect" button, "Skip" link. Quick but doesn't break flow.
- **Linear integration stubbed** — Phase 3 creates a local defect record with title/description. The "File to Linear" button is visible but disabled (or creates local-only). Phase 5 (INT-01/INT-02) wires the actual Linear API.
- **Inline badge on failed items** — failed run items in the detail view show a small "Defect filed" badge/chip with the defect title. Clicking opens a popover with defect details.

### Rerun Failures Flow
- TR-07: User can create a new run containing only the failures from a previous run. Available as a "Rerun Failures" action on completed runs in the run detail page.

### Claude's Discretion
- Exact animation/transition for execution screen entry
- Keyboard hints display style (subtle footer bar vs overlay)
- Time-to-complete estimate algorithm (average per-case execution time)
- Empty state design for runs page (no runs yet)
- Run card hover/active states
- Progress bar segment minimum width (prevent tiny slivers)
- SSE reconnection strategy and heartbeat interval (20s heartbeat per architecture decision)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Button** (`apps/web/src/components/ui/button.tsx`): CVA variants — use for "New Run", "Resume Execution", "File Defect" buttons
- **Card** (`apps/web/src/components/ui/card.tsx`): Rounded border with shadow-sm — base for run cards on dashboard
- **StatusBadge** (`apps/web/src/components/ui/status-badge.tsx`): Existing badge component — repurpose for run status (active/completed/aborted) and item status (pass/fail/blocked/skipped)
- **AppLayout + Sidebar** (`apps/web/src/components/layout/`): Add "Test Runs" nav item. AppLayout accepts slug + projectKey props.
- **useSuiteTree hook** (`apps/web/src/hooks/useSuiteTree.ts`): Reuse for suite picker in run creation modal
- **Valkey client** (`apps/api/src/lib/valkey.ts`): Already configured — use for SSE pub/sub per run_id

### Established Patterns
- **CVA for variants**: All new components with visual variants should use class-variance-authority
- **clsx for className**: Conditional classNames
- **getServerSideProps + requireAuth**: Every page uses this guard pattern — new runs page must follow
- **Tailwind design tokens**: cobalt, fail, fail-bg, fail-text, pass tokens for themed elements
- **withWorkspace(id, fn)**: All tenant-scoped DB operations go through this wrapper
- **postgres.js raw SQL**: No Drizzle ORM at runtime — raw SQL with parameterized queries

### Integration Points
- **New pages**: `/app/[slug]/[key]/runs` (dashboard/list), `/app/[slug]/[key]/runs/[runId]` (detail), `/app/[slug]/[key]/runs/[runId]/execute` (full-screen execution)
- **New API routes**: `apps/api/src/routes/runs.ts` (CRUD + status), `apps/api/src/routes/run-items.ts` (execute, comment), `apps/api/src/routes/defects.ts` (file defect)
- **SSE endpoint**: `apps/api/src/routes/runs.ts` — GET /runs/:id/stream (SSE per run_id, Valkey pub/sub)
- **DB schema**: test_runs, run_items, defects tables already defined in schema.ts with enums (run_status: draft/active/completed/aborted, test_status: pass/fail/blocked/skipped/untested)
- **Sidebar nav**: Add "Test Runs" entry to NAV_ITEMS in sidebar component

</code_context>

<specifics>
## Specific Ideas

- The execution screen should feel like a focused test session — minimal chrome, maximum focus on the case being tested. Similar to how quiz apps present one question at a time but with all steps visible.
- The segmented progress bar is the hero visual element on each run card — it should communicate test health at a glance without needing to read numbers.
- Auto-advance after P/F/B/S is critical for the keyboard-first flow — the 30-second philosophy from Phase 2 carries forward into execution speed.
- The defect prompt after fail should be dismissible with Esc (skip) or Enter (file) — no mouse required.
- Run status is computed from run_items aggregate (Pitfall M5) — never a directly writable column. active = has untested items, completed = all items tested, aborted = manually aborted.

</specifics>

<deferred>
## Deferred Ideas

- Linear API integration for defect filing — Phase 5 (INT-01, INT-02)
- Milestones / test plans grouping multiple runs — v2 (TR-V2-01)
- Coverage and trend reports — v2 (DA-V2-01)
- Custom dashboard builder — v2 (DA-V2-02)
- Run scheduling — out of scope (CI/CD tools own this)

</deferred>

---

*Phase: 03-test-runs-and-dashboard*
*Context gathered: 2026-03-10*
