# Requirements: Velo

**Defined:** 2026-03-08
**Core Value:** A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

## v1 Requirements

### Infrastructure

- [x] **INFRA-01**: Repository is set up with CI/CD pipeline running on GitHub Actions (lint, type-check, test on every PR)
- [x] **INFRA-02**: Application deploys to Railway automatically from main branch merge
- [x] **INFRA-03**: PostgreSQL 16 database is provisioned on Railway with drizzle-kit migration system in place
- [x] **INFRA-04**: Valkey instance is provisioned and connected (session store, pub/sub, BullMQ)
- [x] **INFRA-05**: Multi-tenancy isolation enforced at application layer (workspace_id on every tenant-scoped row, TypeScript compile-time enforcement)
- [x] **INFRA-06**: PostgreSQL RLS enabled on all tenant-scoped tables as defense-in-depth layer using SET LOCAL (transaction-scoped)

### Authentication

- [x] **AUTH-01**: User can sign up with email and password
- [x] **AUTH-02**: User can sign in with email and password and stay signed in across browser restarts
- [x] **AUTH-03**: User can sign out from any screen
- [x] **AUTH-04**: User can reset password via email link (email delivered via Resend)
- [x] **AUTH-05**: Auth.js v5 JWT session correctly persists custom fields (workspace_id, role) across authorize → jwt → session callback chain

### Design System

- [x] **DS-01**: Design token set is implemented as CSS custom properties (Cobalt, Slate, Mist, Gray Mid, Gray Light, Pass Green, Fail Red, Blocked Amber, Skipped Slate)
- [x] **DS-02**: Typography scale is implemented (Inter for UI, JetBrains Mono for code/IDs)
- [x] **DS-03**: Base component library exists: Button (primary/secondary/destructive/ghost), Card, Form Input, Status Badge (PASS/FAIL/BLOCKED/SKIPPED)
- [x] **DS-04**: Left sidebar navigation (240px, collapsible to 48px icon rail) with persistent project context

### Workspace & Projects

- [x] **WORK-01**: User can create a workspace with a name and slug
- [x] **WORK-02**: User can create a project within a workspace (name + project key, e.g. VELO)
- [x] **WORK-03**: Free tier enforces limits (3 editors, 1 project, 500 test cases)

### Test Cases

- [ ] **TC-01**: User can create a test case with title, preconditions, steps, expected results, and priority — entirely by keyboard, in under 30 seconds from blank to saved
- [ ] **TC-02**: User can add, reorder, and delete steps using only keyboard (Tab to next field, Enter to add step)
- [ ] **TC-03**: User can organise test cases into nested suites (unlimited depth) within a project
- [ ] **TC-04**: User can drag and drop suites and test cases to reorder them (gap-based integer positions, no full-table rewrite on reorder)
- [ ] **TC-05**: User can bulk move or copy test cases between suites
- [ ] **TC-06**: User can import test cases from CSV or Excel file, preserving step structure (not flattened to single description field)

### Test Runs

- [ ] **TR-01**: User can create a named test run scoped to a project, suite selection, or milestone
- [ ] **TR-02**: User can assign a test run to themselves or another team member
- [ ] **TR-03**: User can execute a run one case at a time using P/F/B/S keyboard shortcuts (Pass / Fail / Blocked / Skipped)
- [ ] **TR-04**: User can add an inline comment on any test step during execution
- [ ] **TR-05**: User can file a defect (linked to Linear issue) directly from a failed run item
- [ ] **TR-06**: User can see execution history for a test case across all previous runs
- [ ] **TR-07**: User can create a new run from the failures of a previous run (rerun-failures flow)

### Live Dashboard

- [ ] **DA-01**: User can see a live run dashboard that updates in real time without page refresh (SSE + Valkey pub/sub per run_id)
- [ ] **DA-02**: Dashboard shows real-time progress bar, pass rate percentage, and time-to-complete estimate
- [ ] **DA-03**: Dashboard run list is filterable by assignee, run status, and milestone

### CI/CD Result Ingestion

- [ ] **IN-01**: CI pipeline can push JUnit XML results to Velo via REST API endpoint; results are auto-mapped to test cases by name or external ID
- [ ] **IN-02**: CI pipeline can push Allure JSON results to Velo; results are auto-mapped to test cases
- [ ] **IN-03**: JUnit XML parser handles the 5 most common CI variants (pytest-junit, Surefire/Maven, Gradle, Jest-junit, Go gotestsum) without error
- [ ] **IN-04**: Raw CI payloads are stored in Cloudflare R2 (not in PostgreSQL) for debugging and audit

### Integrations

- [ ] **INT-01**: User can create a Linear issue directly from a failed run item in Velo (one-way create)
- [ ] **INT-02**: Velo displays the current Linear issue status back in the run view (two-way sync; idempotency key prevents sync loops)
- [ ] **INT-03**: REST API provides full parity with the UI (all resources readable and writable via API)
- [ ] **INT-04**: Webhooks fire on: run complete, case fail, milestone reached (configurable endpoint per project)

