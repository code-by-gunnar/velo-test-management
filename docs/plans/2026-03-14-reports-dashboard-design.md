# Reports Dashboard — Lean QA Metrics

## Problem

Before every release, POs and engineering leads ask the same three questions:
1. "Are we getting better or worse?" (pass rate trend)
2. "Which areas keep breaking?" (fragile tests)
3. "Where do we stand on this run?" (recent run summary)

Today, answering these requires manually reviewing past runs, cross-referencing execution history, and building spreadsheets. Most QA tools solve this with 50 configuration options nobody uses. We solve it with three sections and zero config.

## Solution

A single reports page with three sections. No filters, no date pickers, no export buttons (yet). Just the data that matters, computed from what's already in the database.

## Page Layout

### Section 1: Pass Rate Trend (hero chart)

A combined chart showing the last 20 completed runs:

**Stacked bars** — each bar is one run, segments colored by status:
- Pass (green), Fail (red), Blocked (amber), Skipped (gray)
- Bar height = total items in the run
- X-axis = run name (truncated) + date
- Y-axis = count (left side)

**Overlaid trend line** — pass rate percentage per run:
- Thin line with dots at each run
- Primary blue color
- Y-axis = percentage (right side, 0-100%)
- Shows the trajectory at a glance

Bars answer "what happened in each run." Line answers "are we trending up or down."

No toggle needed — both render together. The line overlays the bars naturally.

### Section 2: Most Failing Test Cases (fragile areas)

A table showing the top 10 test cases with the highest fail count across recent runs (last 30 days or last 20 runs, whichever is larger).

| Column | Description |
|--------|-------------|
| Test Case | Case title (linked to case editor) |
| Suite | Suite name |
| Failures | Count of times this case was marked "fail" |
| Last Failed | Date of most recent failure |
| Fail Rate | Failures / total executions as percentage |

Sorted by failure count descending. Only cases with at least 1 failure appear.

This is the "fragile areas" report — the cases that break most during regression. POs and engineering leads use this to prioritize fixes.

### Section 3: Recent Runs (quick reference)

A compact table of the 10 most recent runs with inline stats.

| Column | Description |
|--------|-------------|
| Run | Name (linked to run detail) |
| Status | Active / Completed / Aborted badge |
| Pass Rate | Percentage with small bar |
| Results | Compact pass/fail/blocked/skipped counts |
| Date | Created date |

No pagination — just the 10 most recent. Users can go to the Test Runs page for the full list.

## Architecture

### New API Endpoint

`GET /api/workspaces/:workspaceId/projects/:projectId/reports`

Returns all three datasets in one call (avoids waterfall):

```typescript
{
  // Section 1: pass rate trend (last 20 completed runs)
  run_trend: Array<{
    run_id: string
    run_name: string
    completed_at: string
    total: number
    pass: number
    fail: number
    blocked: number
    skipped: number
    pass_rate: number  // 0-100
  }>,

  // Section 2: most failing cases (last 30 days)
  fragile_cases: Array<{
    case_id: string
    case_title: string
    suite_name: string | null
    fail_count: number
    total_executions: number
    fail_rate: number  // 0-100
    last_failed_at: string
  }>,

  // Section 3: recent runs (last 10)
  recent_runs: Array<{
    id: string
    name: string
    status: string
    created_at: string
    total: number
    pass: number
    fail: number
    blocked: number
    skipped: number
  }>
}
```

### SQL Queries

**Run Trend** (completed runs, ordered by completion date):
```sql
SELECT
  tr.id AS run_id, tr.name AS run_name, tr.completed_at,
  COUNT(ri.id)::int AS total,
  COUNT(ri.id) FILTER (WHERE ri.status = 'pass')::int AS pass,
  COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail,
  COUNT(ri.id) FILTER (WHERE ri.status = 'blocked')::int AS blocked,
  COUNT(ri.id) FILTER (WHERE ri.status = 'skipped')::int AS skipped
FROM test_runs tr
JOIN run_items ri ON ri.run_id = tr.id
WHERE tr.project_id = $projectId
  AND tr.status IN ('completed', 'aborted')
GROUP BY tr.id
ORDER BY tr.completed_at DESC
LIMIT 20
```

**Fragile Cases** (cases that fail most in recent runs):
```sql
SELECT
  tc.id AS case_id, tc.title AS case_title,
  s.name AS suite_name,
  COUNT(ri.id) FILTER (WHERE ri.status = 'fail')::int AS fail_count,
  COUNT(ri.id)::int AS total_executions,
  MAX(ri.executed_at) FILTER (WHERE ri.status = 'fail') AS last_failed_at
FROM run_items ri
JOIN test_cases tc ON tc.id = ri.test_case_id
LEFT JOIN suites s ON s.id = tc.suite_id
JOIN test_runs tr ON tr.id = ri.run_id
WHERE tr.project_id = $projectId
  AND ri.executed_at > NOW() - INTERVAL '30 days'
GROUP BY tc.id, tc.title, s.name
HAVING COUNT(ri.id) FILTER (WHERE ri.status = 'fail') > 0
ORDER BY fail_count DESC
LIMIT 10
```

**Recent Runs** — reuse existing runs list query with LIMIT 10.

### Charting Library

Use **lightweight inline SVG** — no charting library. The stacked bar chart is simple enough to render with `<rect>` elements in an `<svg>`. The trend line is a `<polyline>`. Total SVG is ~50 lines of code.

Why not Chart.js/Recharts: they add 50-200KB to the bundle for one chart. SVG is zero-dependency, matches the design system exactly, and renders instantly.

### Frontend Components

**New files:**
- `apps/web/src/pages/app/[slug]/[projectKey]/reports.tsx` — page route (getServerSideProps + component)
- `apps/web/src/components/reports/RunTrendChart.tsx` — stacked bar + line SVG chart
- `apps/web/src/components/reports/FragileCasesTable.tsx` — top failing cases table
- `apps/web/src/components/reports/RecentRunsTable.tsx` — compact recent runs

**Modified files:**
- `apps/web/src/components/layout/sidebar.tsx` — enable Reports link (`available: true`)
- `apps/api/src/routes/runs.ts` — add reports endpoint (or new `reports.ts` route file)

### Design

- Page background: `bg-mist` (consistent with rest of app)
- Each section in a white card with `border-gray-200 rounded-lg shadow-card`
- Chart bars use status color tokens: `pass`, `fail`, `blocked`, `skipped`
- Trend line uses `primary` blue
- Tables use the same compact style as the run detail page
- Section headers: `text-sm font-semibold text-gray-900` with subtle descriptions

## What This Is NOT

- **Not configurable.** No date pickers, no custom filters, no chart type toggles. The defaults are the right defaults.
- **Not exportable.** No CSV download, no PDF generation. That's a future feature.
- **Not real-time.** Data is fetched on page load. No SSE for reports (unlike execution).
- **Not a BI tool.** Three sections, not thirty. If someone needs custom analytics, they use the REST API.

## Implementation Estimate

- 1 new API endpoint (~80 lines — 3 queries in one handler)
- 1 page route (~40 lines)
- 3 frontend components (~350 lines total — chart is the biggest)
- 1 sidebar modification (1 line — `available: true`)
- Total: ~470 lines
