# Velo Test Management

## What This Is

A lean QA test management platform for startups (20-200 employees). Solo founder, active QA/SDET. Built with Next.js 16 Pages Router + Fastify 5 + PostgreSQL 16. Hosted on Vercel (web) + Railway (api).

## Core Value

Ship a focused, keyboard-first test management tool that startups actually want to use — no Jira complexity, no enterprise bloat.

## Milestones

### v1.0 — Core Platform (COMPLETE)
48 requirements across 6 phases: auth, test cases, test runs, CI ingestion, integrations, RBAC.

### UI Redesign — "Clean Elevation" (COMPLETE)
38 requirements across 4 phases: design tokens, typography, layout, component reskin.

### v1.1 — GDPR & Data Lifecycle (COMPLETE)
20 requirements across 4 phases: schema/foundation, lifecycle workers, export/frontend, notifications.

### Post-Milestone Additions (on master)
- CSV import with suite auto-creation
- Suite management: context menu, bulk delete, select mode
- requireAdmin middleware + admin-only delete runs
- Deleted test case handling in execution screen
- Auto-resize step textareas, whitespace-pre-wrap in view mode
- Calm gray confirmation pattern (Clean Elevation design)
- User profile management: name edit, OTP-verified email change, R2 avatar upload
- Sidebar popover menu (profile + sign out)
- Landing page redesign (comparison table, feature cards, how-it-works)
- WCAG accessibility pass (prefers-reduced-motion, focus-visible rings)

## Current Milestone: v1.2 Social Auth

**Goal:** Add Google and GitHub OAuth as sign-in/sign-up options alongside existing email/password — standard SaaS expectation that reduces friction for new users.

**Target features:**
- Google OAuth sign-in/sign-up
- GitHub OAuth sign-in/sign-up
- Auto-link accounts when OAuth email matches existing email/password account
- OAuth users skip email OTP verification (pre-verified by provider)
- Login page updated with social auth buttons
- Existing session/JWT pipeline works seamlessly with OAuth users

**Design decisions:**
- Auto-link on email match (not separate accounts, not block + prompt)
- OAuth users skip OTP entirely — provider has already verified the email
- No new auth providers beyond Google + GitHub for this milestone
- Auth.js v5 built-in OAuth provider support (no custom OAuth implementation)

## Requirements

### Validated

- All v1 functionality (48 requirements across 6 phases)
- UI Redesign (38 requirements, Clean Elevation)
- Profile management (name, email OTP, avatar upload)
- GDPR & Data Lifecycle (20 requirements, v1.1)

### Active

- [ ] Google OAuth sign-in/sign-up
- [ ] GitHub OAuth sign-in/sign-up
- [ ] Account auto-linking on matching email
- [ ] OAuth users bypass email verification
- [ ] Social auth buttons on login/signup pages

### Out of Scope

- Apple Sign-In — deferred to future milestone
- Microsoft/Azure AD — enterprise SSO, deferred
- SAML/SSO — enterprise feature, deferred
- Dark mode — deferred to future milestone
- Account unlinking (remove linked provider) — defer unless trivial

## Constraints

- Must use Auth.js v5 built-in OAuth providers (Google, GitHub)
- Must preserve existing JWT/session pipeline (workspace_id, role, custom fields)
- Must not break existing email/password flow
- OAuth users need the same workspace onboarding flow as email users
- Google OAuth requires Google Cloud Console project + credentials
- GitHub OAuth requires GitHub OAuth App registration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-link on email match | Most SaaS apps do this; prevents duplicate accounts | Decided |
| Skip OTP for OAuth | Provider already verified email; extra OTP adds friction | Decided |
| Google + GitHub only | Most common for dev-tool SaaS; covers majority of users | Decided |
| Auth.js v5 providers | Already using Auth.js; built-in support avoids custom OAuth | Decided |

---
*Last updated: 2026-03-12 after milestone v1.2 initialization*
