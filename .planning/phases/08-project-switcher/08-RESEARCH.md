# Phase 1 Research: Sidebar Project Switcher

## Codebase Analysis

### Sidebar Component
**File:** `apps/web/src/components/layout/sidebar.tsx`

**Workspace Pill (lines 122-135):**
- Renders inside `{!collapsed && (...)}` block
- Shows workspace slug initials (2-char badge) + slug text + ChevronDown icon
- ChevronDown is purely decorative — no click handler attached
- Wrapped in `div.px-3.py-3` → inner `div.flex.items-center.gap-2.rounded-lg.bg-gray-100.px-3.py-2`

**Props:** `{ slug: string; projectKey?: string }`

**State Management:**
- Collapsed state: `useSyncExternalStore` with `localStorage.getItem("velo:sidebar-collapsed")`
- Project key: `useSyncExternalStore` with `localStorage.getItem("velo:last-project-key")`
- Effective project key: `projectKey ?? storedProjectKey ?? undefined` (line 80)
- Roles: `useUserRole()` → `{ role, canEdit, isAdmin }` (line 57)

**Existing Dropdown Pattern (UserMenu, lines 286-380):**
- `useState(false)` for open/close
- `useRef<HTMLDivElement>(null)` for click-outside container
- Click-outside: `mousedown` listener checking `menuRef.current.contains()`
- Positioned: `absolute bottom-full left-2 right-2 mb-1`
- Styled: `rounded-lg border border-gray-200 bg-white py-1 shadow-card`
- Items: `.flex.w-full.items-center.gap-2.px-3.py-2.text-sm.text-gray-700.hover:bg-gray-50.transition-colors`
- NO Escape key handler (gap to fill)

### Project API
**File:** `apps/api/src/routes/workspaces.ts`

**GET list:** `/api/workspaces/:workspaceId/projects` (lines 310-332)
- Returns: `Array<{ id, name, project_key, description, created_at }>`
- Ordered by `created_at ASC`, excludes soft-deleted
- No role restriction on listing (all members see all projects)

**Frontend call pattern:** `fetch("/api/backend/workspaces/{workspaceId}/projects")`

### URL Routing
- `/app/[slug]/` → auto-redirects to first project's `/cases` page
- `/app/[slug]/[projectKey]/cases` → test cases (main landing)
- `/app/[slug]/[projectKey]/runs` → test runs
- `/app/[slug]/[projectKey]/settings` → project settings

### localStorage
- `velo:last-project-key` — already read via `useSyncExternalStore` in sidebar
- Written on every render when `projectKey` is truthy (line 76-78)

### Role Checks
- `useUserRole()` hook returns `{ role, canEdit, isAdmin }`
- `canEdit` = admin or editor (used for gating create/edit actions)
- Pattern: conditional render based on `canEdit` / `isAdmin`

### Session Data
- `session.user.workspace_id` — needed to construct API URLs
- `session.user.workspace_slug` — matches `slug` prop
- Available via `useSession()` from next-auth/react

## Implementation Implications

1. **Single new component:** `ProjectSwitcher` — a dropdown rendered inside the workspace pill area
2. **Data fetching:** New `useProjects(workspaceId)` hook using `useSWR` or inline `useEffect` + `useState`
3. **Reuse UserMenu pattern** for dropdown behavior (open/close, click-outside, positioning)
4. **Add Escape key handler** (missing from UserMenu pattern but required by success criteria)
5. **Collapsed sidebar:** When collapsed, pill still clickable — dropdown needs absolute positioning that works without the pill text
6. **No new API work** — all endpoints already exist
7. **No new UI primitives needed** — inline dropdown following UserMenu pattern

## Risks

- **SWR dependency:** Check if SWR is already in the project, or use raw fetch + useState
- **Collapsed positioning:** Dropdown from collapsed sidebar needs careful absolute/fixed positioning to not clip
- **Re-render on navigation:** After clicking a project, sidebar re-renders with new projectKey — ensure dropdown closes

---
*Research completed: 2026-03-13*
