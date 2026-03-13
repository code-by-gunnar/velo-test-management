# Roadmap: v1.4 GWT / BDD Test Cases

## Overview

Add native Given-When-Then test case format as a project-level setting. Projects choose their format at creation (locked after). GWT projects get a keyword-aware step editor, scenario-level execution, and CSV import support. Traditional format remains the default — this is additive, not a replacement.

## Phases

**Phase Numbering:**
- Integer phases (1–5): Planned milestone work
- Phase directories use global numbering (11-gwt-schema, 12-format-selection, etc.) to avoid collision with prior milestones

- [ ] **Phase 1: Schema & API** — Add test_format to projects, step_type to test_case_steps, update all CRUD endpoints
- [ ] **Phase 2: Format Selection** — Onboarding format picker, create project modal picker, read-only display in settings
- [ ] **Phase 3: GWT Step Editor** — Keyword-aware editor with auto-suggest pills, single text field per step, keyboard navigation
- [ ] **Phase 4: Execution** — Scenario-level pass/fail for GWT cases, execution screen adapts to format, dashboard unchanged
- [ ] **Phase 5: CSV Import** — Keyword column mapping for GWT projects, case-insensitive parsing, default fallback

## Phase Details

### Phase 1: Schema & API
**Goal**: Backend fully supports GWT format — projects can declare their format, steps can carry keyword types
**Depends on**: Nothing (first phase)
**Requirements**: GWT-01, GWT-02, GWT-03, GWT-04, GWT-05, GWT-06
**Success Criteria** (what must be TRUE):
  1. Migration adds `test_format VARCHAR(10) NOT NULL DEFAULT 'steps'` to projects table
  2. Migration adds `step_type VARCHAR(10) NOT NULL DEFAULT 'action'` to test_case_steps table
  3. `POST /api/workspaces/:id/projects` accepts `test_format` field; defaults to `'steps'`
  4. `GET /api/workspaces/:id/projects` and `GET .../projects/by-key/:key` return `test_format`
  5. `POST /cases` and `PUT /cases/:id` accept `step_type` on each step; default `'action'` when omitted
  6. `GET /cases/:id` returns `step_type` on each step in the `steps` array
  7. All existing tests still pass — changes are backwards-compatible
**Plans:** 11-01 (GWT Schema & API Foundation)

### Phase 2: Format Selection
**Goal**: Users choose their test format during project creation — onboarding and create modal both offer the picker
**Depends on**: Phase 1 (API accepts test_format)
**Requirements**: GWT-07, GWT-08, GWT-09
**Success Criteria** (what must be TRUE):
  1. Onboarding flow shows a format picker step with two visual cards after project name/key — "Traditional Steps" (shows Action/Expected columns preview) and "Given-When-Then" (shows keyword-prefixed steps preview)
  2. Selected format is sent as `test_format` in the project creation API call
  3. Create Project modal includes the same format picker below the name/key fields
  4. Project settings General tab displays the chosen format as a read-only badge (e.g., "Traditional Steps" or "Given-When-Then") — not editable
**Plans:** 12-01 (Format Selection UI)

### Phase 3: GWT Step Editor
**Goal**: GWT projects get a dedicated step editor that feels native and keyboard-first
**Depends on**: Phase 1 (step_type in API), Phase 2 (projects have test_format)
**Requirements**: GWT-10, GWT-11, GWT-12, GWT-13, GWT-14, GWT-15
**Success Criteria** (what must be TRUE):
  1. When the project's `test_format` is `'gwt'`, the CasePanel renders GwtStepEditor instead of the traditional StepEditor
  2. Each step shows a keyword pill on the left (clickable dropdown: Given/When/Then/And/But) and a single text input on the right
  3. First step auto-defaults to Given; subsequent steps auto-suggest the next logical keyword (Given→When→Then→Then)
  4. User can override the keyword by clicking the pill and selecting from the dropdown
  5. Preconditions textarea remains above the step editor
  6. Keyboard: Tab moves pill→text, Enter/Tab at text end adds new step, Backspace on empty deletes, same flow as traditional editor
**Plans:** 13-01 (GWT Step Editor)

### Phase 4: Execution
**Goal**: GWT cases execute as whole scenarios with a single pass/fail, not per-step
**Depends on**: Phase 3 (GWT editor exists, cases have step_type data)
**Requirements**: GWT-16, GWT-17, GWT-18
**Success Criteria** (what must be TRUE):
  1. Test run execution screen detects the project's `test_format` and adapts the UI
  2. For GWT cases: steps render read-only with keyword labels, no per-step status controls
  3. A single status dropdown (Pass/Fail/Blocked/Skipped) applies to the entire scenario
  4. Run dashboard, results summary, and export all work identically — they operate at case level regardless of format
**Plans:** 14-01 (GWT Execution Adaptation)

### Phase 5: CSV Import
**Goal**: GWT projects can bulk-import BDD scenarios from CSV files with a keyword column
**Depends on**: Phase 1 (step_type in API)
**Requirements**: GWT-19, GWT-20, GWT-21, GWT-22
**Success Criteria** (what must be TRUE):
  1. CSV import adds a `colKeyword` query parameter for mapping the keyword column
  2. Mapped keyword values are normalized: case-insensitive, trimmed, validated against allowed values
  3. Each imported row creates a step with the corresponding `step_type`
  4. If `colKeyword` is not mapped for a GWT project, imported steps default to `step_type: 'given'`
  5. Import still works identically for traditional-format projects (step_type defaults to 'action')
**Plans:** 15-01 (GWT CSV Import — Keyword Column)

## Progress

**Execution Order:**
Phases execute in order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & API | 1/1 | Planned | - |
| 2. Format Selection | 1/1 | Planned | - |
| 3. GWT Step Editor | 1/1 | Planned | - |
| 4. Execution | 1/1 | Planned | - |
| 5. CSV Import | 1/1 | Planned | - |

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| GWT-01 | Phase 1 |
| GWT-02 | Phase 1 |
| GWT-03 | Phase 1 |
| GWT-04 | Phase 1 |
| GWT-05 | Phase 1 |
| GWT-06 | Phase 1 |
| GWT-07 | Phase 2 |
| GWT-08 | Phase 2 |
| GWT-09 | Phase 2 |
| GWT-10 | Phase 3 |
| GWT-11 | Phase 3 |
| GWT-12 | Phase 3 |
| GWT-13 | Phase 3 |
| GWT-14 | Phase 3 |
| GWT-15 | Phase 3 |
| GWT-16 | Phase 4 |
| GWT-17 | Phase 4 |
| GWT-18 | Phase 4 |
| GWT-19 | Phase 5 |
| GWT-20 | Phase 5 |
| GWT-21 | Phase 5 |
| GWT-22 | Phase 5 |

**Total: 22/22 requirements mapped. No orphans.**

---
*Roadmap created: 2026-03-13*
