# Requirements: Velo v1.4 GWT / BDD Test Cases

**Defined:** 2026-03-13
**Core Value:** Ship a focused, keyboard-first test management tool that startups actually want to use — no Jira complexity, no enterprise bloat.

## v1.4 Requirements

Add native Given-When-Then (BDD) test case format as a project-level setting. Projects choose their format at creation (locked after). GWT projects get a dedicated step editor with auto-suggested keywords, scenario-level pass/fail execution, and CSV import with keyword column support. Traditional step format remains the default.

### Schema & API

- [ ] **GWT-01**: Projects table has a `test_format` column (`'steps'` default, `'gwt'`) set at creation and immutable after
- [ ] **GWT-02**: `test_case_steps` table has a `step_type` column (`'action'` default for traditional; `'given'`, `'when'`, `'then'`, `'and'`, `'but'` for GWT)
- [ ] **GWT-03**: POST/PUT test case endpoints accept `step_type` on each step object; default to `'action'` when omitted (backwards-compatible)
- [ ] **GWT-04**: GET test case detail returns `step_type` on each step in the aggregated steps array
- [ ] **GWT-05**: Project creation endpoint accepts `test_format`; defaults to `'steps'` when omitted
- [ ] **GWT-06**: Project GET endpoints return `test_format` in the response

### Format Selection

- [ ] **GWT-07**: Onboarding flow includes a format picker step showing two visual cards with mini previews — "Traditional Steps" (Action / Expected Result columns) and "Given-When-Then" (keyword-prefixed steps)
- [ ] **GWT-08**: Create Project modal includes the same format picker (defaults to workspace's most recent project format or 'steps')
- [ ] **GWT-09**: Project settings General tab displays the chosen format as read-only (not editable after creation)

### GWT Step Editor

- [ ] **GWT-10**: When a project's `test_format` is `'gwt'`, the CasePanel renders a GWT step editor instead of the traditional two-column editor
- [ ] **GWT-11**: Each GWT step has a keyword pill (Given/When/Then/And/But) on the left and a single text field on the right — no expected_result column
- [ ] **GWT-12**: Keywords auto-suggest: first step defaults to Given, after Given suggests When, after When suggests Then, after Then suggests Then. User can override by clicking the pill
- [ ] **GWT-13**: Keyword pill is a clickable dropdown showing all five keywords (Given, When, Then, And, But) with the current one highlighted
- [ ] **GWT-14**: Preconditions field remains available in GWT mode (above the step editor)
- [ ] **GWT-15**: Keyboard navigation matches traditional editor — Tab from keyword pill to text field, Enter/Tab at end of text adds new step, Backspace on empty deletes step

### Execution

- [ ] **GWT-16**: In GWT projects, test run execution shows the full scenario (all steps) but pass/fail is set at the case level, not per-step
- [ ] **GWT-17**: Execution screen for GWT cases shows steps as read-only with keyword labels, plus a single status dropdown (Pass/Fail/Blocked/Skipped) for the whole scenario
- [ ] **GWT-18**: Run dashboard and results display work identically for GWT and traditional cases (case-level counts)

### CSV Import

- [ ] **GWT-19**: CSV import for GWT projects adds a `colKeyword` query param for mapping the keyword column
- [ ] **GWT-20**: When `colKeyword` is mapped, each imported row creates a step with the corresponding `step_type` value
- [ ] **GWT-21**: Keyword column values are case-insensitive and trimmed (`"given"`, `"Given"`, `" GIVEN "` all map to `'given'`)
- [ ] **GWT-22**: If `colKeyword` is not mapped in a GWT project, all imported steps default to `step_type: 'given'`

## Out of Scope

| Feature | Reason |
|---------|--------|
| Format switching after creation | Migration complexity, data integrity risk — locked at creation |
| Per-step pass/fail in GWT mode | BDD scenarios pass/fail as a unit — step-level status doesn't match the mental model |
| Scenario Outline / parameterized | V2 feature — table-driven scenarios add significant complexity |
| Feature file import (.feature) | V2 feature — Gherkin file parsing is a separate concern |
| Background section | Can be expressed as Given steps or preconditions field |
| Tags / @annotations | V2 feature — would need a tag system across the app |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GWT-01 | Phase 1 | Pending |
| GWT-02 | Phase 1 | Pending |
| GWT-03 | Phase 1 | Pending |
| GWT-04 | Phase 1 | Pending |
| GWT-05 | Phase 1 | Pending |
| GWT-06 | Phase 1 | Pending |
| GWT-07 | Phase 2 | Pending |
| GWT-08 | Phase 2 | Pending |
| GWT-09 | Phase 2 | Pending |
| GWT-10 | Phase 3 | Pending |
| GWT-11 | Phase 3 | Pending |
| GWT-12 | Phase 3 | Pending |
| GWT-13 | Phase 3 | Pending |
| GWT-14 | Phase 3 | Pending |
| GWT-15 | Phase 3 | Pending |
| GWT-16 | Phase 4 | Pending |
| GWT-17 | Phase 4 | Pending |
| GWT-18 | Phase 4 | Pending |
| GWT-19 | Phase 5 | Pending |
| GWT-20 | Phase 5 | Pending |
| GWT-21 | Phase 5 | Pending |
| GWT-22 | Phase 5 | Pending |

**Coverage:**
- v1.4 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
