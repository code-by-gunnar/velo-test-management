# Velo
### Product Specification — v1.0
**March 2026 | CONFIDENTIAL**

*Lean QA & Test Management for Startups and Scale-ups*

---

## 1. Executive Summary

Velo is a lean QA and test management platform built for the way startups actually work. While incumbents like TestRail, Qase, and PractiTest were designed for enterprise compliance workflows, Velo is designed for speed — enabling QA engineers to write, run, and track tests without fighting the tool.

The QA tooling market is stuck. Most platforms were architected in the 2010s around process-heavy, per-seat models that punish fast-moving teams. Velo resets the category with flat pricing, a keyboard-first UI, and integrations that just work.

**Mission:** Ship software faster by giving QA teams one clean place to write, run, and track tests — without enterprise overhead.

**Brand Statement:** *"Your team moves fast. Your QA should too."*

---

## 2. Market Context

### 2.1 Competitive Landscape

The test management market is dominated by tools built for enterprise teams. Every major player charges per seat, adds modules for requirements and compliance, and prioritises feature surface over speed.

| Competitor | Pricing | Key Pain Point |
|---|---|---|
| TestRail | $36/user/mo | Dated UI, US-only support, slow performance |
| Qase | $20/user/mo | Per-seat, limited AI, parallel system needed for automation |
| PractiTest | $41/user/mo | Enterprise complexity, steep learning curve |
| Xray | Variable | Atlassian-locked, no standalone product |
| qTest / Tricentis | Custom | Module-heavy, compliance-focused, very expensive |

### 2.2 Unmet Startup Needs

- Fast test case creation — under 30 seconds from blank to saved
- Real-time run tracking without page refreshes
- CI/CD that "just works" with JUnit XML and Allure out of the box
- Flat pricing that scales with the company, not the headcount
- Exploratory and structured testing in one unified view
- Zero onboarding friction — functional in under 5 minutes

---

## 3. Target Users

### 3.1 Primary — QA Engineer / SDET

Individual contributors running manual and automated test cycles at a startup or scale-up (20–200 employees). They are the day-to-day power users of Velo, living inside the tool during sprint cycles.

- **Pain:** Their current tool is slower than their team's deploy cadence
- **Goal:** Run a complete regression cycle in one focused session
- **Delight trigger:** Keyboard shortcuts that eliminate mouse navigation

### 3.2 Secondary — Engineering Manager

Technical leads who need visibility into QA coverage without attending every standup. They check dashboards, review run summaries, and monitor pass-rate trends.

- **Pain:** No single-glance view of where QA stands vs. the release
- **Goal:** Confidence that the release is safe to ship
- **Delight trigger:** A live run dashboard that updates in real time

### 3.3 Tertiary — Developer

Engineers who consume test results via integrations — GitHub PR checks, Slack notifications, or CI pipeline annotations. They do not create tests but act on failures.

- **Pain:** Test results buried in a separate portal they never log into
- **Goal:** Failure context delivered to where they already work
- **Delight trigger:** A Slack message with a direct link to the failed step

---

## 4. Design Principles

**Lean by Default**
Every feature added must remove at least as much friction as it introduces. If a configuration option can be sensibly defaulted, it should be. Velo ships opinionated, not empty.

**Speed First**
All operations must complete in under 300ms. The test case editor opens instantly. Runs update in real time. Nothing waits for a full page reload.

**Convention over Configuration**
New projects come with sensible defaults: a default suite structure, keyboard shortcuts enabled, standard result states. Teams customise when they need to, not as a prerequisite to getting started.

**Maximum 3 Clicks to Any Data**
A QA engineer must be able to reach any test case, run, or defect from any screen in three clicks or fewer. Navigation is structural, not search-dependent.

**Test-first, Not Process-first**
Velo organises around tests and runs, not requirements or workflows. Process layers (milestones, tags, coverage metrics) exist but never block the core loop.

**Open API, Flat Pricing**
Every feature available in the UI is accessible via API. Pricing is flat per workspace tier, not per seat — so growing teams are never penalised for adding people.

---

## 5. Pricing Model

Velo's core differentiator against every incumbent: flat workspace pricing. Viewers are always free and unlimited across all tiers.

