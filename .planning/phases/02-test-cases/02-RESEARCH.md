# Phase 2: Test Cases - Research

**Researched:** 2026-03-09
**Domain:** React keyboard-first UI, dnd-kit drag-drop, recursive CTE tree queries, CSV/Excel import, Fastify file upload
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Editor Layout**
- Panel type: Right-side panel that slides in over ~50% of the screen. Case list stays visible on the left. Panel is the same component for both new and existing cases.
- Focus on open: Title field receives focus immediately when panel opens (for keyboard-first 30-second flow).
- Step structure: Two-column rows — Action | Expected result. Tab moves Action → Expected → next Action. Enter on the Expected result field adds a new step row below.
- Save/close: Cmd/Ctrl+S saves and closes panel. Esc discards and closes. No confirmation dialog for new unsaved cases.
- View vs edit modes: Clicking a case opens it in view mode. Pressing E or clicking an Edit button enters edit mode. Same panel, same component — mode toggle only.

**Test Case List View**
- Display: Table with columns — drag handle (≡), checkbox, title, priority badge, steps count.
- Columns visible: Title, Priority, Steps count. No date columns in Phase 2.
- Empty state: Illustration + "Create your first test case" heading + prominent New Test Case button.
- Suite filter: Clicking a suite in the tree filters the list to that suite's cases only. Breadcrumb shows current suite context.

**Suite Tree Placement**
- Location: Secondary left panel (~220px wide) between the main app sidebar and the case list. Collapsible.
- Default state: "All Cases" root node is selected by default, showing all cases unfiltered.
- Suite creation: Inline — click "+ New suite" or press N when tree is focused. A text input appears in-place. Enter confirms, Esc cancels.
- Drag reorder: Suites can only be reordered within their current parent (same depth level). Moving between parents is a separate action, not drag.

**Bulk Select UX**
- Checkbox visibility: Always visible in a fixed left column (not hover-dependent). Select-all checkbox in the table header.
- Range selection: Shift+click to select a range of consecutive cases.
- Bulk action bar: Sticky bar at the bottom of the page, appears when ≥1 case is selected. Shows "X selected" count + action buttons: [Move to ▾] [Copy to ▾] [Delete]. Disappears on deselect.
- Suite picker for Move/Copy: Dropdown menu showing the suite hierarchy. Click a suite name to move/copy the selection there.

### Claude's Discretion
- Keyboard shortcut to create a new test case (e.g. N key when editor is not open, or a visible "+ New Case" button in the list header)
- Exact animation/transition for panel slide-in
- Pagination vs infinite scroll for large case lists (defer pagination decision to planner based on Phase 2 constraint of 500 case limit on Free tier)
- CSV/Excel import UX flow — file picker, column mapping, preview step (TC-06 implementation details)
- Drag handle cursor and drop indicator visual style

