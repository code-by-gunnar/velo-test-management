# Research: Phase 2 — Format Selection

## Findings

### Backend State (Phase 1 Complete)
- `test_format` column exists on projects table: `VARCHAR(10) NOT NULL DEFAULT 'steps'`
- POST `/api/workspaces/:id/projects` already accepts `test_format` (enum: `['steps', 'gwt']`)
- GET endpoints already return `test_format` in project responses
- PATCH endpoint naturally excludes `test_format` (immutable after creation)
- **No backend work needed for Phase 2.**

### Frontend State (Current)
1. **Onboarding** (`apps/web/src/pages/onboarding/index.tsx`)
   - 3-step wizard: workspace → project → sample-data
   - Project step (line 72-87): passes `{ name, project_key }` — no `test_format`
   - Format picker should go between project name/key fields and the Continue button

2. **CreateProjectModal** (`apps/web/src/components/projects/CreateProjectModal.tsx`)
   - Modal with name + project_key fields
   - Submit (line 94): `JSON.stringify({ name, project_key })` — no `test_format`
   - Format picker should go after the project key field

3. **Project Settings** (`apps/web/src/pages/app/[slug]/[projectKey]/settings.tsx`)
   - General tab has name, key, IDs, delete section
   - `getServerSideProps` fetches project but only destructures `{ id, name }` (line 368)
   - Need to: fetch `test_format`, pass as prop, display as read-only badge

### Design System
- No existing Select/RadioGroup component — need a lightweight visual card selector
- Available tokens: `primary-selected` (#EBF3FF), `primary` (#2D7FF9) for selected state
- Cards: `border-gray-200`, `rounded-md`, `shadow-card`
- Button size: `sm` default (in-app)

### Format Picker Design Pattern
A binary card selector (two clickable cards side-by-side) is the best UX for this:
- Each card shows format name + mini preview of what steps look like
- Selected card gets `border-primary bg-primary-selected` treatment
- Unselected card gets `border-gray-200 bg-white` + hover state
- No need for a generic Select component — this is a one-off visual choice

### Risks
- None significant. Backend is ready, UI changes are additive.
- Only consideration: onboarding wizard step count stays at 3 (format picker is within the project step, NOT a separate step). Adding a 4th step would slow onboarding.

---
*Researched: 2026-03-13*
