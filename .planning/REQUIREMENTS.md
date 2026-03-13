# Requirements: Velo v1.3 Project Management

**Defined:** 2026-03-13
**Core Value:** Ship a focused, keyboard-first test management tool that startups actually want to use — no Jira complexity, no enterprise bloat.

## v1.3 Requirements

Surface projects as a first-class concept in the UI. Users can see which project they're in, switch between projects, create new ones, and manage existing ones. Backend CRUD already exists — this is entirely frontend work plus tier limit upsell.

### Project Switcher

- [ ] **PSW-01**: Clicking the workspace pill in the sidebar opens a dropdown listing all projects in the workspace
- [ ] **PSW-02**: Current project is visually highlighted in the dropdown
- [ ] **PSW-03**: Clicking a project in the dropdown navigates to that project's test cases page
- [ ] **PSW-04**: Dropdown shows a "+ New project" action for editors/admins

### Project Creation

- [ ] **PCR-01**: "+ New project" opens a modal with name and project key fields
- [ ] **PCR-02**: Project key is auto-generated from name (slugified, lowercase) and editable before submission
- [ ] **PCR-03**: Free tier users see an upsell message instead of the creation form when they already have 1 project
- [ ] **PCR-04**: After successful creation, user is navigated to the new project's test cases page

### Project Settings

- [ ] **PST-01**: Project settings General tab shows an editable project name field (calls PATCH endpoint)
- [ ] **PST-02**: Project settings General tab has a "Delete project" section with calm confirmation
- [ ] **PST-03**: Deletion is blocked with a message when the project is the last one in the workspace

## Out of Scope

| Feature | Reason |
|---------|--------|
| Edit project key | Set once at creation — changing would break URLs, CI integrations, bookmarks |
| Project descriptions | Low value for v1.3 — can add later if users request |
| Workspace switching | Single workspace per user for now |
| Dark mode | Deferred to future milestone |
| Project archiving (separate from delete) | Soft delete covers this need |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PSW-01 | Phase 1 | Pending |
| PSW-02 | Phase 1 | Pending |
| PSW-03 | Phase 1 | Pending |
| PSW-04 | Phase 1 | Pending |
| PCR-01 | Phase 2 | Pending |
| PCR-02 | Phase 2 | Pending |
| PCR-03 | Phase 2 | Pending |
| PCR-04 | Phase 2 | Pending |
| PST-01 | Phase 3 | Pending |
| PST-02 | Phase 3 | Pending |
| PST-03 | Phase 3 | Pending |

**Coverage:**
- v1.3 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