### Deferred Ideas (OUT OF SCOPE)
- Full-text search across test case titles and steps (mentioned in v2 requirements as TC-V2-01)
- Tagging and archiving (TC-V2-02)
- Reusable step templates (TC-V2-03)
- Moving suites between parent nodes via drag (drag reorder is within-parent only in Phase 2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TC-01 | User can create a test case with title, preconditions, steps, expected results, and priority — entirely by keyboard, in under 30 seconds from blank to saved | Slide panel + focus management + keyboard Tab/Enter step navigation + Ctrl+S save |
| TC-02 | User can add, reorder, and delete steps using only keyboard (Tab to next field, Enter to add step) | Step row component with onKeyDown handlers; Shift+Tab moves backward; Delete/Backspace on empty row removes it |
| TC-03 | User can organise test cases into nested suites (unlimited depth) within a project | Recursive CTE tree query in postgres.js; inline suite creation in tree; suite_id FK on test_cases |
| TC-04 | User can drag and drop suites and test cases to reorder them (gap-based integer positions, no full-table rewrite on reorder) | dnd-kit @dnd-kit/sortable + gap position PATCH endpoint; single-row UPDATE per reorder |
| TC-05 | User can bulk move or copy test cases between suites | Multi-select with Shift+click; bulk action bar; PATCH /test-cases/bulk endpoint with suite_id update or INSERT copies |
| TC-06 | User can import test cases from CSV or Excel file, preserving step structure (not flattened to single description field) | papaparse (CSV) + exceljs (XLSX); @fastify/multipart for file upload; column mapping UI + preview |
</phase_requirements>

---

## Summary

Phase 2 delivers the core content-creation experience of the Velo platform. All Phase 1 infrastructure is in place — schema tables (`suites`, `test_cases`, `test_case_steps`) are already defined, multi-tenancy via `withWorkspace()` is locked in, and the design system components are ready. No new database migrations are needed for the core entities; this phase is purely about building the API routes and UI.

The dominant technical challenges are: (1) keyboard-first step editing — getting Tab/Enter navigation exactly right across dynamically growing step rows without fighting the browser's native focus model; (2) dnd-kit integration for both the flat case list and the suite tree, where the within-parent-only constraint simplifies the tree drag significantly compared to full cross-parent reparenting; and (3) CSV/Excel import with step structure preservation, which requires @fastify/multipart on the API and papaparse/exceljs on the import parsing path.

The Free tier 500-case limit (already enforced at the API layer for projects) means pagination is low-priority for Phase 2 — simple scroll with a count cap is sufficient. However, the case list query must use indexes on `(project_id, suite_id, position)` from day one because Phase 3 will add run-execution queries over the same table.

**Primary recommendation:** Build in this order — API routes (suites CRUD, test cases CRUD, bulk ops, import endpoint), then the cases page layout (tree + list + panel skeleton), then keyboard step editor, then drag-drop, then bulk select, then CSV/Excel import.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.x | DnD context, sensors, collision detection | Maintained; accessible; replaces deprecated react-beautiful-dnd |
| @dnd-kit/sortable | ^8.x | `useSortable`, `SortableContext`, `arrayMove` | Sortable preset reduces boilerplate vs raw @dnd-kit/core |
| @dnd-kit/utilities | ^3.x | CSS transform utilities for drag items | Peer dep of @dnd-kit/sortable |
| papaparse | ^5.x | CSV parsing in browser and Node.js | Zero-dependency, MIT, 6.4M weekly downloads; streams in Node |
| exceljs | ^4.x | XLSX read/write in Node.js | 4.2M weekly downloads; active maintenance; streaming reader |
| @fastify/multipart | ^9.x | Multipart form upload in Fastify 5 | Official Fastify plugin; `toBuffer()` API; configurable size limits |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/papaparse | ^5.x | TypeScript types for papaparse | Always — install alongside papaparse in apps/web |
| react-hook-form | ^7.x | Already installed | Reuse for panel form fields (title, preconditions, priority) |
| zod | ^4.x | Already installed | Schema validation for import rows and API payloads |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/sortable | react-beautiful-dnd | rbd is deprecated (Atlassian archived it); dnd-kit is the replacement |
| exceljs | xlsx (SheetJS) | xlsx last published 4 years ago; exceljs actively maintained |
| @fastify/multipart | manual busboy | @fastify/multipart wraps busboy with Fastify lifecycle hooks already |

**Installation (apps/web):**
```bash
pnpm --filter @velo/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities papaparse @types/papaparse
```

**Installation (apps/api):**
```bash
pnpm --filter @velo/api add @fastify/multipart exceljs
```

---

## Architecture Patterns

### Recommended Project Structure
```
apps/
├── api/src/
│   └── routes/
│       ├── suites.ts           # CRUD + tree query
│       ├── test-cases.ts       # CRUD + bulk + import
│       └── __tests__/
│           ├── suites.test.ts
│           └── test-cases.test.ts
└── web/src/
    ├── pages/app/[slug]/[projectKey]/
    │   └── cases.tsx           # Main cases page
    ├── components/
    │   └── cases/
    │       ├── CasesPage.tsx           # Layout orchestrator
    │       ├── SuiteTree.tsx           # Left panel tree
    │       ├── SuiteTreeItem.tsx       # Single tree node (dnd-kit)
    │       ├── CaseList.tsx            # Sortable case table
    │       ├── CaseListRow.tsx         # Single row (dnd-kit)
    │       ├── CasePanel.tsx           # Slide-in right panel
    │       ├── StepEditor.tsx          # Step rows with Tab/Enter
    │       ├── StepRow.tsx             # Single Action|Expected row
    │       ├── BulkActionBar.tsx       # Sticky bottom bar
    │       └── ImportModal.tsx         # CSV/Excel import flow
    └── hooks/
        ├── useTestCases.ts     # Fetch + optimistic mutations
        ├── useSuiteTree.ts     # Fetch + recursive tree state
        └── useImport.ts        # File parse + preview state
```

### Pattern 1: Gap-Based Position Update (TC-04)

**What:** When drag ends, compute new position as midpoint between neighbors. If gap < 2, renumber all items in the suite with step 1000.
**When to use:** Every reorder operation — both suite reorder and case reorder.

```typescript
// Source: established gap-based ordering pattern (STATE.md architecture notes)
// Positions are stored as integers with increments of 1000 (initial: 1000, 2000, 3000, ...)

function computeNewPosition(
  items: { id: string; position: number }[],
  activeId: string,
  overId: string
): number {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const newIndex = sorted.findIndex(i => i.id === overId)
  const prev = sorted[newIndex - 1]?.position ?? 0
  const next = sorted[newIndex + 1]?.position ?? (sorted[newIndex].position + 2000)
  const newPos = Math.floor((prev + next) / 2)
  // If gap collapsed to 0 (positions identical), caller must renumber
  return newPos === prev ? -1 : newPos  // -1 signals renumber needed
}
```

**API endpoint:**
```typescript
// PATCH /api/workspaces/:workspaceId/projects/:projectId/cases/:caseId/position
// Body: { position: number }
// Single UPDATE — no full-table rewrite
```

### Pattern 2: Recursive CTE Suite Tree Query (TC-03)

**What:** Fetch all suites for a project in one query with depth tracking.
**When to use:** Loading the suite tree panel. Result is built into a tree client-side.

```typescript
// Source: PostgreSQL docs — WITH RECURSIVE (HIGH confidence)
// postgres.js tagged template literal — workspace context set by withWorkspace()
async function getSuiteTree(tx: WorkspaceSql, projectId: string) {
  return tx`
    WITH RECURSIVE suite_tree AS (
      -- Anchor: root suites (no parent)
      SELECT id, name, parent_id, position, 0 AS depth
      FROM   suites
      WHERE  project_id = ${projectId}
        AND  parent_id IS NULL
        AND  workspace_id = current_setting('app.workspace_id', true)::uuid

      UNION ALL

      -- Recursive: children of already-found suites
      SELECT s.id, s.name, s.parent_id, s.position, st.depth + 1
      FROM   suites s
      JOIN   suite_tree st ON s.parent_id = st.id
      WHERE  s.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
    SELECT * FROM suite_tree
    ORDER BY depth, position
  `
}
// Returns flat array — client builds tree structure from parent_id links
```

### Pattern 3: dnd-kit Sortable Case List (TC-04)

**What:** Wrap `CaseList` in `DndContext` + `SortableContext`. Each `CaseListRow` uses `useSortable`.
**When to use:** Case list (within-suite reorder) and suite tree (within-parent reorder, same pattern).

```typescript
// Source: dndkit.com/presets/sortable (HIGH confidence — official docs)
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensors, useSensor
} from "@dnd-kit/core"
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// In the list component:
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
)

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  // Compute new gap position, PATCH the API, optimistically update local state
  const newPosition = computeNewPosition(cases, active.id as string, over.id as string)
  mutateCasePosition(active.id as string, newPosition)
}

// In each row:
function CaseListRow({ testCase }: { testCase: TestCase }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: testCase.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <tr ref={setNodeRef} style={style}>
      <td><span {...attributes} {...listeners}>≡</span></td>
      {/* ... */}
    </tr>
  )
}
```

### Pattern 4: Keyboard Step Editor (TC-01, TC-02)

**What:** Step rows manage their own Tab/Enter/Backspace handling via `onKeyDown`.
**When to use:** TC-01 and TC-02 — the core 30-second creation flow.

```typescript
// Keyboard contract (locked in CONTEXT.md):
// Tab on Action field  → focus Expected field in same row
// Tab on Expected field → focus Action field in NEXT row (creates new row if last)
// Enter on Expected field → add new step row, focus its Action field
// Backspace on empty Action field → delete row, focus previous row's Expected field

function StepRow({ step, index, isLast, onAddAfter, onDelete, onFocusRef }: StepRowProps) {
  const actionRef = useRef<HTMLTextAreaElement>(null)
  const expectedRef = useRef<HTMLTextAreaElement>(null)

  function handleActionKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault()
      expectedRef.current?.focus()
    }
    if (e.key === "Backspace" && actionRef.current?.value === "" && index > 0) {
      e.preventDefault()
      onDelete(index)  // caller focuses previous row's Expected
    }
  }

  function handleExpectedKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault()
      onAddAfter(index)  // creates new row, focuses its Action
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onAddAfter(index)
    }
  }
  // ...
}
```

**Critical:** Use `textarea` (not `input`) for Action and Expected fields — QA engineers write multi-sentence steps. Auto-resize height with `rows={1}` + CSS `overflow-hidden resize-none` is the standard pattern.

### Pattern 5: Fastify Multipart File Upload (TC-06)

**What:** Register @fastify/multipart plugin; read uploaded file buffer in route handler; pass buffer to papaparse/exceljs.
**When to use:** `POST /api/workspaces/:wid/projects/:pid/cases/import`

```typescript
// Source: @fastify/multipart npm page (HIGH confidence)
import multipart from "@fastify/multipart"

// In server.ts — register once:
await fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })  // 5MB max

// In route handler:
fastify.post("/api/workspaces/:workspaceId/projects/:projectId/cases/import", async (request, reply) => {
  const data = await request.file()
  if (!data) return reply.status(400).send({ error: "No file" })
  const buffer = await data.toBuffer()
  const filename = data.filename.toLowerCase()

  if (filename.endsWith(".csv")) {
    const text = buffer.toString("utf-8")
    const result = Papa.parse(text, { header: true, skipEmptyLines: true })
    // map result.data to test cases + steps
  } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    // iterate wb.worksheets[0].eachRow(...)
  }
})
```

### Pattern 6: Slide-In Panel Focus Management (TC-01)

**What:** When panel opens, focus the title input. When panel closes, return focus to the row that opened it.
**When to use:** Every panel open/close cycle.

```typescript
// WCAG 2.1 focus management pattern
function CasePanel({ isOpen, caseId, onClose }: CasePanelProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)  // element that opened panel

  useEffect(() => {
    if (isOpen) {
      // Store the element that triggered the open so we can restore focus on close
      triggerRef.current = document.activeElement as HTMLElement
      // Delay one tick to let the panel render before focusing
      setTimeout(() => titleRef.current?.focus(), 0)
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  // Escape key handling
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isOpen, onClose])
}
```

### Anti-Patterns to Avoid

- **Storing steps as JSONB:** Already locked against this in STATE.md. Normalized `test_case_steps` table is required.
- **Nested `SortableContext` for cross-parent drag:** dnd-kit cannot do cross-level drag with nested contexts. The within-parent-only constraint in CONTEXT.md sidesteps this entirely.
- **Using `input` instead of `textarea` for step fields:** Multi-line step content is very common in real QA work. Use auto-resizing `textarea`.
- **Fetching the full suite tree on every case list filter change:** Fetch tree once on page load; filter the case list client-side by `suite_id`. Tree only re-fetches after suite mutations.
- **Writing run.status as a writable column:** Already locked in STATE.md pitfall M5 — not relevant to Phase 2 but this table is being built now.
- **Saving a test case on every keystroke:** Debounce auto-save (if implementing) at 1500ms minimum, or use explicit Ctrl+S / save button only (as locked in CONTEXT.md).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-drop sortable list | Custom mouse events + position tracking | @dnd-kit/sortable | Touch, keyboard, accessibility, scroll edge cases |
| CSV parsing | String.split(',') with regex | papaparse | Quoted commas, multiline cells, BOM, encoding edge cases |
| Excel reading | Buffer slicing | exceljs | XLSX format is a ZIP of XML; exceljs handles all variants |
| File upload | Raw body stream | @fastify/multipart | Fastify lifecycle hooks, size limits, multipart boundary parsing |
| Recursive tree client build | Nested loops | Single reduce pass with Map | O(n) vs O(n²); Map by id for O(1) parent lookup |
| Position renumbering trigger | Client-side only | Server-side detection + renumber | Client can't know if gap collapsed without round trip |

**Key insight:** The gap-based integer ordering means reorders are single-row UPDATEs. The only exception is a renumber pass (all items in a suite get new gap positions), which happens only when gaps are exhausted — extremely rare at 500-case scale.

---

## Common Pitfalls

### Pitfall 1: Tab Key Swallowed by Browser Before React Sees It
**What goes wrong:** `onKeyDown` on a `textarea` fires, but `e.preventDefault()` must be called synchronously — React synthetic events are pooled and calling `preventDefault()` after an async operation is a no-op.
**Why it happens:** React's synthetic event system; default Tab behavior moves focus before any async work.
**How to avoid:** All Tab key handling in `StepRow.handleActionKeyDown` must call `e.preventDefault()` as the first line, synchronously. New row creation and focus management happen after.
**Warning signs:** Tab sometimes works, sometimes doesn't — indicates async in the keydown handler.

### Pitfall 2: dnd-kit PointerSensor Activates on Checkbox Click
**What goes wrong:** Clicking a checkbox in the case list row (for bulk select) accidentally activates the drag sensor.
**Why it happens:** PointerSensor fires on any pointer down in the draggable element unless excluded.
**How to avoid:** Add `activationConstraint: { distance: 8 }` to PointerSensor, or use the `useSensor` with a custom `shouldStart` that excludes checkbox clicks.
```typescript
useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
```
**Warning signs:** Checkbox clicks trigger drag ghost.

### Pitfall 3: Recursive CTE Missing workspace_id on Recursive Branch
**What goes wrong:** The recursive branch of the CTE joins `suites` without the `workspace_id` filter — tenancy isolation breaks.
**Why it happens:** RLS SET LOCAL applies within the transaction but the CTE recursive branch can bypass the check if the WHERE clause is omitted.
**How to avoid:** Always include `s.workspace_id = current_setting('app.workspace_id', true)::uuid` on BOTH the anchor AND the recursive branch. Verified by integration test.
**Warning signs:** Suite tree shows suites from other workspaces (caught only if running a multi-tenant integration test).

### Pitfall 4: Excel Multi-Row Step Format vs Flat Import
**What goes wrong:** Some QA teams export Excel with one row per step (many rows per test case, identified by case title repetition). Others export one row per case with all steps in a single cell (pipe-delimited). Neither format is standard.
**Why it happens:** No standard for test case Excel export formats; every tool does it differently.
**How to avoid:** TC-06 requires a column-mapping preview step (Claude's Discretion). Detect both patterns: if a "Step" column exists → multi-row format; if a single "Steps" column with delimiters → parse by delimiter. Let the user confirm the mapping before importing.
**Warning signs:** All imported cases have exactly 1 step (flattening happened silently).

### Pitfall 5: Bulk Copy Duplicates Step Rows but Misses step_order
**What goes wrong:** Bulk copy of test cases does INSERT INTO test_cases SELECT ... which works, but the associated INSERT INTO test_case_steps SELECT ... preserves the original `test_case_id` reference rather than the new case IDs.
**Why it happens:** Copy operation is two-step (cases then steps) and the mapping between old and new case IDs must be explicit.
**How to avoid:** Use a CTE in the copy query that returns the mapping of old_id → new_id, then use that mapping in the steps insert:
```sql
WITH copied_cases AS (
  INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, preconditions, priority, position, created_by)
  SELECT uuidv7(), workspace_id, project_id, $target_suite_id, title, preconditions, priority, position, $user_id
  FROM test_cases
  WHERE id = ANY($case_ids)
  RETURNING id, (SELECT id FROM test_cases WHERE ...) AS source_id  -- needs subquery for mapping
)
-- This pattern requires returning old id alongside new id; use a JOIN approach instead
```
The safest approach: fetch cases to copy in app code, generate new UUIDs in app layer, INSERT cases, then INSERT steps with correct new `test_case_id` mappings — done in a single `withWorkspace` transaction.
**Warning signs:** Copied cases exist but show 0 steps.

### Pitfall 6: Panel Slide Animation Causes Focus Timing Issue
**What goes wrong:** The panel animates in over ~200ms, but `titleRef.current?.focus()` fires before the element is visible, causing focus to silently fail on some browsers.
**Why it happens:** `display: none` → `display: block` transition — element is not focusable until visible.
**How to avoid:** Use `setTimeout(() => titleRef.current?.focus(), 0)` — defers to next microtask after render. Or use a CSS transition that keeps element in the DOM but uses `translate`/`opacity` rather than `display`.
**Warning signs:** Panel opens but title field is not focused; user must click before typing.

---

## Code Examples

### Tree Builder (Client-Side, from Flat Array)
```typescript
// O(n) tree build using Map — avoids O(n²) nested loops
type Suite = { id: string; parent_id: string | null; name: string; position: number; children?: Suite[] }

function buildTree(flatSuites: Suite[]): Suite[] {
  const map = new Map<string, Suite>()
  const roots: Suite[] = []
  for (const s of flatSuites) {
    map.set(s.id, { ...s, children: [] })
  }
  for (const s of map.values()) {
    if (s.parent_id === null) {
      roots.push(s)
    } else {
      map.get(s.parent_id)?.children?.push(s)
    }
  }
  // Sort each level by position
  function sortLevel(nodes: Suite[]) {
    nodes.sort((a, b) => a.position - b.position)
    nodes.forEach(n => n.children && sortLevel(n.children))
  }
  sortLevel(roots)
  return roots
}
```

### Gap Position Renumber (when gap exhausted)
```typescript
// Source: gap-based ordering architecture (STATE.md)
// Called when computeNewPosition returns -1 (gap collapsed)
async function renumberSuite(tx: WorkspaceSql, suiteId: string | null, projectId: string) {
  const cases = await tx`
    SELECT id FROM test_cases
    WHERE project_id = ${projectId}
      AND suite_id ${suiteId === null ? tx`IS NULL` : tx`= ${suiteId}`}
    ORDER BY position
  `
  for (let i = 0; i < cases.length; i++) {
    await tx`UPDATE test_cases SET position = ${(i + 1) * 1000} WHERE id = ${cases[i].id}`
  }
}
```

### papaparse CSV Import (Browser-Side Preview)
```typescript
// Source: papaparse.com (HIGH confidence)
// Used in ImportModal for client-side preview before sending to API
import Papa from "papaparse"

function previewCsv(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 10,  // First 10 rows for preview only
      complete: (results) => resolve(results.data as ParsedRow[]),
      error: reject,
    })
  })
}
```

---

## API Endpoint Design

All routes are tenant-scoped and must use `withWorkspace()`. Base path: `/api/workspaces/:workspaceId/projects/:projectId/`

| Method | Path | Purpose | TC Req |
|--------|------|---------|--------|
| GET | `.../suites` | Full suite tree (recursive CTE) | TC-03 |
| POST | `.../suites` | Create suite | TC-03 |
| PATCH | `.../suites/:suiteId` | Rename suite | TC-03 |
| PATCH | `.../suites/:suiteId/position` | Reorder suite | TC-04 |
| DELETE | `.../suites/:suiteId` | Delete suite (cascades to test_cases via set null) | TC-03 |
| GET | `.../cases` | List cases (filter by suite_id via query param) | TC-01 |
| POST | `.../cases` | Create case + steps (single transaction) | TC-01 |
| GET | `.../cases/:caseId` | Get case + steps | TC-01 |
| PUT | `.../cases/:caseId` | Full replace case + steps | TC-01, TC-02 |
| PATCH | `.../cases/:caseId/position` | Reorder case | TC-04 |
| DELETE | `.../cases/:caseId` | Soft delete case | TC-01 |
| POST | `.../cases/bulk` | Bulk move/copy/delete | TC-05 |
| POST | `.../cases/import` | CSV/Excel import (multipart) | TC-06 |

**Note on case save:** When saving a test case with steps, do it in a single `withWorkspace` transaction: upsert the case, delete existing steps for the case, insert new steps. This avoids partial saves and is idempotent on retry.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit/sortable | 2022 (rbd archived) | dnd-kit is the ecosystem standard; better keyboard/touch |
| xlsx (SheetJS) | exceljs | xlsx stagnated ~2021 | exceljs actively maintained; cleaner streaming API |
| textarea with manual focus | useRef + setTimeout focus | Always needed | Must be explicit; autoFocus prop unreliable on animated elements |
| position as float (fractional indexing) | position as integer gaps | Architectural choice | Integer gaps simpler for Phase 2 scale; fractional indexing is overkill at 500 cases |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Archived by Atlassian. Do not use.
- `xlsx` npm package: 4 years since last publish. Use exceljs.
- `SheetJS CE` (same as xlsx): Community edition has been abandoned; Pro version exists but is not free.

---

## Open Questions

1. **Import column mapping UX**
   - What we know: TC-06 requires step structure preserved; different export formats exist (multi-row vs single-row with delimiter)
   - What's unclear: How prescriptive should the column mapping UI be? Auto-detect column names ("Title", "Action", "Expected") vs always show manual mapping step?
   - Recommendation: Auto-detect common column names (case-insensitive match: "title"/"test case"/"name" → title; "action"/"step"/"description" → step action; "expected"/"expected result" → expected result). Show preview with auto-detected mapping. Allow manual override. This is Claude's Discretion per CONTEXT.md.

2. **Case list: pagination vs scroll for Free tier**
   - What we know: Free tier is capped at 500 test cases (WORK-03, enforced at API layer). 500 rows rendered at once in a table is acceptable for modern browsers.
   - What's unclear: Planner needs to decide — simple scroll (no pagination) or virtual scroll for performance safety.
   - Recommendation: Simple scroll for Phase 2. The 500-case cap means max ~500 rows, which is fine without virtualization. Add `LIMIT 500` to the case list query as a safety guard. Revisit in Phase 3 if performance data warrants it.

3. **Soft delete visibility**
   - What we know: STATE.md notes soft deletes on TestCase. The schema has no `deleted_at` column in the current schema.ts.
   - What's unclear: Was soft delete deferred to Phase 2 (add `deleted_at` column via migration) or is hard delete acceptable for Phase 2?
   - Recommendation: Add `deleted_at timestamptz` to `test_cases` via a new migration in Phase 2 Wave 1. All list queries filter `WHERE deleted_at IS NULL`. Delete endpoint sets `deleted_at = NOW()`. This is minimal migration cost and avoids losing data during active development.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` and `apps/web/vitest.config.ts` (existing) |
| Quick run command | `pnpm --filter @velo/api test` |
| Full suite command | `pnpm -r test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TC-01 | POST /cases creates case with steps in one transaction | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ Wave 0 |
| TC-01 | GET /cases returns only cases for requesting workspace | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ Wave 0 |
| TC-02 | Step keyboard navigation (Tab/Enter/Backspace) in StepEditor | unit (jsdom) | `pnpm --filter @velo/web test -- StepEditor` | ❌ Wave 0 |
| TC-03 | Recursive CTE returns correct nested tree | integration | `pnpm --filter @velo/api test -- suites` | ❌ Wave 0 |
| TC-03 | Workspace isolation: suite tree shows only own-workspace suites | integration | `pnpm --filter @velo/api test -- suites` | ❌ Wave 0 |
| TC-04 | PATCH /cases/:id/position updates single row, not full table | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ Wave 0 |
| TC-05 | POST /cases/bulk with action=move updates suite_id for all selected | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ Wave 0 |
| TC-05 | POST /cases/bulk with action=copy creates new rows with steps intact | integration | `pnpm --filter @velo/api test -- test-cases` | ❌ Wave 0 |
| TC-06 | CSV import preserves step rows (not flattened) | unit | `pnpm --filter @velo/api test -- import` | ❌ Wave 0 |
| TC-06 | XLSX import preserves step rows | unit | `pnpm --filter @velo/api test -- import` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @velo/api test` (API unit + integration)
- **Per wave merge:** `pnpm -r test` (all packages)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/routes/__tests__/suites.test.ts` — covers TC-03 (tree query, workspace isolation)
- [ ] `apps/api/src/routes/__tests__/test-cases.test.ts` — covers TC-01, TC-04, TC-05, TC-06
- [ ] `apps/web/src/__tests__/StepEditor.test.tsx` — covers TC-02 (keyboard navigation)
- [ ] `apps/api/src/lib/import-parser.ts` + `apps/api/src/lib/__tests__/import-parser.test.ts` — CSV/XLSX parsing unit tests
- [ ] Test fixture files: `apps/api/src/routes/__tests__/fixtures/import-sample.csv` and `import-sample.xlsx`

---

## Sources

### Primary (HIGH confidence)
- `dndkit.com/presets/sortable` — useSortable hook API, SortableContext, sensors, arrayMove, keyboard sensor
- `@fastify/multipart` npm page — `toBuffer()`, `request.file()`, plugin registration with Fastify 5
- PostgreSQL docs 18.x: `WITH RECURSIVE` — CTE syntax, anchor + recursive branch structure
- `papaparse.com` — header option, skipEmptyLines, Node.js stream support

### Secondary (MEDIUM confidence)
- WebSearch: dnd-kit nested tree + flattening approach — confirmed by multiple sources that within-parent sorting uses standard SortableContext without flattening; cross-parent requires flat array approach (not needed here per CONTEXT.md)
- WebSearch: exceljs WorkbookReader stream API for XLSX buffer loading — consistent across npm page and examples

### Tertiary (LOW confidence)
- Gap-based position renumber trigger logic — pattern derived from STATE.md architecture notes and general fractional indexing literature; no specific official source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dnd-kit, papaparse, exceljs, @fastify/multipart all verified via official sources with active maintenance
- Architecture: HIGH — patterns derived from existing codebase conventions (STATE.md, tenant.ts, workspaces.ts) + official library docs
- Pitfalls: HIGH for keyboard/dnd pitfalls (confirmed community knowledge); MEDIUM for multi-row Excel format variance (observed pattern, not spec-defined)

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (stable libraries; dnd-kit API has been stable since v6)
