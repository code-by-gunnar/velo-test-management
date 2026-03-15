# V1 Feature Backlog

Features to consider before/after launch. Ordered by value, not effort.

## Pre-Launch (Infrastructure)

- [ ] **Sentry integration** — error tracking on API (Fastify) + frontend (Next.js). Catches bugs before users report them.
- [ ] **Amplitude or PostHog** — product analytics. Feature usage, drop-off points, signup funnel. Essential for pricing tier validation.

## Pre-Launch (Features)

- [ ] **Test case tagging/labels** — "Smoke", "Regression", "P1", etc. Filter cases by tag when creating a run. Low effort, high value.
- [ ] **Duplicate/clone test case** — right-click → duplicate. Saves time creating similar cases.
- [ ] **Bulk actions on test runs** — select multiple cases, mark all as pass/skip/blocked. Common during regression.

## Post-Launch (V1.x)

- [ ] **Test case edit history** — who changed what and when. Simple audit trail on the case panel.
- [ ] **Run comparison** — side-by-side pass/fail diff of two runs. "What changed between Sprint 11 and Sprint 12?"
- [ ] **Pricing tier enforcement** — free tier limits (users, runs, projects), upgrade prompts at natural trigger points.
- [ ] **Payment integration** — Polar.sh or Paddle for subscription billing.

## Deferred (V2 — based on user feedback)

- [ ] **Jira integration** — expand addressable market beyond Linear-only teams.
- [ ] **Custom fields on test cases** — user-defined fields (text, dropdown, date).
- [ ] **Test plan templates** — save a run configuration (suite selection, assignees) as a reusable template.
- [ ] **Slack notifications** — run completed, defect logged, case failed.
- [ ] **Flakiness scoring** — track cases that flip between pass/fail across runs. Flag unreliable tests.
- [ ] **API documentation page** — interactive REST API reference (already have v1 routes, just need the docs UI).
- [ ] **SSO (SAML/OIDC)** — required for Pro tier. Implement when first enterprise prospect asks.
- [ ] **Audit log** — who did what, when. Required for Pro tier.