| Tier | Price | Seats / Capacity | Key Features |
|---|---|---|---|
| Free | $0/month | 3 editors, 1 project, 500 test cases | Forever free. No credit card. |
| Starter | $49/month | 10 editors, 5 projects, unlimited cases | CI/CD, Jira, GitHub, Slack, REST API |
| Growth | $149/month | Unlimited editors & projects | AI features, custom dashboards, SSO |
| Enterprise | Custom | Unlimited everything | SAML, audit log, SLA, dedicated support |

Editors = users who can create/edit test cases and run tests. Viewers = unlimited read-only access on all tiers.

---

## 6. Feature Specification

### 6.1 P0 — Launch Blockers (Must Ship)

| ID | Feature | Description |
|---|---|---|
| TC-01 | Test Case Editor | Inline keyboard-first editor. Bulk import via CSV/Excel. Steps, expected results, attachments. |
| TC-02 | Suite & Folder Structure | Nested suites, drag-and-drop reordering, bulk move/copy. |
| TR-01 | Test Run Creation | Create runs from suites, filters, or milestone scope. Assign to individual or team. |
| TR-02 | Execution Interface | One-click Pass / Fail / Blocked / Skipped. Keyboard shortcuts (P/F/B/S). Inline defect filing. |
| IN-01 | Automated Result Ingestion | JUnit XML and Allure JSON ingestion via API or CI push. Auto-maps to test cases. |
| DA-01 | Live Run Dashboard | Real-time progress bar, pass rate, time-to-complete estimate. Auto-refreshes. |
| API-01 | REST API & Webhooks | Full parity with UI. Webhooks on run complete, case fail, milestone reached. |
| INT-01 | Jira Integration | Two-way sync: file defects in Jira from Velo; see Jira status back in Velo run view. |
| USR-01 | Team & Role Management | Admin, Editor, Viewer. Project-level permission overrides. |

### 6.2 P1 — High Value (Ship within 60 days of launch)

| ID | Feature | Description |
|---|---|---|
| TC-03 | Test Case Templates | Reusable step templates per project. Import from library. |
| DA-02 | Coverage & Trend Reports | Pass rate over time, flaky test surface, coverage by suite/milestone. |
| INT-02 | GitHub / GitLab Integration | PR status checks from automated run results. Commit-linked run creation. |
| INT-03 | Slack / Teams Notifications | Run complete, run failed, milestone due — configurable per project. |
| AI-01 | AI Test Case Generation | Generate test cases from Jira tickets, requirements text, or OpenAPI spec via Claude API. |
| COL-01 | Comments & Activity Feed | Per-run and per-case comment threads. Full audit trail of all changes. |

### 6.3 P2 — Growth Features (Post-PMF)

| ID | Feature | Description |
|---|---|---|
| DA-03 | Custom Dashboards | Drag-and-drop widget builder. Export to PDF. |
| INT-04 | Linear Integration | Defect sync for teams using Linear instead of Jira. |
| AI-02 | Failure Analysis Assistant | AI-powered pattern detection across recent failures. Surfaces flaky vs. regression failures. |

### 6.4 Non-Goals (V1)

- No built-in test automation engine
- No requirements management module
- No time tracking or budget tracking
- No built-in bug tracker (Jira/Linear integration only)
- No custom workflow builder
- No on-premises or self-hosted deployment
- No advanced compliance modules (21 CFR, FDA, ISO 13485)
- No native mobile app

---

## 7. Core Data Model

All entities are UUID-keyed with UTC timestamps. The model is designed to be simple enough to query directly but rich enough to power all dashboard and reporting features without denormalisation.

| Entity | Key Fields |
|---|---|
| Workspace | UUID, name, slug, plan_tier, created_at |
| Project | UUID, workspace_id, name, key (e.g. VELO), archived |
| Suite | UUID, project_id, parent_suite_id (self-ref), name, position |
| TestCase | UUID, suite_id, title, preconditions, steps[], priority, tags[], created_by, updated_at |
| TestRun | UUID, project_id, name, status, milestone_id, created_by, started_at, completed_at |
| RunItem | UUID, run_id, test_case_id, status (pass/fail/blocked/skipped), assignee, comment, duration_ms |
| Defect | UUID, run_item_id, external_ref (Jira/Linear), title, status, filed_by |
| Milestone | UUID, project_id, name, due_date, status |

---

## 8. Design Language

Velo's visual identity is informed by the Notion / Craft school of design: light, spatial, warm, and human — explicitly not the dark-mode, ultra-dense aesthetic of Linear or Raycast. The product should feel like a well-designed notebook, not a cockpit.

