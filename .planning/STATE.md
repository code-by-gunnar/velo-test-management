---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: GWT / BDD Test Cases
status: in_progress
stopped_at: Completed 11-01-PLAN.md — GWT Schema & API Foundation
last_updated: "2026-03-13T18:15:44.076Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 1
  percent: 20
---

# Project State

## Milestones

### v1.0 -- Core Platform (48 requirements, 6 phases)
**Status:** Milestone complete

### UI Redesign -- "Clean Elevation" (38 requirements, 4 phases)
**Status:** COMPLETE (38/38 satisfied, merged to master 2026-03-11)

### v1.1 -- GDPR & Data Lifecycle (20 requirements, 4 phases)
**Status:** COMPLETE (20/20 satisfied, completed 2026-03-12)

### v1.2 -- Social Auth (15 requirements, 4 phases)
**Status:** COMPLETE (15/15 satisfied, completed 2026-03-13)

### v1.3 -- Project Management (11 requirements, 3 phases)
**Status:** COMPLETE (11/11 satisfied, completed 2026-03-13)

### Post-Milestone Additions (on master)
- CSV import with suite auto-creation from area column
- Suite management: right-click context menu (rename/delete), bulk delete with select mode
- requireAdmin middleware + admin-only delete test run endpoint
- Deleted test case handling in execution screen
- Auto-resize step textareas, whitespace-pre-wrap in view mode
- Calm gray confirmation pattern (no red/blue destructive styling)
- User profile management: name edit, OTP-verified email change, R2 avatar upload
- Sidebar popover menu (profile + sign out)
- Landing page redesign (comparison table, feature cards, how-it-works)
- WCAG accessibility pass (prefers-reduced-motion, focus-visible rings)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Ship a focused, keyboard-first test management tool that startups actually want to use
**Current focus:** v1.4 GWT / BDD Test Cases — Phase 1: Schema & API

## Current Position

Phase: 11 (GWT Schema)
Plan: 11-01 COMPLETE
Status: Plan 11-01 executed — GWT schema & API foundation complete

```
Progress: [X] Phase 11 Plan 1  [ ] Plan 2  [ ] Plan 3  [ ] Plan 4  [ ] Plan 5
          |___________|___________|___________|___________|___________|
          20%                                                         100%
```

## Accumulated Context

### Decisions

- test_format is project-level, locked at creation
- Full keyword set: Given, When, Then, And, But
- Auto-suggest keywords with overridable pill dropdown
- GWT execution is whole-scenario pass/fail
- Preconditions field retained in GWT mode
- CSV import supports keyword column (case-insensitive)
- [Phase 11]: Migration journal 'when' timestamp must be greater than the last applied migration's created_at — Drizzle skips entries where when <= last DB created_at

### Critical Implementation Notes

- **Backwards-compatible:** step_type defaults to 'action', test_format defaults to 'steps'
- **Current step schema:** test_case_steps has id, test_case_id, step_order, action, expected_result, created_at
- **GWT steps:** Reuse action field for step text, add step_type for keyword. expected_result stays in schema but unused in GWT mode
- **Execution model change:** GWT cases need case-level status only (no run_item_steps or per-step tracking)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-13T18:15:44.072Z
Stopped at: Completed 11-01-PLAN.md — GWT Schema & API Foundation
Resume file: None
Next action: /gsd:plan-phase 1
