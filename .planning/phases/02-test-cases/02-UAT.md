---
status: complete
phase: 02-test-cases
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md]
started: 2026-03-10T23:00:00Z
updated: 2026-03-10T23:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Start the API and web from scratch. Server boots without errors, migrations run, and the app loads at localhost:3000 with no console errors.
result: pass

### 2. Create a Test Case (TC-01)
expected: Navigate to Test Cases page. Press N or click "New Case". A slide-in panel appears on the right. Type a title, add steps using Tab/Enter, set priority. Press Cmd+S (or Ctrl+S). The case appears in the case list with the correct title, priority, and step count.
result: pass
note: Fixed during UAT — suite_id:null was sent in JSON body, Fastify schema rejected it. Fixed by omitting suite_id when null.

### 3. Keyboard Step Editor (TC-02)
expected: In the case editor, Tab from Action field moves to Expected Result field. Tab from Expected Result creates a new step row and focuses its Action field. Enter in Expected Result also creates a new row. Backspace on an empty Action field deletes that step row. Shift+Tab moves back to the previous field.
result: pass

### 4. Suite Tree Navigation (TC-03)
expected: The left panel shows a suite tree with "All Cases" at the root. You can create a new suite (inline text input). Clicking a suite filters the case list to that suite's cases. Suites can be nested. Expanding/collapsing a suite shows/hides its children.
result: pass
note: Fixed during UAT — parent_id:null was sent in JSON body for root suites, Fastify schema rejected it. Fixed by omitting parent_id when creating root suites. User noted 2-3s buffering when switching from suite to All Cases with only 2 test cases — performance improvement needed later (indexes or query optimization).

### 5. Drag-Drop Reorder Cases (TC-04)
expected: In the case list, grab the drag handle on a case row and drag it to a new position. The row moves visually during drag. After dropping, the new order persists after refresh.
result: pass

### 6. Drag-Drop Reorder Suites (TC-04)
expected: In the suite tree, grab the drag handle on a suite and drag it above or below a sibling suite. The suite reorders within its parent. The new order persists after refresh.
result: pass

### 7. Bulk Select Cases (TC-05)
expected: Click the checkbox on multiple case rows. A bulk action bar appears at the bottom showing "{N} selected". Shift-click selects a range. The "Select all" checkbox selects/deselects all visible cases.
result: pass
note: Minor bug observed — after importing 2 cases, moving 1 to Suite 1, then copying both to Suite 2, "All Cases" shows 4 instead of expected 3. Likely a duplicate in the All Cases query or stale frontend state after bulk copy. Non-blocking.

### 8. Bulk Move/Copy/Delete (TC-05)
expected: With cases selected, "Move to" moves cases to target suite. "Copy to" duplicates cases into target suite. "Delete" soft-deletes selected cases.
result: pass

### 9. CSV Import (TC-06)
expected: Click "Import", upload CSV with title/action/expected columns, preview table shows rows with column mapping, import creates cases with step structure intact.
result: pass

### 10. XLSX Import (TC-06)
expected: Upload .xlsx file, import creates cases with correct titles and steps.
result: issue
reported: "error 422 in console and Corrupted zip: missing 432510445 bytes on front end. User preference: drop XLSX support entirely — majority of imports are CSV only."
severity: major

### 11. Edit an Existing Case
expected: Click on a case, slide-in panel shows details in view mode. Press E or click Edit. Modify title or steps. Save — changes persist.
result: pass

### 12. Delete a Single Case
expected: Delete a case via bulk delete with one case selected. Case disappears from list. Soft-deleted.
result: pass

## Summary

total: 12
passed: 11
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Upload .xlsx file, import creates cases with correct titles and steps"
  status: failed
  reason: "User reported: error 422 and Corrupted zip: missing 432510445 bytes. User decision: drop XLSX support entirely, CSV-only."
  severity: major
  test: 10
  root_cause: "XLSX binary corrupted during multipart transit; exceljs zip parser fails. User wants XLSX removed, not fixed."
  artifacts:
    - path: "apps/api/src/lib/import-parser.ts"
      issue: "XLSX parsing path should be removed"
    - path: "apps/web/src/components/cases/ImportModal.tsx"
      issue: "File accept filter should be CSV-only"
    - path: "apps/web/src/hooks/useImport.ts"
      issue: "XLSX handling should be removed"
  missing:
    - "Remove XLSX parsing from import-parser.ts"
    - "Remove exceljs dependency from apps/api"
    - "Update ImportModal to accept .csv only"
    - "Update useImport to remove XLSX branch"
  debug_session: ""
