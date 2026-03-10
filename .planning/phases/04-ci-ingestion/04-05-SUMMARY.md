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
  - Ingestion nav item moved to standalone link above Settings (not in NAV_ITEMS) — shows only when project is selected
  - ingestion.test.ts registers @fastify/multipart in buildApp() to match server.ts registration
metrics:
  duration_minutes: 35
  completed_date: "2026-03-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 3
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

### Task 3: Human verification (CHECKPOINT — approved)

User verified end-to-end CI ingestion pipeline. The following post-checkpoint fixes were applied (commit ed5e4f4):

1. **Sidebar** — Ingestion removed from `NAV_ITEMS` const and made a standalone conditional link above Settings. This ensures it only renders when a `projectKey` is available (correct project-scoped behavior), and avoids the "# (unavailable)" fallback state.

2. **ingestion.ts** — Removed duplicate `@fastify/multipart` registration that caused `FST_ERR_CTP_ALREADY_PRESENT` server crash. Plugin is registered once in `server.ts`; route files should not re-register it.

3. **ApiKeysPanel.tsx** — Fixed create response parsing. API returns flat `{ id, name, key, prefix }`, not the nested `{ key, api_key }` shape assumed in original code. Frontend now constructs the `ApiKey` object correctly from the flat response.

4. **ingestion.test.ts** — Added `@fastify/multipart` registration in `buildApp()` to mirror `server.ts`. The bare `Fastify()` app in tests had no multipart support, causing all 7 JUnit/Allure POST tests to return 415 instead of their expected status codes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing @fastify/multipart in test buildApp**
- **Found during:** Task 3 (post-checkpoint fix)
- **Issue:** `ingestion.test.ts` builds a bare `Fastify()` instance without registering the multipart plugin. All 7 POST /ingest/junit tests returned 415 Unsupported Media Type instead of 201/401/403/422.
- **Fix:** Added `app.register(multipart, ...)` call inside `buildApp()` and imported `@fastify/multipart` in the test file.
- **Files modified:** `apps/api/src/routes/__tests__/ingestion.test.ts`
- **Commit:** ed5e4f4

**2. [Rule 1 - Bug] Sidebar Ingestion link shown when no project selected**
- **Found during:** Task 3 UAT (user-reported)
- **Fix:** Moved Ingestion from `NAV_ITEMS` to a standalone conditional block guarded by `effectiveProjectKey`.
- **Files modified:** `apps/web/src/components/layout/sidebar.tsx`
- **Commit:** ed5e4f4

**3. [Rule 1 - Bug] ApiKeysPanel create response parsing mismatch**
- **Found during:** Task 3 UAT (user-reported)
- **Fix:** Updated `handleCreate` to read `created.key` and `created.prefix` from flat API response.
- **Files modified:** `apps/web/src/components/settings/ApiKeysPanel.tsx`
- **Commit:** ed5e4f4

**4. [Rule 3 - Blocking] Duplicate @fastify/multipart registration crash**
- **Found during:** Task 3 UAT (user-reported)
- **Fix:** Removed duplicate `fastify.register(multipart, ...)` call from `ingestion.ts` — plugin already registered in `server.ts`.
- **Files modified:** `apps/api/src/routes/ingestion.ts`
- **Commit:** ed5e4f4

## Verification

- `pnpm --recursive lint` — passed (0 errors)
- `pnpm --recursive typecheck` — passed (0 errors)
- `cd apps/api && pnpm test` — 149 tests passed, 15 test files (all ingestion tests pass after multipart fix)

## Self-Check: PASSED

Files confirmed present:
- apps/web/src/components/settings/ApiKeysPanel.tsx — FOUND
- apps/web/src/components/ingestion/SetupGuide.tsx — FOUND
- apps/web/src/components/ingestion/IngestionHistory.tsx — FOUND
- apps/web/src/pages/app/[slug]/[projectKey]/ingestion.tsx — FOUND

Commits confirmed:
- 8ff90a7 — feat(04-05): add API key management panel to workspace settings
- 319264d — feat(04-05): add ingestion history page, setup guide, and sidebar nav
- ed5e4f4 — fix(04-05): apply post-checkpoint UAT fixes
