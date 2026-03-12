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

### Post-Milestone Additions (on master)
- CSV import with suite auto-creation
- Suite management: context menu, bulk delete, select mode
- requireAdmin middleware + admin-only delete runs
- Deleted test case handling in execution screen
- Auto-resize step textareas, whitespace-pre-wrap in view mode
- Calm gray confirmation pattern (Clean Elevation design)
- User profile management: name edit, OTP-verified email change, R2 avatar upload
- Sidebar popover menu (profile + sign out)

## Current Milestone: v1.1 GDPR & Data Lifecycle

**Goal:** Prepare the platform for UK/EU compliance by implementing GDPR data rights and workspace lifecycle management — getting ahead of launch, not reacting to it.

**Target features:**
- Self-serve workspace deletion with 30-day grace period (admin-only)
- Individual user right to erasure with 7-day grace period (anonymize references, don't cascade-delete their work)
- Data export (lightweight — name, email, avatar; small JSON download)
- Privacy policy page (/privacy)
- Hard delete of all workspace data after grace period (users, cases, runs, suites, everything)
- Anonymize deleted users in workspace (replace PII with "Deleted User" in created_by, comments, etc.)
- Scheduled cleanup job for expired grace periods

**Design decisions:**
- Hard delete workspace data (not anonymize) — clean slate after 30 days
- Anonymize individual user PII within workspace (don't delete their test history)
- 30-day grace period for workspace deletion, 7-day for individual user erasure
- Privacy policy page only (no cookie banner — app doesn't use tracking cookies)
- No DPA or ToS in this milestone — defer to legal review later

## Requirements

### Validated

- All v1 functionality (48 requirements across 6 phases)
- UI Redesign (38 requirements, Clean Elevation)
- Profile management (name, email OTP, avatar upload)

### Active

- [ ] Self-serve workspace deletion (30-day grace, admin-only)
- [ ] Individual user right to erasure (7-day grace, anonymize references)
- [ ] Data export (personal data JSON download)
- [ ] Privacy policy page
- [ ] Scheduled hard-delete job for expired workspace deletions
- [ ] Scheduled anonymization job for expired user erasure requests
- [ ] Workspace deletion cancellation during grace period

### Out of Scope

- Cookie consent banner — no tracking cookies in use
- Data Processing Agreement (DPA) — deferred to legal review
- Terms of Service page — deferred
- Dark mode — deferred to future milestone
- GDPR audit logging (Article 30 records of processing) — overkill pre-launch

## Constraints

- UK GDPR (post-Brexit equivalent of EU GDPR) — same principles, UK ICO enforces
- "Without undue delay" for erasure = 30 days max response time per ICO guidance
- Must not break existing workspace isolation (RLS, workspace_id enforcement)
- Deletion jobs must be idempotent (safe to retry on failure)
- No new external services — use existing BullMQ + Valkey for job scheduling

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hard delete workspace (not anonymize) | Clean slate simplifies compliance; no residual data risk | Decided |
| Anonymize user PII (not cascade delete) | Deleting their work breaks other users' test history | Decided |
| 30-day workspace / 7-day user grace | Workspace is major action; user erasure should be faster per GDPR | Decided |
| No cookie banner | App uses no tracking cookies; session cookie is strictly necessary (exempt) | Decided |
| BullMQ scheduled jobs | Already in stack (Valkey + BullMQ); no new infra needed | Decided |
| Privacy page only (no ToS/DPA) | Getting ahead pre-launch; full legal docs need lawyer review | Decided |

---
*Last updated: 2026-03-12 after milestone v1.1 initialization*
