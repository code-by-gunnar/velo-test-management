# Phase 1 Context: Sidebar Project Switcher

## Phase Goal
Users can see which project they're in and switch between projects from the sidebar.

## Requirements
- **PSW-01**: Clicking the workspace pill opens a dropdown listing all projects
- **PSW-02**: Current project is visually highlighted in the dropdown
- **PSW-03**: Clicking a project navigates to that project's test cases page
- **PSW-04**: Dropdown shows a "+ New project" action for editors/admins

## Success Criteria
1. Clicking workspace pill opens dropdown listing projects from `GET /api/workspaces/:id/projects`
2. Current project (matching URL's `projectKey`) highlighted with `bg-primary-selected text-primary`
3. Clicking different project navigates to `/app/{slug}/{projectKey}/cases` and updates `velo:last-project-key`
4. "+ New project" row at bottom for editors/admins (disabled/hidden for viewers)
5. Dropdown closes on outside click and Escape key
6. When sidebar is collapsed, pill is still clickable and dropdown positioned correctly

## Key Files
- `apps/web/src/components/layout/sidebar.tsx` — main file to modify (workspace pill lines 122-135, UserMenu pattern lines 286-380)
- `apps/web/src/hooks/useUserRole.ts` — role checks (`canEdit`, `isAdmin`)
- `apps/web/src/pages/api/backend/[...path].ts` — API gateway (no changes needed)
- `apps/api/src/routes/workspaces.ts` — project endpoints (no changes needed)

## Constraints
- No new API endpoints needed — all backend CRUD exists
- Must follow Clean Elevation design tokens (no hardcoded hex)
- Must follow existing UserMenu dropdown pattern for consistency
- All fetches go through `/api/backend/...` gateway

---
*Context created: 2026-03-13*
