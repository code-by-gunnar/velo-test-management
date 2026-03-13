# Phase 2 Context: Create Project Modal

## Phase Goal
Users can create new projects from within the app (not just onboarding), with free tier limit communicated clearly.

## Requirements
- **PCR-01**: "+ New project" opens a modal with name and project key fields
- **PCR-02**: Project key is auto-generated from name (slugified, lowercase) and editable before submission
- **PCR-03**: Free tier users see an upsell message instead of the creation form when they already have 1 project
- **PCR-04**: After successful creation, user is navigated to the new project's test cases page

## Success Criteria
1. Clicking "+ New project" in the switcher dropdown opens a modal with name and project key fields
2. Project key auto-generates from name (e.g., "Mobile App" -> "mobile-app") and is editable before submission
3. Modal calls `POST /api/workspaces/:id/projects` — on 201 success, navigates to the new project's cases page
4. When API returns 403 with `code: "TIER_LIMIT_EXCEEDED"`, modal shows upsell message instead of creation form
5. Modal validates: name required, project key required + lowercase alphanumeric + hyphens only, handles 409 duplicate key error inline

## Key Files
- `apps/web/src/components/layout/sidebar.tsx` — wire "+ New project" button to modal
- `apps/web/src/components/runs/RunCreateModal.tsx` — modal pattern reference
- `apps/web/src/components/ui/input.tsx` — Input + FormField components
- `apps/web/src/components/ui/button.tsx` — Button component
- `apps/web/src/pages/onboarding/index.tsx` — slug generation reference
- `apps/api/src/routes/workspaces.ts` — POST endpoint (no changes needed)

## Constraints
- No API changes — backend already handles everything
- Must follow RunCreateModal pattern for consistency
- All fetches through `/api/backend/` gateway
- Follow Clean Elevation design tokens

---
*Context created: 2026-03-13*
