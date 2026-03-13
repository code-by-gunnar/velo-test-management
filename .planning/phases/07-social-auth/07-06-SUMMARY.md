---
phase: 07-social-auth
plan: "06"
subsystem: auth
tags: [oauth, avatar, profile-picture, google, github]
dependency_graph:
  requires: [07-04]
  provides: [oauth-avatar-seeding]
  affects: [profile, sidebar-avatar]
tech_stack:
  added: []
  patterns: [COALESCE-for-no-overwrite, external-url-detection]
key_files:
  created: []
  modified:
    - apps/api/src/routes/auth.ts
    - apps/api/src/routes/profile.ts
    - apps/web/src/auth.ts
decisions:
  - "COALESCE(avatar_url, image) ensures existing avatars are never overwritten by OAuth provider pictures"
  - "External URLs (https://) returned directly from avatar-url endpoint without R2 presigning"
  - "Returning OAuth users (already have oauth_account row) are not touched — no avatar change on subsequent logins"
metrics:
  duration: "2m"
  completed: "2026-03-13T10:59:10Z"
---

# Phase 07 Plan 06: Seed User Avatar from OAuth Provider Summary

OAuth avatar seeding from Google (profile.picture) and GitHub (profile.avatar_url) into users.avatar_url on first sign-in, with COALESCE to protect existing avatars and external URL detection in the avatar-url endpoint.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Update oauth-signin endpoint to accept and store profile image | 7c5f080 | apps/api/src/routes/auth.ts |
| 2 | Update Auth.js signIn callback to pass profile image | 7c5f080 | apps/web/src/auth.ts |
| 3 | Update avatar-url endpoint to handle external URLs | 7c5f080 | apps/api/src/routes/profile.ts |

## What Changed

### apps/api/src/routes/auth.ts
- Added `image?: string | null` to Body type and Fastify schema (maxLength: 2048)
- Destructured `image` from request.body
- JIT provision path: added `avatar_url` column to INSERT with `${image ?? null}`
- Auto-link path: split into two branches — with image uses `COALESCE(avatar_url, ${image})`, without image keeps original UPDATE
- Returning user path (Step 1): unchanged — no avatar overwrite on subsequent logins

### apps/web/src/auth.ts
- Added `image` field to oauth-signin request body in signIn callback
- Resolution chain: `profile.picture` (Google) -> `profile.avatar_url` (GitHub) -> `user.image` (Auth.js fallback) -> `null`
- Cast `profile` to `Record<string, unknown>` for type-safe access to provider-specific fields

### apps/api/src/routes/profile.ts
- Added `startsWith("https://")` check before R2 presigning
- External URLs (OAuth profile pictures) returned directly as `{ url: avatarKey }`
- R2 keys continue to be presigned as before — fully backward-compatible

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `apps/api` tsc --noEmit: PASS (clean)
- `apps/web` tsc --noEmit: pre-existing error in `auth-callbacks.test.ts` line 226 (unrelated cast issue in test file, not introduced by this plan)

## Decisions Made

1. **COALESCE pattern for auto-link**: Using `COALESCE(avatar_url, ${image})` in SQL ensures database-level protection against overwriting existing avatars, rather than checking in application code.
2. **External URL detection by prefix**: Simple `startsWith("https://")` check is sufficient because R2 keys are always relative paths (`avatars/uuid/timestamp.ext`) and OAuth provider URLs are always absolute HTTPS URLs.
3. **Single atomic commit**: All three tasks committed together since they form one coherent feature (avatar seeding end-to-end).
