---
phase: 02-test-cases
plan: "06"
subsystem: import
tags: [csv, xlsx, import, papaparse, exceljs, multipart, tdd]
dependency_graph:
  requires: [02-02, 02-03]
  provides: [TC-06]
  affects: [apps/api/src/lib/import-parser.ts, apps/api/src/routes/test-cases.ts, apps/api/src/server.ts, apps/web/src/components/cases/ImportModal.tsx, apps/web/src/hooks/useImport.ts, apps/web/src/components/cases/CaseList.tsx, apps/web/src/components/cases/CasesPage.tsx]
tech_stack:
  added: [papaparse (api), @fastify/multipart (registered)]
  patterns: [TDD-red-green, pure-function-parser, formdata-file-upload, state-machine-hook]
key_files:
  created:
    - apps/api/src/lib/import-parser.ts
    - apps/api/src/lib/__tests__/import-parser.test.ts
    - apps/web/src/components/cases/ImportModal.tsx
    - apps/web/src/hooks/useImport.ts
  modified:
    - apps/api/src/routes/test-cases.ts
    - apps/api/src/server.ts
    - apps/api/src/test/global-setup.ts
    - apps/web/src/components/cases/CaseList.tsx
    - apps/web/src/components/cases/CasesPage.tsx
decisions:
  - "Raw file (FormData) sent to server — no client-side pre-parsing. Server is canonical parser."
  - "papaparse used on both client (preview) and server (CSV parse). exceljs used server-side for XLSX."
  - "global-setup.ts made non-fatal when DATABASE_URL missing — enables pure unit tests without DB."
  - "Buffer type cast via 'as any' for ExcelJS.xlsx.load — exceljs types expect legacy Buffer signature incompatible with TS5 Buffer<ArrayBufferLike>."
  - "XLSX files skip client-side preview (binary format, no browser papaparse for XLSX) — server auto-detects columns."
metrics:
  duration: ~40m
  completed_date: "2026-03-09"
  tasks_completed: 2
  tasks_total: 3
  checkpoint_reached: true
---

# Phase 02 Plan 06: CSV/Excel Import Summary

**One-liner:** CSV/XLSX import with step structure preservation via pure `parseImportBuffer` function, FormData upload endpoint, and 3-step ImportModal (file picker, column mapping preview, import).

---

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | import-parser.ts + API upload endpoint | e37e1fd | Complete |
| 2 | ImportModal UI (file picker + column mapping + preview) | ad8406f | Complete |
| 3 | Checkpoint: human verify CSV/Excel import | — | STOPPED — awaiting human verification |

---

## What Was Built

### Task 1: import-parser.ts (pure function) + API upload endpoint

**`apps/api/src/lib/import-parser.ts`** — pure async function `parseImportBuffer(buffer, filename)`:
- CSV: parsed via papaparse server-side; multi-row format detected (rows sharing the same title are grouped into one `TestCaseImport` with multiple steps)
- XLSX: parsed via exceljs `wb.xlsx.load(buffer)` — same multi-row grouping
- Auto-detects columns (case-insensitive): title/test case/name, action/step/description, expected/expected result, preconditions, priority/severity
- Throws `"Missing required column: title"` for files without a title column

**`apps/api/src/routes/test-cases.ts`** — POST `/api/workspaces/:wid/projects/:pid/cases/import`:
- Accepts multipart/form-data with file field
- Calls `parseImportBuffer`; returns 422 on parse error
- Inserts each case + its steps atomically inside `withWorkspace` transaction
- Stops at free tier cap (500 cases)
- Returns `{ imported: N }` on success

**`apps/api/src/server.ts`** — registered `@fastify/multipart` with 5MB `fileSize` limit before route plugins.

**Test results:** 8 unit tests pass (CSV structure, XLSX fixture, multi-row grouping, missing-title error, case-insensitive headers).

### Task 2: ImportModal UI

**`apps/web/src/hooks/useImport.ts`** — state machine hook:
- States: `idle → file-selected → previewing → importing → done | error`
- `selectFile(file)`: validates 5MB, calls papaparse for CSV preview, goes straight to previewing for XLSX
- `runImport()`: POSTs `FormData` (raw file), handles success/error
- `reset()`: returns to idle state

**`apps/web/src/components/cases/ImportModal.tsx`** — 3-step modal:
- Step 1: drag-and-drop zone + file input for `.csv/.xlsx/.xls`, 5MB error shown inline
- Step 2: papaparse first-10-row preview table, column mapping dropdowns (title/action/expected), required field warning, Back button
- Step 3: importing spinner → success count + Close, or error + Try Again
- Closes on Esc or backdrop click

**`apps/web/src/components/cases/CaseList.tsx`** — `onImport` prop added; Import button rendered next to New Case in header.

**`apps/web/src/components/cases/CasesPage.tsx`** — `ImportModal` rendered; `importOpen` state; `handleImportSuccess` refetches cases.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] global-setup.ts fatal when no DATABASE_URL**

- **Found during:** Task 1 (TDD RED phase — test runner crashed before import-parser.test.ts could run)
- **Issue:** `global-setup.ts` threw `"DATABASE_URL required for tests"` which prevented the pure unit test from collecting
- **Fix:** Changed to log a warning and return early when `DATABASE_URL` is absent — tests that need DB still fail (correctly) when run without it; pure unit tests can now run
- **Files modified:** `apps/api/src/test/global-setup.ts`
- **Commit:** e37e1fd

**2. [Rule 1 - Bug] Buffer type incompatibility with ExcelJS**

- **Found during:** Task 1 (API typecheck)
- **Issue:** TypeScript 5.x changed `Buffer` to `Buffer<ArrayBufferLike>` which is incompatible with exceljs's `xlsx.load(buffer: Buffer)` signature
- **Fix:** `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `buffer as any` cast — exceljs works correctly at runtime; only the type definition is stale
- **Files modified:** `apps/api/src/lib/import-parser.ts`
- **Commit:** e37e1fd

**3. [Rule 1 - Bug] TS2367 false narrowing in ImportModal**

- **Found during:** Task 2 (web typecheck)
- **Issue:** TypeScript narrowed `state.status` to `"idle" | "file-selected"` inside a conditional, then the inner comparison `state.status === "error"` was flagged as impossible
- **Fix:** Merged conditions into a single expression `(status === "idle" || status === "file-selected" || (status === "error" && !state.file))`
- **Files modified:** `apps/web/src/components/cases/ImportModal.tsx`
- **Commit:** ad8406f

---

## Self-Check: PASSED

- apps/api/src/lib/import-parser.ts: FOUND
- apps/api/src/lib/__tests__/import-parser.test.ts: FOUND
- apps/web/src/components/cases/ImportModal.tsx: FOUND
- apps/web/src/hooks/useImport.ts: FOUND
- Commit e37e1fd: FOUND
- Commit ad8406f: FOUND
