---
phase: 04-ci-ingestion
plan: "05"
subsystem: frontend
tags: [api-keys, ingestion, ui, settings, sidebar]
dependency_graph:
  requires: [04-04]
  provides: [api-key-management-ui, ingestion-history-ui, setup-guide]
  affects: [apps/web]
tech_stack:
  added: []
  patterns:
    - Next.js getServerSideProps with server-side API key count check
    - One-time raw key display with dismiss pattern
    - Copy-to-clipboard with transient "Copied!" state
key_files:
  created:
    - apps/web/src/components/settings/ApiKeysPanel.tsx
    - apps/web/src/components/ingestion/SetupGuide.tsx
    - apps/web/src/components/ingestion/IngestionHistory.tsx
    - apps/web/src/pages/app/[slug]/[projectKey]/ingestion.tsx
  modified:
    - apps/web/src/pages/app/[slug]/settings.tsx
    - apps/web/src/components/layout/sidebar.tsx
decisions:
  - Raw key shown once in a dismissable highlighted box with copy button — no localStorage persistence
  - hasApiKeys check done server-side in getServerSideProps to avoid flicker in setup guide warning
  - IngestionHistory fetches on mount via gateway pattern — no SSR for history (avoids cookie forwarding complexity)
  - Ingestion nav item added above Reports in sidebar NAV_ITEMS array
metrics:
  duration_minutes: 20
  completed_date: "2026-03-10"
  tasks_completed: 2
  tasks_total: 3
  files_created: 4
  files_modified: 2
---

# Phase 4 Plan 05: CI Ingestion Frontend Summary

**One-liner:** API key management UI in settings, ingestion history page with setup guide, and sidebar nav — making the CI ingestion feature self-serve without CLI access.

## What Was Built

### Task 1: ApiKeysPanel in workspace settings (commit 8ff90a7)

`apps/web/src/components/settings/ApiKeysPanel.tsx` — Full lifecycle management component:
- Fetches `GET /api/backend/workspaces/{wid}/api-keys` on mount
- Inline create form with name input; POST to `/api/backend/workspaces/{wid}/api-keys`
- Raw key shown exactly once in a cobalt-accented box with amber warning and Copy button
- After dismiss, only prefix (e.g. `velo_abc123...`) is shown in the table
- Revoke button per active key — calls `DELETE /api/backend/workspaces/{wid}/api-keys/{id}`
- Row grayed out (opacity-50) when revoked

`apps/web/src/pages/app/[slug]/settings.tsx` — Extended to pass `workspaceId` from session and render `ApiKeysPanel`.

### Task 2: Ingestion page, setup guide, sidebar nav (commit 319264d)

`apps/web/src/components/ingestion/SetupGuide.tsx` — Card with CI pipeline instructions:
- Curl commands for JUnit XML (multipart) and Allure JSON (multipart + JSON body)
- Per-command Copy button with 2s "Copied!" feedback
- Amber banner with settings link when workspace has no active API keys

`apps/web/src/components/ingestion/IngestionHistory.tsx` — Ingestion run table:
- Fetches `GET /api/backend/workspaces/{wid}/projects/{pid}/ingestion-runs`
- Columns: timestamp, format badge, status badge (success=green, parse_error=red, partial=amber), total/matched/unmatched counts, "View run" link if run_id present
- Empty state: "No CI results yet. Set up your pipeline using the guide above."

`apps/web/src/pages/app/[slug]/[projectKey]/ingestion.tsx` — Page with getServerSideProps:
- Resolves projectId from projectKey via server-side API call
- Checks hasApiKeys server-side (passed as prop) to avoid flash
- Renders SetupGuide then IngestionHistory

`apps/web/src/components/layout/sidebar.tsx` — Added Ingestion nav item:
- Upload/download arrow SVG icon
- Links to `/app/{slug}/{projectKey}/ingestion`
- Positioned after Test Runs, before Reports

### Task 3: Human verification (CHECKPOINT — not yet complete)

End-to-end smoke test of the complete CI ingestion pipeline is pending user verification.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `pnpm --recursive lint` — passed (0 errors)
- `pnpm --recursive typecheck` — passed (0 errors)
- `cd apps/api && pnpm test` — 149 tests passed, 15 test files

## Self-Check: PASSED

Files confirmed present:
- apps/web/src/components/settings/ApiKeysPanel.tsx — FOUND
- apps/web/src/components/ingestion/SetupGuide.tsx — FOUND
- apps/web/src/components/ingestion/IngestionHistory.tsx — FOUND
- apps/web/src/pages/app/[slug]/[projectKey]/ingestion.tsx — FOUND

Commits confirmed:
- 8ff90a7 — feat(04-05): add API key management panel to workspace settings
- 319264d — feat(04-05): add ingestion history page, setup guide, and sidebar nav
