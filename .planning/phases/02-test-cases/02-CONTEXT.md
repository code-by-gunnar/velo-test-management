# Phase 2: Test Cases - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A QA engineer can create a test case from blank to saved in under 30 seconds using only the keyboard, organise test cases into a nested suite tree, reorder everything via drag-and-drop, and bulk-manage cases across suites — including importing from CSV or Excel with step structure preserved.

New capabilities NOT in this phase: search/filtering, tagging, archiving, step templates, Linear integration, comments.

</domain>

<decisions>
## Implementation Decisions

### Editor Layout
- **Panel type:** Right-side panel that slides in over ~50% of the screen. Case list stays visible on the left. Panel is the same component for both new and existing cases.
- **Focus on open:** Title field receives focus immediately when panel opens (for keyboard-first 30-second flow).
- **Step structure:** Two-column rows — Action | Expected result. Tab moves Action → Expected → next Action. Enter on the Expected result field adds a new step row below.
- **Save/close:** Cmd/Ctrl+S saves and closes panel. Esc discards and closes. No confirmation dialog for new unsaved cases.
- **View vs edit modes:** Clicking a case opens it in view mode. Pressing E or clicking an Edit button enters edit mode. Same panel, same component — mode toggle only.

### Test Case List View
- **Display:** Table with columns — drag handle (≡), checkbox, title, priority badge, steps count.
- **Columns visible:** Title, Priority, Steps count. No date columns in Phase 2.
- **Empty state:** Illustration + "Create your first test case" heading + prominent New Test Case button.
- **Suite filter:** Clicking a suite in the tree filters the list to that suite's cases only. Breadcrumb shows current suite context.

### Suite Tree Placement
- **Location:** Secondary left panel (~220px wide) between the main app sidebar and the case list. Collapsible.
- **Default state:** "All Cases" root node is selected by default, showing all cases unfiltered.
- **Suite creation:** Inline — click "+ New suite" or press N when tree is focused. A text input appears in-place. Enter confirms, Esc cancels.
- **Drag reorder:** Suites can only be reordered within their current parent (same depth level). Moving between parents is a separate action, not drag.

### Bulk Select UX
- **Checkbox visibility:** Always visible in a fixed left column (not hover-dependent). Select-all checkbox in the table header.
- **Range selection:** Shift+click to select a range of consecutive cases.
- **Bulk action bar:** Sticky bar at the bottom of the page, appears when ≥1 case is selected. Shows "X selected" count + action buttons: [Move to ▾] [Copy to ▾] [Delete]. Disappears on deselect.
- **Suite picker for Move/Copy:** Dropdown menu showing the suite hierarchy. Click a suite name to move/copy the selection there.

### Claude's Discretion
- Keyboard shortcut to create a new test case (e.g. N key when editor is not open, or a visible "+ New Case" button in the list header)
- Exact animation/transition for panel slide-in
- Pagination vs infinite scroll for large case lists (defer pagination decision to planner based on Phase 2 constraint of 500 case limit on Free tier)
- CSV/Excel import UX flow — file picker, column mapping, preview step (TC-06 implementation details)
- Drag handle cursor and drop indicator visual style

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Button** (`apps/web/src/components/ui/button.tsx`): CVA variants (primary, secondary, ghost, destructive) + size variants. Use for all panel buttons and bulk action bar.
- **Card** (`apps/web/src/components/ui/card.tsx`): Rounded border with shadow-sm. Use for the suite tree panel container and the empty state card.
- **Input + Label** (`apps/web/src/components/ui/input.tsx`): Error state support, cobalt focus ring. Use for the test case title field and suite inline create input.
- **StatusBadge** (`apps/web/src/components/ui/status-badge.tsx`): Existing badge component — repurpose for priority display (Critical/High/Medium/Low).
- **AppLayout + Sidebar** (`apps/web/src/components/layout/`): AppLayout accepts `slug` + `projectKey` props. Sidebar already has "Test Cases" nav item pointing to `/app/[slug]/[projectKey]/cases` (just needs `available: false` flipped to `true`).

### Established Patterns
- **CVA for variants:** All new components with visual variants should use `class-variance-authority` (Button pattern).
- **clsx for className:** Use `clsx()` not template literals for conditional classNames.
- **getServerSideProps + requireAuth:** Every page uses this guard pattern — new `/cases` page must follow.
- **Tailwind design tokens:** `cobalt`, `cobalt-dark`, `cobalt-light`, `fail`, `fail-bg`, `fail-text` are project-specific token aliases. Use them, don't use generic Tailwind colors for themed elements.
- **No hooks directory yet:** Any custom hooks (e.g., `useTestCases`, `useSuiteTree`) will be new files in `apps/web/src/hooks/`.

### Integration Points
- **New page:** `apps/web/src/pages/app/[slug]/[projectKey]/cases.tsx` — the Test Cases page. Replaces the placeholder in `[projectKey]/index.tsx`.
- **Sidebar nav:** Sidebar `NAV_ITEMS` "Test Cases" entry already points to the right href. Change `available: false` to `available: true`.
- **DB schema:** `suites`, `test_cases`, `test_case_steps` tables are fully defined in `apps/api/src/db/schema.ts` with gap-based `position` columns. No new migrations needed for core entities.
- **API routes:** New routes needed: `apps/api/src/routes/test-cases.ts` and `apps/api/src/routes/suites.ts`.
- **dnd-kit:** Not yet installed. Required for TC-04 drag-drop. Add to `apps/web` package.json.

</code_context>

<specifics>
## Specific Ideas

- The panel layout should look similar to the mockup discussed: suite tree on the left rail, case list in the center, editor panel slides in from the right when a case is opened or created.
- "All Cases" as the tree root node is intentional — matches Linear's "All Issues" pattern.
- The two-column step editor (Action | Expected result) is the core TC-01/TC-02 keyboard flow. This is non-negotiable — the Tab/Enter navigation must be native to the step rows.

</specifics>

<deferred>
## Deferred Ideas

- Full-text search across test case titles and steps (mentioned in v2 requirements as TC-V2-01)
- Tagging and archiving (TC-V2-02)
- Reusable step templates (TC-V2-03)
- Moving suites between parent nodes via drag (drag reorder is within-parent only in Phase 2)

</deferred>

---

*Phase: 02-test-cases*
*Context gathered: 2026-03-09*
