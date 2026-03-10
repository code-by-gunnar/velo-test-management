---
phase: 06-team-and-access-control
plan: "04"
subsystem: web-frontend
tags: [team-management, settings, invite-acceptance, rbac-ui]
dependency_graph:
  requires: [06-03]
  provides: [team-settings-ui, accept-invite-page]
  affects: [apps/web]
tech_stack:
  added: []
  patterns:
    - Promise chain pattern for fetch inside useEffect (avoids react-hooks/set-state-in-effect)
    - useRef guard for one-shot effect (startedRef prevents double-invoke in React 18 strict mode)
    - exactOptionalPropertyTypes compliance: optional props typed as T | undefined explicitly
key_files:
  created:
    - apps/web/src/components/settings/TeamPanel.tsx
    - apps/web/src/pages/app/[slug]/accept-invite.tsx
  modified:
    - apps/web/src/pages/app/[slug]/settings.tsx
decisions:
  - Promise chain (.then/.catch) instead of async/await in useCallback for acceptInvite — avoids react-hooks/set-state-in-effect since setState is called in the callback, not the effect body
  - useRef(false) startedRef guards acceptInvite from double-invoke in React 18 strict mode
  - userId passed as optional prop to TeamPanel so current user row hides its own Deactivate button
  - Role dropdown per member row (admin view) vs RoleBadge (non-admin view) inline — no modal needed
  - Confirm-in-row deactivation flow (not a modal) — consistent with the lean UI philosophy
metrics:
  duration_minutes: 12
  completed_date: "2026-03-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 6 Plan 04: Team Management Frontend Summary

**One-liner:** Admin-facing TeamPanel with member list, invite form, role dropdown, and deactivation; plus accept-invite landing page for invitation token processing.

## What Was Built

### TeamPanel component (`apps/web/src/components/settings/TeamPanel.tsx`)

Full team management UI panel with three sections:

1. **Invite form** (admin-only): email input + role select (admin/editor/viewer) + Send Invite button. Returns user-friendly copy on `TIER_LIMIT_EXCEEDED` code. Refreshes pending invitations after success.

2. **Pending invitations** (admin-only, shown when invites exist): table of email/role/expires_at with per-row Resend button that re-POSTs the invitation.

3. **Members list**: table showing all active members. Admin sees role as a `<select>` dropdown that fires PATCH on change; non-admin sees a `RoleBadge`. Deactivate button shows inline confirmation ("Confirm? / Yes, remove / Cancel") before firing PATCH deactivate. Current user's row hides the Deactivate button.

### Settings page update (`apps/web/src/pages/app/[slug]/settings.tsx`)

- Added `"team"` tab between General and API Keys in TABS array
- `getServerSideProps` now extracts `session.user.role` and `session.user.id` and passes them as `userRole` and `userId` props
- TeamPanel rendered for `activeTab === "team"` with workspaceId, userRole, userId

### Accept-invite page (`apps/web/src/pages/app/[slug]/accept-invite.tsx`)

- `getServerSideProps`: requires auth — redirects to `/login?next=...` if unauthenticated; redirects to `/app/slug` if token query param missing
- Client-side: auto-POSTs `invitations/accept` with token on mount using a `useRef` guard to prevent double-invoke
- Loading / success / error states rendered inline
- Success redirects to `/app/slug` after 2 seconds
- Error shows inline message with a `<Link>` back to `/login`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] exactOptionalPropertyTypes for optional userId prop**
- Found during: Task 1 (tsc verification)
- Issue: `userId?: string` rejected under `exactOptionalPropertyTypes: true` — type must be `string | undefined`
- Fix: Changed TeamPanel `userId` prop type to `userId?: string | undefined`
- Files modified: apps/web/src/components/settings/TeamPanel.tsx
- Commit: f89241d

**2. [Rule 1 - Bug] ESLint react-hooks/set-state-in-effect on acceptInvite**
- Found during: Task 2 (eslint verification)
- Issue: `void acceptInvite()` inside `useEffect` called an async function that called `setState` — rule flagged it even via useCallback indirection
- Fix: Rewrote `acceptInvite` to accept `onSuccess` / `onError` callbacks; setState calls happen in the callback not the async function body, so they execute outside the effect
- Files modified: apps/web/src/pages/app/[slug]/accept-invite.tsx
- Commit: 93a2c64

**3. [Rule 2 - Missing] next/link for internal navigation**
- Found during: Task 2 (eslint verification)
- Issue: `<a href="/login">` flagged by `@next/next/no-html-link-for-pages`
- Fix: Replaced with `<Link href="/login">` from next/link
- Files modified: apps/web/src/pages/app/[slug]/accept-invite.tsx
- Commit: 93a2c64

## Verification Results

- `pnpm --recursive typecheck`: PASSED
- `pnpm --recursive lint`: PASSED (0 warnings, 0 errors)

## Self-Check: PASSED

- apps/web/src/components/settings/TeamPanel.tsx — FOUND
- apps/web/src/pages/app/[slug]/accept-invite.tsx — FOUND
- commit f89241d — FOUND
- commit 93a2c64 — FOUND
