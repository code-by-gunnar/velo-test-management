# Requirements: Velo UI Redesign — "Clean Elevation"

**Defined:** 2026-03-11
**Core Value:** The app looks polished, intentional, and distinctly light — while preserving every existing interaction without regression.

## UI Redesign Requirements

### Design Tokens

- [x] **UI-01**: CSS custom properties updated to new color palette — page bg #E8EDF2, card bg #FFFFFF, primary blue #2D7FF9, hover blue #1A6BE8, selected bg #EBF3FF, text primary #1F2937, text secondary #6B7280, text muted #9CA3AF, borders #E5E7EB
- [x] **UI-02**: Spacing scale standardized to 4/8/12/16/20/24/32/40/48px grid
- [x] **UI-03**: Border radius tokens updated — small 6px (badges, inputs), medium 8px (buttons, cards), large 12px (panels, modals), full 50% (avatars)
- [x] **UI-04**: Shadow tokens updated — card `0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px rgba(0,0,0,0.06)`, dropdown `0px 4px 6px rgba(0,0,0,0.1)`, toast `0px 4px 12px rgba(0,0,0,0.15)`

### Typography

- [x] **UI-05**: DM Sans loaded via next/font/google as `font-display` variable, replacing Inter for headings and display text
- [x] **UI-06**: IBM Plex Sans loaded via next/font/google as `font-body` variable for all body/UI text
- [x] **UI-07**: JetBrains Mono retained as `font-mono` for code and IDs (no change)
- [x] **UI-08**: Typography scale applied — page titles 28px/600, section labels 12px/600 uppercase with letter-spacing, body 14px/400, table headers 12px/600 uppercase

### Sidebar

- [ ] **UI-09**: Sidebar background changed from dark warm (#2D2926) to white (#FFFFFF) with right border (#E5E7EB)
- [ ] **UI-10**: Sidebar width updated from 240px to 192px (collapsed 48px icon rail preserved)
- [ ] **UI-11**: Active nav item styled with blue highlight — bg #EBF3FF, text/icon #2D7FF9, font-weight 600
- [ ] **UI-12**: Inactive nav items styled — text #1F2937, icon #6B7280, hover bg #F3F4F6
- [ ] **UI-13**: Workspace dropdown in sidebar — 24px avatar square with initials, workspace name, chevron-down, on #F3F4F6 background
- [ ] **UI-14**: Sidebar collapse/expand toggle and localStorage persistence preserved

### Layout

- [ ] **UI-15**: App shell updated — page background #E8EDF2, main content rendered as floating white card with 12px border-radius and card shadow
- [ ] **UI-16**: Cases page adopts 3-panel layout — sidebar (192px) | suites panel (144px, white, right border) | main content (remaining)
- [ ] **UI-17**: Suites panel shows "SUITES" header (12px uppercase), tree items with selected state (blue bg), and "+ New suite" at bottom

### Components

- [ ] **UI-18**: Button primary restyled — bg #2D7FF9, hover #1A6BE8, white text, 8px radius, 40px height
- [ ] **UI-19**: Button secondary restyled — white bg, 1px #2D7FF9 border, blue text, hover bg #EBF3FF
- [ ] **UI-20**: Priority badges restyled — High: solid blue bg + white text; Medium: #E8F2FF bg + blue text + blue border; Low: #F3F4F6 bg + gray text
- [ ] **UI-21**: Status badges (pass/fail/blocked/skipped) retain existing muted color tokens — no change to status semantics
- [ ] **UI-22**: Card component updated — white bg, 8px radius, card shadow, 1px #E5E7EB border
- [ ] **UI-23**: Table rows updated — 56px height, 1px bottom border, #F9FAFB hover, grid layout with uppercase headers on #F9FAFB bg
- [ ] **UI-24**: Input/form fields updated — 6px radius, focus ring color changed to primary blue

### Pages

- [ ] **UI-25**: Auth pages (login, signup, verify, forgot-password, reset-password) restyled with new tokens and floating card layout
- [ ] **UI-26**: Onboarding wizard restyled with new tokens
- [ ] **UI-27**: Dashboard page restyled — floating card, new button/badge styles
- [ ] **UI-28**: Cases page restyled with 3-panel layout, new table styles, status bar with avatar stack
- [ ] **UI-29**: Runs dashboard restyled — RunCard, SegmentedBar, RunFilters with new tokens
- [ ] **UI-30**: Run detail page restyled — item list, defect badges, action buttons
- [ ] **UI-31**: Execution screen restyled — keyboard hints footer, DefectPrompt, StepCommentIcon with new tokens
- [ ] **UI-32**: Settings page restyled — tabs, TeamPanel, ApiKeysPanel with new tokens
- [ ] **UI-33**: Ingestion page restyled — SetupGuide, IngestionHistory with new tokens
- [ ] **UI-34**: Toast notifications restyled — white bg, 8px radius, toast shadow, green checkmark icon

### Regression Guard

- [ ] **UI-35**: All existing keyboard shortcuts (P/F/B/S execution, Tab/Enter step editing) work identically after redesign
- [ ] **UI-36**: All existing page flows (auth → onboarding → dashboard → cases → runs → execution) work identically after redesign
- [ ] **UI-37**: SSE live updates continue to work on runs dashboard and run detail page
- [ ] **UI-38**: Typecheck and lint pass with zero errors after redesign

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Functional changes | No new features, no interaction redesigns, no new API endpoints |
| Dark mode | Light is the identity; dark mode is v2 |
| Mobile-responsive redesign | Current responsive behavior stays, just restyled |
| New component creation | Restyle existing components only |
| Floating action buttons (mockup) | Mockup artifact, not a production feature |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 1 | Done |
| UI-02 | Phase 1 | Done |
| UI-03 | Phase 1 | Done |
| UI-04 | Phase 1 | Done |
| UI-05 | Phase 1 | Done |
| UI-06 | Phase 1 | Done |
| UI-07 | Phase 1 | Done |
| UI-08 | Phase 1 | Done |
| UI-09 | Phase 2 | Pending |
| UI-10 | Phase 2 | Pending |
| UI-11 | Phase 2 | Pending |
| UI-12 | Phase 2 | Pending |
| UI-13 | Phase 2 | Pending |
| UI-14 | Phase 2 | Pending |
| UI-15 | Phase 2 | Pending |
| UI-16 | Phase 2 | Pending |
| UI-17 | Phase 2 | Pending |
| UI-18 | Phase 3 | Pending |
| UI-19 | Phase 3 | Pending |
| UI-20 | Phase 3 | Pending |
| UI-21 | Phase 3 | Pending |
| UI-22 | Phase 3 | Pending |
| UI-23 | Phase 3 | Pending |
| UI-24 | Phase 3 | Pending |
| UI-25 | Phase 3 | Pending |
| UI-26 | Phase 3 | Pending |
| UI-27 | Phase 3 | Pending |
| UI-28 | Phase 3 | Pending |
| UI-29 | Phase 3 | Pending |
| UI-30 | Phase 3 | Pending |
| UI-31 | Phase 3 | Pending |
| UI-32 | Phase 3 | Pending |
| UI-33 | Phase 3 | Pending |
| UI-34 | Phase 3 | Pending |
| UI-35 | Phase 4 | Pending |
| UI-36 | Phase 4 | Pending |
| UI-37 | Phase 4 | Pending |
| UI-38 | Phase 4 | Pending |

**Coverage:**
- UI redesign requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 — Phase mappings added*