### 8.1 Design Principles

**Light & Spatial**
Default to a light interface with generous white space. Dark mode is a V2 feature. The background is warm off-white (`#F8FAFC`), not pure white — warmer greys replace harsh blacks throughout.

**Human, Not Enterprise**
Typography is friendly but sharp. Inter's generous x-height and wide character spacing reduce reading fatigue for engineers who live in the tool all day. Rounded corners (6–8px) on cards and inputs signal approachability.

**Status Colours With Intention**
Most QA tools use traffic-light colours that feel like a hospital dashboard. Velo uses a more refined palette: muted sage for pass, warm coral for fail, amber for blocked. No competitor in the space owns this — it is a differentiator.

**Motion With Purpose**
Micro-interactions confirm user intent without being distracting. Shimmer loading states replace blank placeholders. Soft fade-ins appear when run data updates. Hover states on cards elevate 1–2px with a subtle shadow.

**Maximum Information Density**
A QA engineer running 200 test cases needs density. Cards and tables are compact but breathe. The minimum row height in a test run table is 40px — tight enough to show many cases but readable enough to scan status colours instantly.

### 8.2 Colour System

Base palette is neutral greys and warm off-whites. A single brand accent (Cobalt) is used for primary actions. Semantic colours are reserved exclusively for status states.

| Token | Hex | Usage |
|---|---|---|
| Cobalt | `#2563EB` | Primary CTA, active states, links, brand identity |
| Slate | `#1E293B` | Headings, primary text, near-black — warmer than pure black |
| Mist | `#F8FAFC` | Page background — warm off-white, not pure white |
| Gray Mid | `#64748B` | Secondary text, metadata, placeholders |
| Gray Light | `#E2E8F0` | Dividers, borders, input outlines |
| Pass Green | `#16A34A` | Test pass state — muted sage, calm confidence |
| Fail Red | `#DC2626` | Test fail state — warm coral, readable not alarming |
| Blocked Amber | `#D97706` | Blocked state — warm amber, attention without panic |
| Skipped Slate | `#94A3B8` | Skipped state — cool neutral, de-emphasised |

> Never use raw hex values in code. Reference tokens only (e.g. `--color-pass`, `--color-fail`). This ensures status colours can be updated globally without a codebase search.

### 8.3 Typography

Inter is the primary typeface throughout — the same choice as Notion, GitHub, and Vercel. It was designed specifically for screen readability and renders cleanly at small sizes across all platforms. JetBrains Mono is used exclusively for code, IDs, and technical strings.

| Scale | Weight | Size / Line-Height | Used For |
|---|---|---|---|
| Display | Inter 700 | 36px / 40px | Product name, hero statements |
| H1 | Inter 700 | 28px / 32px | Page titles, section headers |
| H2 | Inter 600 | 22px / 28px | Sub-section titles, card headers |
| H3 | Inter 600 | 18px / 24px | Group labels, sidebar section names |
| Body | Inter 400 | 14px / 20px | All paragraph text, test case descriptions |
| Body Small | Inter 400 | 12px / 16px | Metadata, timestamps, secondary labels |
| Label | Inter 500 | 12px / 16px | Form labels, table headers, badges |
| Mono | JetBrains Mono 400 | 13px / 18px | Code snippets, API keys, test IDs |

### 8.4 Spacing System

All spacing is based on a 4px base unit. This produces a consistent visual rhythm and maps cleanly to Tailwind's default scale.

| Value | Token | Common Use |
|---|---|---|
| 4px | xs | Icon padding, tight inline gaps |
| 8px | sm | Chip padding, compact list items |
| 12px | md-sm | Input field padding horizontal |
| 16px | md | Card internal padding, form field vertical |
| 24px | lg | Card-to-card gap, section padding |
| 32px | xl | Page section spacing |
| 48px | 2xl | Major layout section breaks |

### 8.5 Component Guidelines

**Buttons**
- Primary: Cobalt fill, white label, 6px radius, 12px vertical / 20px horizontal padding
- Secondary: White fill, Cobalt border (1px), Cobalt label
- Destructive: Fail Red fill, white label — only for irreversible actions
- Ghost: No fill or border, Slate label — for sidebar actions and icon-only controls
- All states: hover darkens fill by 8%, active darkens by 16%, disabled at 40% opacity

