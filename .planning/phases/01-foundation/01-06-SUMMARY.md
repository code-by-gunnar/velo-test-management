---
phase: 01-foundation
plan: "06"
subsystem: ui
tags: [tailwind, css-variables, design-tokens, react, next-auth, cva, clsx, onboarding]

# Dependency graph
requires:
  - phase: 01-foundation-04
    provides: Auth.js v5 pages and session — wizard uses useSession().update() and getServerSideProps auth()
  - phase: 01-foundation-05
    provides: Workspace and project API routes — wizard calls POST /api/workspaces and POST /api/workspaces/:id/projects
provides:
  - CSS custom property design token system (colours, spacing, radius, shadows, typography)
  - Tailwind config extended with design token colour aliases (cobalt, mist, pass/fail/blocked/skipped)
  - next/font: Inter (UI) + JetBrains Mono loaded as CSS variables
  - Base component library: Button (4 variants x 4 sizes), Card/CardHeader/CardTitle, Input/Label/FormField, StatusBadge
  - Collapsible sidebar: 240px/48px, localStorage persistence, disabled Phase 2/3 nav items with tooltips
  - AppLayout wrapper component
  - Onboarding wizard: 3-step workspace -> project -> sample data with JWT refresh after workspace creation
  - Home dashboard shell: /app/[slug] with placeholder panels (Recent Runs, Coverage, Activity)
  - Page stubs: /app/[slug]/settings, /app/[slug]/[projectKey]
affects: [02-test-cases, 03-test-runs, 04-ci-ingestion, 05-integrations, 06-team-access]

# Tech tracking
tech-stack:
  added:
    - class-variance-authority (CVA) — variant management for Button
    - clsx — conditional className utility
  patterns:
    - Design tokens as CSS custom properties in globals.css, mirrored as Tailwind colour aliases
    - CVA for multi-variant component styling
    - AppLayout wrapping every authenticated page
    - getServerSideProps + auth() for server-side auth guard on all app pages
    - session.update() called after workspace creation to refresh JWT and prevent redirect loop

key-files:
  created:
    - apps/web/src/styles/globals.css
    - apps/web/src/components/ui/button.tsx
    - apps/web/src/components/ui/card.tsx
    - apps/web/src/components/ui/input.tsx
    - apps/web/src/components/ui/status-badge.tsx
    - apps/web/src/components/ui/index.ts
    - apps/web/src/components/layout/sidebar.tsx
    - apps/web/src/components/layout/app-layout.tsx
    - apps/web/src/pages/onboarding/index.tsx
    - apps/web/src/pages/app/[slug]/index.tsx
    - apps/web/src/pages/app/[slug]/settings.tsx
    - apps/web/src/pages/app/[slug]/[projectKey]/index.tsx
  modified:
    - apps/web/tailwind.config.ts
    - apps/web/src/pages/_app.tsx
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "CVA (class-variance-authority) for Button variant management — avoids manual className string concatenation"
  - "Design tokens defined as both CSS custom properties and Tailwind aliases — CSS vars for non-Tailwind use cases, aliases for Tailwind utility classes"
  - "Sidebar disabled items remain visible (greyed) rather than hidden — product decision for discoverability of upcoming features"
  - "session.update({ workspace_id, workspace_slug }) called immediately after workspace creation to prevent onboarding redirect loop"

patterns-established:
  - "All authenticated pages use getServerSideProps + auth() for auth guard"
  - "AppLayout wraps all app pages providing sidebar + main layout"
  - "Design token colours accessed via Tailwind class names (bg-cobalt, text-fail-text etc)"
  - "UI component barrel export from components/ui/index.ts"

requirements-completed: [DS-01, DS-02, DS-03, DS-04]

# Metrics
duration: 25min
completed: 2026-03-08
---

# Phase 1 Plan 6: Design System + Onboarding Summary

**CSS design token system, CVA-based component library (Button/Card/Input/StatusBadge), collapsible sidebar with localStorage persistence, 3-step onboarding wizard with JWT refresh, and dashboard shell completing Phase 1 Foundation**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-08T22:30:00Z
- **Completed:** 2026-03-08T22:55:00Z
- **Tasks:** 4
- **Files modified:** 12 created, 4 modified

## Accomplishments

