# Phase 2 Research: Create Project Modal

## Codebase Analysis

### Existing Modal Patterns
Two modal implementations exist:

**RunCreateModal** (`apps/web/src/components/runs/RunCreateModal.tsx`):
- Backdrop: `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4`
- Inner: `relative w-full max-w-lg rounded-xl bg-white shadow-2xl`
- Click-outside: `if (e.target === e.currentTarget) onClose()`
- Escape key handler, auto-focus on first input
- Loading state on submit button
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`

**ImportModal** (`apps/web/src/components/cases/ImportModal.tsx`):
- Same backdrop pattern, multi-step flow

### POST Create Project Endpoint
**File:** `apps/api/src/routes/workspaces.ts` (lines 166-239)

**Request:** `POST /api/workspaces/:workspaceId/projects`
```json
{ "name": "1-255 chars", "project_key": "1-20 chars, ^[a-z0-9-]+$", "description?": "max 2000" }
```

**Responses:**
- 201: `{ id, workspace_id, name, project_key, description }`
- 403 (viewer): `{ error: "Viewers cannot create projects" }`
- 403 (tier): `{ error: "Free tier allows 1 project...", code: "TIER_LIMIT_EXCEEDED", limit: "max_projects" }`
- 409: `{ error: "Project key already used in this workspace", field: "project_key" }`

### ProjectSwitcher "+ New project" Button
**File:** `sidebar.tsx` lines 476-483
- Currently just calls `setOpen(false)` — placeholder
- Visible only when `canEdit === true`
- Needs an `onNewProjectClick` callback

### Onboarding Slug Generation
**File:** `apps/web/src/pages/onboarding/index.tsx` (lines 40-43)
```typescript
const key = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)
```
- Strips hyphens too — should improve to preserve word boundaries as hyphens
- Better: `name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").slice(0, 20)`

### UI Components
- **Button**: variants `primary | secondary | destructive | ghost`, sizes `sm | md | lg | icon`
- **Input**: `error` prop for red border, standard HTML input attrs
- **FormField**: label + children + error message wrapper
- **Toast**: `useToast()` → `toast(type, message)` — available for success notification

## Implementation Implications

1. New file: `apps/web/src/components/projects/CreateProjectModal.tsx` (follows RunCreateModal pattern)
2. Modify `sidebar.tsx`: Add `onNewProjectClick` callback to ProjectSwitcher, wire to modal state
3. Improved slug generation that preserves hyphens from word boundaries
4. Three error states: tier limit (show upsell), duplicate key (inline field error), generic (banner)
5. After creation: refresh project list, navigate to new project, close modal

---
*Research completed: 2026-03-13*