**Cards**
- Background: white (`#FFFFFF`), not Mist — cards lift off the page background
- Border: 1px solid Gray Light (`#E2E8F0`)
- Border radius: 8px
- Shadow: `0 1px 3px rgba(0,0,0,0.06)` resting, `0 4px 12px rgba(0,0,0,0.10)` on hover
- Internal padding: 16px (md) on all sides

**Form Inputs**
- Height: 36px for standard inputs, 32px for compact/table-embedded inputs
- Border: 1px solid Gray Light, transitions to Cobalt on focus (2px outline, 2px offset)
- Placeholder: Gray Mid (`#64748B`), never Gray Light
- Error state: Fail Red border + red helper text below — never just a red border alone

**Status Badges**
Pill-shaped (full border-radius), 12px font, colour fill at 15% opacity with text in the full colour.

| State | Background | Text |
|---|---|---|
| PASS | `#DCFCE7` | `#16A34A` |
| FAIL | `#FEE2E2` | `#DC2626` |
| BLOCKED | `#FEF3C7` | `#D97706` |
| SKIPPED | `#F1F5F9` | `#94A3B8` |

### 8.6 Navigation Structure

Persistent left sidebar (240px wide, collapsible to 48px icon rail) with a top bar for workspace/project context switching. Maximum nesting depth is two levels — no infinite accordion navigation.

- Sidebar sections: Projects, Test Cases, Test Runs, Reports, Integrations, Settings
- Active state: Cobalt left border (3px) + Cobalt tinted row background (5% opacity)
- Hover state: Gray Light background, no border change
- Collapsed state: Icons only, tooltips on hover

### 8.7 Motion & Micro-Interactions

- **Loading states:** Skeleton shimmer (animated gradient sweep, 1.2s loop) — never blank space
- **Data updates (live run):** Soft fade-in at 200ms for new rows and counter updates
- **Page transitions:** 150ms ease-out fade — fast enough to feel instant, present enough to orient
- **Card hover:** `translateY(-1px)` + shadow increase, 120ms ease
- **Button press:** `scale(0.98)` + darken fill, 80ms — tactile confirmation
- **Toast notifications:** Slide in from bottom-right, 250ms ease-out, auto-dismiss at 4s

---

## 9. Brand Messaging

Velo's messaging is built around two truths: QA belongs in the chain from day one, and the tools should prove it. Every line of copy leads with the belief, then earns it with the concrete promise.

### Tagline

> *"Your team moves fast. Your QA should too."*

Chosen because it speaks directly to the lived frustration of QA engineers who have personally experienced QA lagging behind the team. It creates tension — and the hero copy releases it.

### Hero Copy

**Headline (the belief)**

> *"QA doesn't belong at the end of the line. It belongs in the chain from day one."*

The philosophical line. It speaks to the engineering manager thinking about team culture and process, and to the QA engineer who has felt like a gatekeeper instead of a contributor. It also ties directly to the logo mark — two equal links in a chain, neither dragging the other.

**Subheadline (the proof)**

> *"30 seconds to a test case. Live run tracking. Zero surprises on release day."*

Three concrete promises, each a single clause. The first two describe features; the third lands on the feeling — the thing the QA engineer actually wants on a Friday afternoon before a release. Short clauses hit harder than sentences here.

### Messaging Principles

- **Belief first, proof second.** The headline earns trust; the subheadline delivers specifics. Never lead with features.
- **Speak to two people at once.** The engineering manager reads the headline and thinks about process. The QA engineer reads the subheadline and thinks about Tuesday morning. Same page, different entry points.
- **No enterprise language.** Never "robust", "scalable", "enterprise-grade", or "leverage". Velo talks like a senior engineer, not a sales deck.
- **The chain is the metaphor.** Use it sparingly and let the logo do the work. When copy references connection, velocity, or links — it reinforces the mark without explaining it.

---

## 10. Tech Stack

The stack is chosen for developer experience, operational simplicity, and a clean security posture. Velo explicitly avoids tools with recent critical CVEs, SSPL licence changes, or vendor lock-in that punishes future scaling.

