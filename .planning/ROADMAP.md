# Roadmap: v1.3 Project Management

## Overview

Surface projects as a first-class UI concept. The backend already has full CRUD (create, list, get-by-key, update, soft-delete) in `workspaces.ts`. This milestone adds the frontend: a project switcher dropdown in the sidebar, a create-project modal with tier upsell, and project settings (rename + delete). Three phases, all frontend-only.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Phase directories use global numbering (08-project-switcher, 09-create-project, 10-project-settings) to avoid collision with prior milestones

- [ ] **Phase 1: Sidebar Project Switcher** - Wire the existing workspace pill dropdown to show projects, highlight current, navigate on click
- [ ] **Phase 2: Create Project Modal** - Modal with name/key fields, auto-slug, free tier upsell, post-creation navigation
- [ ] **Phase 3: Project Settings** - Editable project name, delete with calm confirmation, last-project guard

## Phase Details

### Phase 1: Sidebar Project Switcher
**Goal**: Users can see which project they're in and switch between projects from the sidebar
**Depends on**: Nothing (first phase)
**Requirements**: PSW-01, PSW-02, PSW-03, PSW-04
**Success Criteria** (what must be TRUE):
  1. Clicking the workspace pill in the sidebar opens a dropdown listing all projects fetched from `GET /api/workspaces/:id/projects`
  2. The current project (matching the URL's `projectKey`) is visually highlighted with `bg-primary-selected text-primary`
  3. Clicking a different project navigates to `/app/{slug}/{projectKey}/cases` and updates localStorage `velo:last-project-key`
  4. The dropdown shows a "+ New project" row at the bottom for editors/admins (disabled/hidden for viewers)
  5. The dropdown closes on outside click and on Escape key
  6. When sidebar is collapsed, the pill is still clickable and the dropdown still works (positioned correctly)
**Plans:** 08-01 (Project Switcher Dropdown)

### Phase 2: Create Project Modal
**Goal**: Users can create new projects from within the app (not just onboarding), with free tier limit communicated clearly
**Depends on**: Phase 1 (the "+ New project" trigger)
**Requirements**: PCR-01, PCR-02, PCR-03, PCR-04
**Success Criteria** (what must be TRUE):
  1. Clicking "+ New project" in the switcher dropdown opens a modal with name and project key fields
  2. Project key auto-generates from name (e.g., "Mobile App" → "mobile-app") and is editable before submission
  3. Modal calls `POST /api/workspaces/:id/projects` — on 201 success, navigates to the new project's cases page
  4. When the API returns 403 with `code: "TIER_LIMIT_EXCEEDED"`, the modal shows an upsell message (e.g., "Free plan allows 1 project. Upgrade to Starter to add more.") instead of the creation form
  5. Modal validates: name required, project key required + lowercase alphanumeric + hyphens only, handles 409 duplicate key error inline
**Plans:** 09-01 (Create Project Modal)

### Phase 3: Project Settings
**Goal**: Users can rename projects and delete projects they no longer need, with guardrails
**Depends on**: Phase 1 (navigation to settings), Phase 2 (multiple projects exist to test delete)
**Requirements**: PST-01, PST-02, PST-03
**Success Criteria** (what must be TRUE):
  1. Project settings General tab shows the project name in an editable field — on save, calls `PATCH /api/workspaces/:id/projects/:projectId` with `{ name }`
  2. Below the name field, a "Delete project" section with calm gray confirmation (matching Clean Elevation pattern)
  3. Delete calls `DELETE /api/workspaces/:id/projects/:projectId` — on 204, navigates to workspace root (which redirects to remaining project)
  4. If the project is the last one in the workspace, the delete button is disabled with text explaining "You need at least one project" — verified by checking project count from the list endpoint
  5. Project key and IDs remain displayed as read-only (existing behavior preserved)
**Plans:** 10-01 (Project Settings — Rename + Delete)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Sidebar Project Switcher | 1/1 | Complete | 2026-03-13 |
| 2. Create Project Modal | 1/1 | Complete | 2026-03-13 |
| 3. Project Settings | 1/1 | Complete | 2026-03-13 |

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| PSW-01 | Phase 1 |
| PSW-02 | Phase 1 |
| PSW-03 | Phase 1 |
| PSW-04 | Phase 1 |
| PCR-01 | Phase 2 |
| PCR-02 | Phase 2 |
| PCR-03 | Phase 2 |
| PCR-04 | Phase 2 |
| PST-01 | Phase 3 |
| PST-02 | Phase 3 |
| PST-03 | Phase 3 |

**Total: 11/11 requirements mapped. No orphans.**

---
*Roadmap created: 2026-03-13*
