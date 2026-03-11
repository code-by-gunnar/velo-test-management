# Roadmap: Velo UI Redesign — "Clean Elevation"

## Overview

Transform Velo from the "Industrial Notebook" dark-sidebar aesthetic to a clean, elevated, light design. Four phases: lay the design token foundation, restructure the sidebar and layout shell, restyle every component and page, then verify zero regressions. This is a visual reskin only — no functional changes, no API changes, no new components.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Design Foundation** - Design tokens, color palette, typography, spacing, shadows, and Tailwind config
- [x] **Phase 2: Layout & Navigation** - White sidebar, app shell with floating card layout, 3-panel cases structure
- [ ] **Phase 3: Components & Pages** - Restyle all UI components and all application pages to new design language
- [ ] **Phase 4: Regression Verification** - Validate all keyboard shortcuts, page flows, SSE, and CI checks pass

## Phase Details

### Phase 1: Design Foundation
**Goal**: Every design token (colors, typography, spacing, shadows, radii) is updated and the Tailwind config reflects the new "Clean Elevation" design language
**Depends on**: Nothing (first phase)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08
**Success Criteria** (what must be TRUE):
  1. Page background renders as #E8EDF2 and cards render as #FFFFFF with the new shadow and border-radius tokens
  2. DM Sans renders for all headings/display text and IBM Plex Sans renders for all body/UI text (visible in browser dev tools font panel)
  3. Typography scale is consistent across the app — page titles are 28px/600, section labels are 12px/600 uppercase, body is 14px/400
  4. All CSS custom properties in globals.css reflect the new palette and Tailwind config extends them correctly
**Plans**: 2 plans

Plans:
- [x] 01-01: CSS custom properties and Tailwind config overhaul (colors, spacing, shadows, radii)
- [x] 01-02: Font loading and typography scale (DM Sans, IBM Plex Sans, type scale)

### Phase 2: Layout & Navigation
**Goal**: The sidebar is white with blue active states, the app shell renders content as floating cards on the blue-gray surface, and the cases page has a 3-panel layout
**Depends on**: Phase 1
**Requirements**: UI-09, UI-10, UI-11, UI-12, UI-13, UI-14, UI-15, UI-16, UI-17
**Success Criteria** (what must be TRUE):
  1. Sidebar renders as white (#FFFFFF) with a right border, 192px width, and collapses to 48px icon rail with localStorage persistence
  2. Active nav item shows blue highlight (#EBF3FF bg, #2D7FF9 text), inactive items show dark text with gray hover
  3. Main content area renders as a floating white card (12px radius, card shadow) on the #E8EDF2 page background
  4. Cases page displays 3-panel layout: sidebar (192px) | suites panel (144px, white, right border) | main content
  5. Workspace dropdown in sidebar shows avatar with initials, name, and chevron on gray background
**Plans**: 2 plans

Plans:
- [x] 02-01: Sidebar restyling (white bg, nav items, workspace dropdown, collapse behavior)
- [x] 02-02: App shell and cases 3-panel layout (floating card wrapper, suites panel)

### Phase 3: Components & Pages
**Goal**: Every UI component and every application page reflects the new design language — buttons, badges, cards, tables, inputs, and all 10 page groups are restyled
**Depends on**: Phase 2
**Requirements**: UI-18, UI-19, UI-20, UI-21, UI-22, UI-23, UI-24, UI-25, UI-26, UI-27, UI-28, UI-29, UI-30, UI-31, UI-32, UI-33, UI-34
**Success Criteria** (what must be TRUE):
  1. Primary buttons render as #2D7FF9 with white text (8px radius, 40px height); secondary buttons render with blue border on white
  2. Priority badges show the correct tier styling (High: solid blue, Medium: light blue, Low: gray) and status badges retain their muted pass/fail/blocked/skipped colors
  3. All 10 page groups (auth, onboarding, dashboard, cases, runs, run detail, execution, settings, ingestion, toasts) visually match the new design language
  4. Table rows are 56px with gray hover, uppercase headers on #F9FAFB background
  5. Toast notifications render as white cards with 8px radius and toast shadow
**Plans**: 3 plans

Plans:
- [x] 03-01: Component restyling (Button, Card, Input, StatusBadge, PriorityBadge, Table rows)
- [x] 03-02: Auth, onboarding, dashboard, and settings pages
- [x] 03-03: Cases, runs, run detail, execution, ingestion pages, and toasts

### Phase 4: Regression Verification
**Goal**: Every existing interaction, keyboard shortcut, page flow, and real-time feature works identically after the redesign, and CI passes clean
**Depends on**: Phase 3
**Requirements**: UI-35, UI-36, UI-37, UI-38
**Success Criteria** (what must be TRUE):
  1. All execution keyboard shortcuts (P/F/B/S, Tab/Enter for step editing) work identically in the restyled execution screen
  2. Complete page flow (auth -> onboarding -> dashboard -> cases -> runs -> execution) works end-to-end without visual or functional breakage
  3. SSE live updates render correctly on the restyled runs dashboard and run detail page
  4. `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` passes with zero errors
**Plans**: 2 plans

Plans:
- [x] 04-01: Manual regression walkthrough and SSE verification
- [x] 04-02: Lint, typecheck, and test suite pass

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Design Foundation | 2/2 | Complete | 2026-03-11 |
| 2. Layout & Navigation | 2/2 | Complete | 2026-03-11 |
| 3. Components & Pages | 3/3 | Complete | 2026-03-11 |
| 4. Regression Verification | 2/2 | Complete | 2026-03-11 |

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| UI-01 | Phase 1 |
| UI-02 | Phase 1 |
| UI-03 | Phase 1 |
| UI-04 | Phase 1 |
| UI-05 | Phase 1 |
| UI-06 | Phase 1 |
| UI-07 | Phase 1 |
| UI-08 | Phase 1 |
| UI-09 | Phase 2 |
| UI-10 | Phase 2 |
| UI-11 | Phase 2 |
| UI-12 | Phase 2 |
| UI-13 | Phase 2 |
| UI-14 | Phase 2 |
| UI-15 | Phase 2 |
| UI-16 | Phase 2 |
| UI-17 | Phase 2 |
| UI-18 | Phase 3 |
| UI-19 | Phase 3 |
| UI-20 | Phase 3 |
| UI-21 | Phase 3 |
| UI-22 | Phase 3 |
| UI-23 | Phase 3 |
| UI-24 | Phase 3 |
| UI-25 | Phase 3 |
| UI-26 | Phase 3 |
| UI-27 | Phase 3 |
| UI-28 | Phase 3 |
| UI-29 | Phase 3 |
| UI-30 | Phase 3 |
| UI-31 | Phase 3 |
| UI-32 | Phase 3 |
| UI-33 | Phase 3 |
| UI-34 | Phase 3 |
| UI-35 | Phase 4 |
| UI-36 | Phase 4 |
| UI-37 | Phase 4 |
| UI-38 | Phase 4 |

**Total: 38/38 requirements mapped. No orphans.**

---
*Roadmap created: 2026-03-11*
*Last updated: 2026-03-11*
