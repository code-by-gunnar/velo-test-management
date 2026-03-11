# Velo UI Redesign — "Clean Elevation"

## What This Is

A full visual redesign of the Velo test management platform, moving from the current "Industrial Notebook" dark-sidebar aesthetic to a clean, elevated, light look. Every page gets restyled — new design tokens, typography (DM Sans + IBM Plex Sans), white sidebar, floating card layout on a cool blue-gray surface, and a brighter blue primary. No functional changes — same components, same interactions, same data flows.

## Core Value

The app must look polished, intentional, and distinctly NOT like another dark-mode SaaS clone — while preserving every existing interaction and keyboard shortcut without regression.

## Requirements

### Validated

- All v1 functionality (48 requirements across 6 phases) — existing, must not regress

### Active

- [ ] Design token overhaul (colors, typography, spacing, shadows, radii)
- [ ] Typography swap: DM Sans (headings) + IBM Plex Sans (body) replacing Inter
- [ ] White sidebar with collapsible icon rail (192px / 48px)
- [ ] Floating card layout on blue-gray (#E8EDF2) background for all pages
- [ ] 3-panel layout on cases page (sidebar | suites panel | content)
- [ ] Component reskin (buttons, badges, cards, inputs, status badges, table rows)
- [ ] All existing pages restyled to match new design language
- [ ] Status colors preserved (pass/fail/blocked/skipped muted tones kept)

### Out of Scope

- Functional changes — no new features, no interaction redesigns, no new API endpoints
- Dark mode — light is the identity, dark mode is v2
- Mobile-responsive redesign — current responsive behavior stays, just restyled
- New component creation — restyle existing components only
- The floating action buttons and right-side icons from the mockup — these are mockup artifacts, not production features

## Context

**Current state:** Velo v1 is complete (48/48 requirements, all 6 phases shipped). The app works end-to-end: auth, test cases, runs, execution, CI ingestion, Linear integration, RBAC. The visual layer is functional but uses an "Industrial Notebook" warm palette that feels dated compared to the founder's vision.

**Design reference:** `docs/Clean Elevation.png` (mockup) and `docs/desgin-language-redesign.md` (pixel-level spec). The spec references "Inter/SF Pro" in the typography table — this is overridden by the founder's decision to use DM Sans + IBM Plex Sans.

**Tech stack (frontend):** Next.js 16 Pages Router, Tailwind CSS with custom design tokens in `globals.css`, CVA for component variants, Lucide React icons. All current design tokens are CSS custom properties.

**Key files:**
- `apps/web/src/styles/globals.css` — CSS custom properties (colors, spacing, shadows, typography vars)
- `apps/web/src/pages/_app.tsx` — font loading via `next/font/google`
- `apps/web/src/components/ui/` — Button, Card, Input, StatusBadge (CVA variants)
- `apps/web/src/components/layout/sidebar.tsx` — collapsible sidebar (dark warm)
- `apps/web/src/components/layout/app-layout.tsx` — app shell layout
- `tailwind.config.ts` — Tailwind theme extension

## Constraints

- **No regressions**: Every keyboard shortcut, every page flow, every API call must work identically after the redesign
- **CSS-first**: Changes should be primarily in tokens, Tailwind config, and component class names — not restructuring React component trees
- **Font licensing**: DM Sans and IBM Plex Sans are both Google Fonts (open source, free) — no licensing issues
- **Existing status tokens**: pass/fail/blocked/skipped colors stay as muted tones (forest green, brick red, burnt amber, warm gray) — they work well and don't need to match the cool palette

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| DM Sans + IBM Plex Sans over Inter | Inter is overused in SaaS; DM Sans has more character for headings, IBM Plex Sans is highly legible for body | — Pending |
| White sidebar over dark | Lighter, more open feel; matches the "Clean Elevation" aesthetic | — Pending |
| Cool blue-gray background (#E8EDF2) | Distinguishes from the Notion/Craft cool-white default while staying light | — Pending |
| Brighter blue primary (#2D7FF9) | More vibrant than the current cobalt (#1A56DB); better contrast on white | — Pending |
| Floating card layout | Every page rendered as a white card on the blue-gray surface — consistent, clean, elevated | — Pending |
| 3-panel cases page | Sidebar \| Suites panel (144px) \| Content — clearer hierarchy for test case management | — Pending |
| Visual reskin only | No functional changes reduces risk, scope, and testing surface | — Pending |
| Keep muted status colors | Forest green/brick red/amber/gray work well; forcing them into the cool palette would reduce readability | — Pending |

---
*Last updated: 2026-03-11 after initialization (UI redesign milestone)*
