# Velo

## What This Is

Velo is a lean QA and test management platform for startups and scale-ups (20–200 employees). It gives QA engineers one clean place to write, run, and track tests — with a keyboard-first UI, flat pricing, and CI/CD integrations that work out of the box. Built by a QA engineer, for QA engineers.

## Core Value

A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Phase 1 + 2 scope (MVP)**

- [ ] Repo, CI/CD pipeline, and deployment to Railway are configured
- [ ] Auth (email/password + session management) via Auth.js v5
- [ ] PostgreSQL schema covers all core entities (Workspace, Project, Suite, TestCase, TestRun, RunItem, Defect, Milestone)
- [ ] Valkey (Redis fork) configured for caching and real-time pub/sub
- [ ] Design system tokens and base component library in Next.js (Pages Router)
- [ ] Test case editor: keyboard-first, inline editing, under 30s from blank to saved (TC-01)
- [ ] Suite and folder structure: nested suites, drag-and-drop, bulk move/copy (TC-02)
- [ ] Test run creation from suites, filters, or milestone scope (TR-01)
- [ ] Execution interface: P/F/B/S keyboard shortcuts, inline defect filing (TR-02)
- [ ] JUnit XML and Allure JSON ingestion via API (IN-01)
- [ ] Live run dashboard with real-time updates — no page refresh required (DA-01)
- [ ] REST API with full UI parity + webhooks (API-01)
- [ ] Jira two-way sync: file defects from Velo, see Jira status back in run view (INT-01)
- [ ] Team and role management: Admin, Editor, Viewer (USR-01)

### Out of Scope

- Clerk auth — want more control; Auth.js v5 gives full ownership without a paid dependency
- Next.js App Router — CVE-2025-55182 (CVSS 10.0 RCE); Pages Router only until patched/resolved
- Fly.io hosting — Railway is simpler for MVP; migrate to Fly.io if multi-region becomes a need
- P1 features (templates, coverage reports, GitHub/GitLab, Slack, AI generation) — Phase 3+ only
- P2 features (custom dashboards, Linear, failure analysis AI) — post-PMF
- Built-in test automation engine — out of scope entirely
- Requirements management module — not Velo's job
- Time/budget tracking — not Velo's job
- Built-in bug tracker — Jira/Linear integration only
- Custom workflow builder — opinionated defaults instead
- On-premises / self-hosted — not in V1
- Compliance modules (21 CFR, FDA, ISO 13485) — enterprise tier only if ever
- Native mobile app — not in V1
- Dark mode — V2 feature
- PostgreSQL FTS upgrades / Typesense search — V2
- SSO / SAML — Growth/Enterprise tier, post-PMF

## Context

- **Builder background:** Solo founder who is an active QA / SDET — first-hand user of the problem. Primary daily frustrations: (1) test case creation is too slow and click-heavy in current tools, and (2) run tracking requires constant manual refresh — results are always stale.
- **Market gap:** Incumbents (TestRail, Qase, PractiTest) were built for enterprise compliance workflows. All charge per-seat. None feel fast. Velo's differentiators are flat pricing, keyboard-first UX, and real-time run tracking.
- **Design language:** Notion/Craft aesthetic — light, spatial, warm. Not dark-mode cockpit. Status colours: muted sage (pass), warm coral (fail), amber (blocked). Primary accent: Cobalt (#2563EB). Background: Mist (#F8FAFC).
- **Pricing model:** Flat workspace tiers (Free / Starter $49 / Growth $149 / Enterprise custom). Viewers always free. Editors capped per tier.

## Constraints

- **Tech — Frontend:** Next.js 16 Pages Router + TypeScript + Tailwind CSS. App Router explicitly excluded (CVE-2025-55182).
- **Tech — Backend:** Node.js 22 LTS + Fastify 5
- **Tech — Database:** PostgreSQL 16 + Valkey (replaces Redis — SSPL licence change March 2024)
- **Tech — Auth:** Auth.js v5 (PKCE enforced). No Clerk dependency.
- **Tech — Storage:** Cloudflare R2 (zero egress vs S3)
- **Tech — AI:** Anthropic Claude API (claude-sonnet-4-6 / claude-haiku-4-5) — for Phase 3+ AI features
- **Tech — Observability:** Sentry + Better Stack
- **Hosting:** Railway for MVP
- **CI/CD:** GitHub Actions
- **Scope:** Phase 1 (Foundation) + Phase 2 (Core MVP) only. 6-phase full roadmap exists but phases 3–6 are future.
- **Security:** Supply chain hardening — pnpm lockfiles + Dependabot/Socket.dev in CI; node:22-alpine base with pinned digests; Trivy in CI.
- **Performance:** All operations <300ms. Real-time run updates without page reload.
- **Navigation:** Max 3 clicks to any data from any screen.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js Pages Router over App Router | CVE-2025-55182 (CVSS 10.0 RCE) in App Router makes it a non-starter; Pages Router is stable and familiar | — Pending |
| Auth.js v5 over Clerk | More control over auth infrastructure; avoid paid dependency at MVP stage | — Pending |
| Railway over Fly.io | Simpler setup for solo MVP; Fly.io available if multi-region needed later | — Pending |
| Valkey over Redis | Redis SSPL licence change March 2024 — Valkey is the open-source fork with community backing | — Pending |
| SvelteKit dropped in favour of Next.js | Larger ecosystem wins for solo founder with delivery risk; CVE concerns still apply to App Router | — Pending |
| Phase 1+2 only (not full 6-phase roadmap) | Solo founder — validate core before building integrations and AI features | — Pending |

---
*Last updated: 2026-03-08 after initialization*