### Team & Access Control

- [ ] **USR-01**: Workspace admin can invite team members by email
- [ ] **USR-02**: Invited user receives email with sign-up/join link (delivered via Resend)
- [ ] **USR-03**: Workspace admin can assign roles: Admin, Editor, Viewer
- [ ] **USR-04**: Workspace admin can deactivate a team member (revokes access immediately)
- [ ] **USR-05**: Viewer role has unlimited seats on all plan tiers; Editor seats are capped per tier
- [ ] **USR-06**: Plan tier limits are enforced at the API layer (cannot create project beyond Free limit without upgrade)

---

## v2 Requirements

### Test Cases

- **TC-V2-01**: User can search and filter test cases by full-text query across title, steps, and tags
- **TC-V2-02**: User can bulk tag, archive, or delete test cases via multi-select
- **TC-V2-03**: User can create reusable step templates per project and import from shared library

### Test Runs

- **TR-V2-01**: User can create a test plan/milestone that groups multiple runs with a shared due date

### Integrations

- **INT-V2-01**: Jira two-way sync (file defect from Velo; see Jira status in run view) — deferred in favour of Linear for MVP
- **INT-V2-02**: GitHub/GitLab PR status checks from automated run results
- **INT-V2-03**: Slack/Teams notifications (run complete, run failed, milestone due)

### Dashboard & Reporting

- **DA-V2-01**: Coverage and trend reports (pass rate over time, flaky test surface, coverage by suite/milestone) — requires 90+ days of run history to be meaningful
- **DA-V2-02**: Custom dashboard builder with drag-and-drop widgets

### AI Features

- **AI-V2-01**: AI test case generation from Jira tickets, requirements text, or OpenAPI spec via Claude API
- **AI-V2-02**: AI failure analysis — pattern detection across recent failures, surface flaky vs regression failures

### Enterprise

- **ENT-V2-01**: SSO / SAML authentication
- **ENT-V2-02**: Full audit log of all workspace activity
- **ENT-V2-03**: SOC 2 compliance readiness

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Next.js App Router | CVE-2025-55182 (CVSS 10.0 RCE) — Pages Router only until resolved |
| Clerk auth | Want full control over auth infrastructure; avoid paid dependency at MVP stage |
| Redis | SSPL licence change March 2024 — replaced by Valkey |
| Fly.io | Railway simpler for solo MVP; revisit if multi-region is needed |
| Jira integration (MVP) | Linear chosen instead — better fit for startup ICP; Jira deferred to v2 |
| Built-in test automation engine | Separate product category; not Velo's job |
| Requirements management module | Jira/Linear own this for the ICP |
| Time / budget tracking | Out of Velo's domain |
| Custom workflow states | Opinionated defaults (P/F/B/S/Retest) — configuration is friction |
| On-premises / self-hosted | Not in V1 |
| Native mobile app | Web-first; mobile-responsive polish is V2 |
| Dark mode | V2 feature — light interface is the design identity |
| No-code test recorder | Specialist product category |
| Visual / screenshot testing | Separate product category |
| Test execution scheduling | CI/CD tools own this |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| DS-01 | Phase 1 | Complete |
| DS-02 | Phase 1 | Complete |
| DS-03 | Phase 1 | Complete |
| DS-04 | Phase 1 | Complete |
| WORK-01 | Phase 1 | Complete |
| WORK-02 | Phase 1 | Complete |
| WORK-03 | Phase 1 | Complete |
| TC-01 | Phase 2 | Pending |
| TC-02 | Phase 2 | Pending |
| TC-03 | Phase 2 | Pending |
| TC-04 | Phase 2 | Pending |
| TC-05 | Phase 2 | Pending |
| TC-06 | Phase 2 | Pending |
| TR-01 | Phase 3 | Pending |
| TR-02 | Phase 3 | Pending |
| TR-03 | Phase 3 | Pending |
| TR-04 | Phase 3 | Pending |
| TR-05 | Phase 3 | Pending |
| TR-06 | Phase 3 | Pending |
| TR-07 | Phase 3 | Pending |
| DA-01 | Phase 3 | Pending |
| DA-02 | Phase 3 | Pending |
| DA-03 | Phase 3 | Pending |
| IN-01 | Phase 4 | Pending |
| IN-02 | Phase 4 | Pending |
| IN-03 | Phase 4 | Pending |
| IN-04 | Phase 4 | Pending |
| INT-01 | Phase 5 | Pending |
| INT-02 | Phase 5 | Pending |
| INT-03 | Phase 5 | Pending |
| INT-04 | Phase 5 | Pending |
| USR-01 | Phase 6 | Pending |
| USR-02 | Phase 6 | Pending |
| USR-03 | Phase 6 | Pending |
| USR-04 | Phase 6 | Pending |
| USR-05 | Phase 6 | Pending |
| USR-06 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 — traceability populated by roadmapper*
