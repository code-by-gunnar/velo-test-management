---
phase: 03-export-frontend
plan: 03
subsystem: web/profile
tags: [gdpr, erasure, ui, profile]
dependency-graph:
  requires: [erasure API endpoints from phase 2]
  provides: [user-facing erasure request/cancel UI]
  affects: [profile page]
tech-stack:
  patterns: [two-step confirmation, inline status display]
key-files:
  modified:
    - apps/web/src/pages/app/[slug]/profile.tsx
decisions:
  - Calm two-step confirmation (no alarming red/yellow styling) per design system rules
  - Erasure fetch is sequential after profile+avatar (non-blocking, low priority)
metrics:
  duration: 4 minutes
  completed: 2026-03-12
---

# Phase 3 Plan 3: User Erasure Status UI Summary

User data erasure request, status display, and cancellation UI added to profile page using existing API endpoints.

## One-liner

Two-step erasure request/cancel flow on profile page with countdown display and calm confirmation pattern.

## What Was Done

### Task 1: Add erasure UI to profile page (auto)

Added complete erasure management section to the bottom of the profile page:

1. **State management** -- Four new state variables: `erasureStatus`, `erasureLoading`, `erasureError`, `confirmingErasure`
2. **Fetch on load** -- Erasure status fetched alongside existing profile and avatar requests via `/api/backend/me/erasure-status`
3. **Request handler** -- POSTs to `/api/backend/me/request-erasure`, updates local state to show pending status
4. **Cancel handler** -- POSTs to `/api/backend/me/cancel-erasure`, clears pending state
5. **UI section** -- "Delete my data" card with two states:
   - **No pending erasure**: Description text + "Request data erasure" button that opens two-step confirmation
   - **Pending erasure**: Shows scheduled deletion date, days remaining countdown, and "Cancel erasure request" button

**Commit:** `7518ee1`

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation: PASSED (zero errors)
- ESLint: PASSED (zero warnings)

## Decisions Made

1. Used sequential fetch for erasure status (after profile+avatar) rather than parallel -- erasure status is low-priority data and adding it to the Promise.all would complicate error handling for a rarely-used feature

## Self-Check: PASSED