- CSS custom property design token system covering colours (cobalt, mist, status colours), spacing, radius, shadows and typography — mirrored as Tailwind aliases
- Base component library with Button (4 variants x 4 sizes via CVA), Card family, Input/Label/FormField, and StatusBadge (5 statuses)
- Collapsible sidebar with 240px/48px toggle, localStorage persistence across page reloads, disabled Phase 2/3 nav items visible with tooltips
- Onboarding wizard: workspace -> project -> sample data with session.update() JWT refresh after workspace creation to prevent infinite redirect loop
- Home dashboard shell, settings stub, and project home stub — all auth-gated

## Task Commits

Each task was committed atomically:

1. **Task 1: Design tokens, typography, Tailwind config** - `18efeb5` (feat)
2. **Task 2: Base component library** - `ddd7838` (feat)
3. **Task 3: Collapsible sidebar and AppLayout** - `c7c5d44` (feat)
4. **Task 4: Onboarding wizard, dashboard shell, page stubs** - `6719119` (feat)

**Plan metadata:** (docs commit — this summary)

## Files Created/Modified

- `apps/web/src/styles/globals.css` — Full CSS custom property design token system
- `apps/web/tailwind.config.ts` — Extended with cobalt/mist/status colour aliases and font families
- `apps/web/src/pages/_app.tsx` — Inter + JetBrains Mono loaded via next/font with CSS variable injection
- `apps/web/src/components/ui/button.tsx` — CVA-based Button with 4 variants and 4 sizes
- `apps/web/src/components/ui/card.tsx` — Card, CardHeader, CardTitle
- `apps/web/src/components/ui/input.tsx` — Input, Label, FormField with error state
- `apps/web/src/components/ui/status-badge.tsx` — StatusBadge for pass/fail/blocked/skipped/untested
- `apps/web/src/components/ui/index.ts` — Barrel export
- `apps/web/src/components/layout/sidebar.tsx` — Collapsible sidebar with localStorage, disabled nav items
- `apps/web/src/components/layout/app-layout.tsx` — AppLayout shell wrapping sidebar + main
- `apps/web/src/pages/onboarding/index.tsx` — 3-step onboarding wizard
- `apps/web/src/pages/app/[slug]/index.tsx` — Home dashboard shell with placeholder panels
- `apps/web/src/pages/app/[slug]/settings.tsx` — Settings page stub
- `apps/web/src/pages/app/[slug]/[projectKey]/index.tsx` — Project home stub

## Decisions Made

- Used CVA (class-variance-authority) for Button variant management rather than manual className concatenation — cleaner and type-safe
- Design tokens defined as both CSS custom properties AND Tailwind aliases — CSS vars for non-Tailwind contexts, Tailwind classes for utility use
- Sidebar disabled nav items remain visible (greyed out with tooltip) not hidden — discoverability of Phase 2/3 features
- `session.update()` called immediately after workspace API returns to refresh the Auth.js JWT with workspace_id and workspace_slug, preventing infinite redirect loop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes TypeScript error in AppLayout**
- **Found during:** Task 4 (typecheck after writing pages)
- **Issue:** AppLayout passed `projectKey={projectKey}` where `projectKey: string | undefined` — with `exactOptionalPropertyTypes: true`, explicitly passing `undefined` to an optional property is not allowed
- **Fix:** Changed to spread pattern `{...(projectKey !== undefined ? { projectKey } : {})}` in app-layout.tsx
- **Files modified:** `apps/web/src/components/layout/app-layout.tsx`
- **Verification:** `pnpm typecheck` passes with no errors
- **Committed in:** `6719119` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Required for correct TypeScript compilation. No scope creep.

## Issues Encountered

- pnpm not on PATH in bash shell — resolved by invoking via `node .../pnpm.cjs` with full path to npx-cached pnpm binary

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 Foundation complete. All 18 requirements delivered (INFRA-01-06, AUTH-01-05, WORK-01-03, DS-01-04)
- Phase 2 (Test Cases) can begin: design system and layout components are ready; sidebar nav items for Test Cases/Test Runs will be enabled as features ship
- The onboarding flow is fully functional end-to-end once API server is running

## Self-Check: PASSED

- All 10 key files found on disk
- All 4 task commits verified in git history (18efeb5, ddd7838, c7c5d44, 6719119)

---
*Phase: 01-foundation*
*Completed: 2026-03-08*