| Layer | Primary Choice | Alternative | Rationale |
|---|---|---|---|
| Frontend | SvelteKit 2 + TypeScript + Tailwind CSS | Next.js 16.1 Pages Router only | 50–70% smaller bundles vs React; zero RSC attack surface; #1 dev satisfaction |
| Backend API | Node.js 22 LTS + Fastify 5 | Hono (edge/Cloudflare Workers) | Battle-tested plugin ecosystem; rate limiting; OpenTelemetry built-in |
| Database | PostgreSQL 16 + Valkey (Redis fork) | — | Valkey replaces Redis (SSPL licence issue, March 2024) |
| Search | PostgreSQL FTS (V1) → Typesense (V2) | — | Zero infra for V1; Typesense for relevance tuning at scale |
| File Storage | Cloudflare R2 | — | Zero egress fees vs S3 — significant cost at scale |
| Auth | Clerk | Auth.js v5 | Clerk: managed SAML, passkeys; Auth.js: open-source, more setup |
| Hosting | Fly.io or Railway | — | Fly.io: true multi-region with persistent volumes |
| CI/CD | GitHub Actions | — | Standard; integrates with all major deployment targets |
| Observability | Sentry + Better Stack | — | Better Stack bundles logs + uptime monitoring in one tool |
| AI Features | Anthropic Claude API | — | `claude-sonnet-4-6` / `claude-haiku-4-5` for test generation and failure analysis |

### 10.1 Security Notes

- **Next.js App Router (RSC):** CVE-2025-55182 (CVSS 10.0 RCE) — use Pages Router only or SvelteKit
- **Redis SSPL licence change** March 2024 — replace with Valkey or Upstash
- **Dependency supply chain:** Bun/pnpm lockfiles + Dependabot or Socket.dev in CI
- **Container hardening:** `node:22-alpine` base, pinned image digests, Trivy in CI pipeline
- **Auth token security:** Clerk (PKCE enforced); Auth.js v5 also implements PKCE

---

## 11. Launch Roadmap

| Phase | Timeline | Name | Key Deliverables |
|---|---|---|---|
| Phase 1 | Weeks 1–4 | Foundation | Repo, CI/CD, auth, DB schema, design system tokens, component library |
| Phase 2 | Weeks 5–10 | Core MVP | Test case editor, suite structure, run creation, execution interface, REST API |
| Phase 3 | Weeks 11–14 | Integrations | JUnit/Allure ingestion, Jira two-way sync, Slack notifications, GitHub PR checks |
| Phase 4 | Weeks 15–18 | AI & Polish | AI test generation (Claude API), live dashboard, reports, onboarding flow |
| Phase 5 | Weeks 19–24 | Growth | Custom dashboards, Linear integration, SSO, billing, public beta |
| Phase 6 | Months 7–12 | Scale | Failure analysis AI, mobile-responsive polish, enterprise SAML, audit log |

---

## 12. Success Metrics

| Metric | Target | Measurement Window |
|---|---|---|
| Time to First Run | <5 min from signup to first completed test run | Month 3 |
| Weekly Active Rate | >60% of registered editors active in past 7 days | Month 6 |
| Case Creation Speed | Median <45 seconds per test case (P50) | Month 3 |
| Integration Adoption | >70% of paid workspaces have at least one integration connected | Month 6 |
| NPS | >50 | Month 6 |
| Monthly Churn | <4% on paid tiers | Month 9 |
| API Usage | >40% of workspaces make at least one API call per month | Month 6 |

---

## 13. Open Questions

The following decisions require owner assignment and resolution before development begins. Each question has downstream impact on architecture, pricing, or launch scope.

| ID | Question |
|---|---|
| OQ-01 | Flaky test detection — P0 launch blocker or P1 post-launch feature? |
| OQ-02 | Cross-project test case library: shared suite on day one or V2? |
| OQ-03 | Storage limits per tier for attachments (screenshots, logs)? |
| OQ-04 | AI test generation: available from Starter tier or Growth only? |
| OQ-05 | TestRail / Qase migration importer: launch tool or post-launch? |
| OQ-06 | Self-serve billing (Stripe) or sales-assisted for all paid tiers? |
| OQ-07 | SvelteKit vs Next.js Pages Router — final frontend call needed before sprint 1 |
| OQ-08 | Fly.io vs Railway hosting: evaluate persistent volume support for Postgres |
| OQ-09 | Domain strategy: velo.dev vs getvelo.io vs usevelo.com |
| OQ-10 | Trademark search required on "Velo" before brand asset production |
| OQ-11 | Explorer mode (unstructured exploratory testing sessions) — V1 or V2? |
| OQ-12 | Mobile-responsive run execution (tablet/iPad) — in scope for V1? |

*Owner and decision deadline to be assigned in sprint planning session.*
